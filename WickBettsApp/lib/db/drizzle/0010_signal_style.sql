-- 0010: Signal "style" (Swing / Buy & Hold / LEAPS) so admins can publish
-- long-term buy-and-hold theses and long-dated LEAPS options alongside the
-- existing short-hold swing setups. Idempotent (IF NOT EXISTS /
-- duplicate_object guards) so it's safe to re-run.
DO $$ BEGIN
  CREATE TYPE "public"."signal_style" AS ENUM('Swing', 'Buy & Hold', 'LEAPS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "style" "signal_style" DEFAULT 'Swing' NOT NULL;--> statement-breakpoint
-- Buy & Hold signals intentionally carry no hard stop-loss — the column was
-- NOT NULL for the original swing-only signal shape; loosen it so those rows
-- can omit a stop. Existing rows already have a value and are unaffected.
ALTER TABLE "signals" ALTER COLUMN "stop" DROP NOT NULL;
