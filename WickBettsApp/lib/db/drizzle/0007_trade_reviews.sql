-- 0007: "Review My Trade" — member-submitted chart screenshots reviewed
-- instantly by Claude. Idempotent (IF NOT EXISTS / duplicate_object guards)
-- so it's safe to re-run.
DO $$ BEGIN
  CREATE TYPE "public"."trade_bias" AS ENUM('Bullish', 'Bearish', 'Neutral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."trade_review_verdict" AS ENUM('Agrees', 'Disagrees', 'Mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"image_data_url" text NOT NULL,
	"description" text NOT NULL,
	"bias" "trade_bias" NOT NULL,
	"ai_technical_read" text NOT NULL,
	"ai_verdict" "trade_review_verdict" NOT NULL,
	"ai_bias_explanation" text NOT NULL,
	"ai_risk_note" text NOT NULL,
	"ai_summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trade_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_author_id_idx" ON "trade_reviews" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_created_at_idx" ON "trade_reviews" USING btree ("created_at");
