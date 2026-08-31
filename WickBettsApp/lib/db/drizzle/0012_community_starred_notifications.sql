-- 0012: Adds signals.community_starred (Community tab "featured signals"
-- flag), users.last_seen_notifications_at (drives the notification bell's
-- unread badge), and the notifications table (in-app alert feed).
--
-- These were pushed via `drizzle-kit push --force` in a prior deploy's
-- preDeployCommand, but never actually applied to production: push's
-- rename/create-ambiguity resolver requires an interactive TTY and crashed
-- (Error: Interactive prompts require a TTY terminal) before reaching these
-- statements, while the deploy itself still went on to start the app
-- container regardless — so the app ran for a while against a database
-- silently missing these columns, breaking every signals read/update
-- ("column community_starred does not exist") and the notifications feed.
--
-- This migration applies them via the app's own startup migrate() call
-- instead (src/index.ts), which only ever runs plain, non-interactive SQL —
-- the same mechanism that already reliably applies 0000-0011. Idempotent
-- (IF NOT EXISTS everywhere) so it's safe to re-run if it's ever re-applied.
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "community_starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_notifications_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'signal' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
