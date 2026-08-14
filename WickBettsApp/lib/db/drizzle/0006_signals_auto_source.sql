-- 0006: Add automated-signal-scanner columns to the signals table.
-- All statements are idempotent (IF NOT EXISTS) so this can safely re-run
-- against a database that already has the columns (e.g. this one was
-- already applied by hand to production on 2026-08-14 to unblock a live
-- outage caused by 0004/0005 never being wired into the migration journal).
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "news_alert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "news_alert_note" text;
