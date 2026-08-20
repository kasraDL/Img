-- Run this ONCE against your existing (already-deployed) database:
--   wrangler d1 execute immigration_bot_db --remote --file=./src/db/migrations/0002_add_language.sql
--
-- If you're setting up the database for the very first time, you don't need
-- this file — the main schema.sql already includes the `language` column.
ALTER TABLE students ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
