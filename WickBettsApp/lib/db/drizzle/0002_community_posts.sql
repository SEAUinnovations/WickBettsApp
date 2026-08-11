-- 0002: Add community_posts table for the shared member feed.
-- DO/EXCEPTION blocks handle the case where drizzle-kit push already applied
-- these objects in the development database.
DO $$ BEGIN
  CREATE TYPE "public"."community_thread" AS ENUM('Signals', 'News', 'Community Chat');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_posts" (
"id" text PRIMARY KEY NOT NULL,
"thread" "community_thread" DEFAULT 'Community Chat' NOT NULL,
"author_id" text NOT NULL,
"text" text NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
