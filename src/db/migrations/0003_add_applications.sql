-- Run this ONCE against your existing (already-deployed) database:
--   wrangler d1 execute immigration_bot_db --remote --file=./src/db/migrations/0003_add_applications.sql
--
-- If you're setting up the database for the very first time, you don't need
-- this file — the main schema.sql already includes the `applications` table.
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matched_position_id INTEGER NOT NULL REFERENCES matched_positions(id),
  chat_id INTEGER NOT NULL REFERENCES students(chat_id),

  university TEXT,
  country TEXT,
  field TEXT,
  professor_name TEXT,
  professor_email TEXT,
  funding_info TEXT,
  details_source TEXT,

  cover_letter TEXT,
  email_draft TEXT,

  application_status TEXT NOT NULL DEFAULT 'draft',

  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_notified_at TEXT,
  sent_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_chat ON applications(chat_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_applications_matched_position ON applications(matched_position_id);
