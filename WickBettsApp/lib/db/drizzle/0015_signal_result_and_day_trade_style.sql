-- 0015: Fix schema drift that broke publishing/loading signals and left the
-- scoreboard permanently empty.
--
-- Two things were added to src/schema/signals.ts without ever generating a
-- migration for them:
--   1. "Day Trade" was added to the signal_style enum's TS definition, but
--      the Postgres enum type (created back in 0010_signal_style.sql) was
--      never altered to match — so every automated Day Trade scan insert
--      (services/signalScanner.ts's runDayTradeScan) failed with
--      "invalid input value for enum signal_style: \"Day Trade\"".
--   2. The whole scoreboard column set (resultTag/resultSource/resultPercent/
--      resultCheckedAt/resultCheckedPrice/resultNote) and the signal_result
--      enum were added to signalsTable, but the live "signals" table was
--      never altered to add them — so any plain `db.select().from(signalsTable)`
--      (GET /api/signals, the admin list refresh, GET /community-starred, the
--      before/after reads inside PATCH /:id) failed with
--      "column \"result_tag\" does not exist". That's why publishing a signal
--      could appear to succeed (the POST insert doesn't touch those columns)
--      while the list never refreshed to show it.
ALTER TYPE "public"."signal_style" ADD VALUE IF NOT EXISTS 'Day Trade';--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."signal_result" AS ENUM('Pending', 'Green', 'Missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_tag" "signal_result" DEFAULT 'Pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_source" text;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_percent" real;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_checked_price" text;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "result_note" text;
