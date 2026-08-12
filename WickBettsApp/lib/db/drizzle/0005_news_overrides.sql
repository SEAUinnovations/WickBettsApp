CREATE TABLE IF NOT EXISTS "news_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "source_article_id" text NOT NULL UNIQUE,
  "headline" text,
  "summary" text,
  "category" text,
  "source" text,
  "url" text,
  "published_at" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "news_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "news_overrides_source_article_id_idx" ON "news_overrides" ("source_article_id");