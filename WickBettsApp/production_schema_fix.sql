-- Wick Betts production schema fix — run once in Railway's Postgres Console
-- (Postgres service -> Data/Console tab). Safe to run even if some pieces
-- already exist, thanks to IF NOT EXISTS / exception guards below.

-- 1. Signals: new columns for the automated signal scanner (source, news alert star)
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS news_alert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS news_alert_note text;

-- 2. Watchlists: table was never created in production — GET /api/watchlist
--    has been failing with "relation watchlists does not exist"
CREATE TABLE IF NOT EXISTS watchlists (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  note text,
  target_price text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 3. News overrides: same issue — table never created, admin news edits
--    (GET /api/news/feed) have been failing silently in the background
CREATE TABLE IF NOT EXISTS news_overrides (
  id text PRIMARY KEY,
  source_article_id text NOT NULL UNIQUE,
  headline text,
  summary text,
  category text,
  source text,
  url text,
  published_at text,
  updated_by text REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
