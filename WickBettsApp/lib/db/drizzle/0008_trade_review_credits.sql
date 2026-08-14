-- 0008: Paid overage credits for Review My Trade (4 free per rolling 7-day
-- window, $2.50 each after that). Idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "extra_trade_review_credits" integer DEFAULT 0 NOT NULL;
