-- 0013: Adds trade_reviews.symbol — the ticker a "Review My Trade" submission
-- is about. Mandatory on every NEW submission (enforced in
-- POST /api/trade-reviews, not at the column level) so the Community tab
-- can label each card with its ticker + icon; nullable here only so
-- pre-existing reviews (submitted before this field existed) don't need a
-- backfill value and just render without a ticker label.
ALTER TABLE "trade_reviews" ADD COLUMN IF NOT EXISTS "symbol" text;
