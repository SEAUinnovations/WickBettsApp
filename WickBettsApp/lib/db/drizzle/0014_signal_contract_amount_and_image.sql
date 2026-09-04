ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "contract_amount" integer NOT NULL DEFAULT 1;
ALTER TABLE "signals" ADD COLUMN IF NOT EXISTS "analysis_image_data_url" text;
