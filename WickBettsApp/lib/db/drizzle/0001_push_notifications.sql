-- 0001: Add Expo push notification columns to the users table.
-- All statements are idempotent (IF NOT EXISTS) so this can safely re-run
-- against a database that already has the columns.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_signals" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_news" boolean NOT NULL DEFAULT false;
