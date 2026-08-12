CREATE TABLE IF NOT EXISTS "watchlists" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "symbol" text NOT NULL,
  "note" text,
  "target_price" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "watchlists_user_id_idx" ON "watchlists" ("user_id");
CREATE INDEX IF NOT EXISTS "watchlists_symbol_idx" ON "watchlists" ("symbol");