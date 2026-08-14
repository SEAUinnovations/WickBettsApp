-- 0011: Member-shared signals + follows. Members can post their own trade
-- ideas (separate from the admin-curated `signals` table — these never
-- appear in the paid /signals feed) and follow other members to see their
-- future shares in a personalized feed. Idempotent (IF NOT EXISTS /
-- duplicate_object guards) so it's safe to re-run. Reuses the existing
-- "market" and "direction" enum types created in 0000.
DO $$ BEGIN
  CREATE TYPE "public"."community_signal_status" AS ENUM('Open', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"asset" text NOT NULL,
	"market" "market" NOT NULL,
	"direction" "direction" NOT NULL,
	"entry" text NOT NULL,
	"target" text NOT NULL,
	"stop" text,
	"note" text NOT NULL,
	"status" "community_signal_status" DEFAULT 'Open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_signals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_signals_author_id_idx" ON "community_signals" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_signals_created_at_idx" ON "community_signals" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "member_follows" (
	"id" text PRIMARY KEY NOT NULL,
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "member_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_follows_follower_following_idx" ON "member_follows" USING btree ("follower_id","following_id");
