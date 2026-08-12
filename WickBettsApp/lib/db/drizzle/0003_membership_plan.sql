-- 0003: Add 'membership' to the subscription plan enum.
-- This statement is idempotent for existing databases where the value may
-- already have been added manually.
ALTER TYPE "plan" ADD VALUE IF NOT EXISTS 'membership';
