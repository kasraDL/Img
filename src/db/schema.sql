-- Students, one row per Telegram chat
CREATE TABLE IF NOT EXISTS students (
  chat_id INTEGER PRIMARY KEY,
  telegram_username TEXT,
  first_name TEXT,
  language TEXT NOT NULL DEFAULT 'en', -- 'en' | 'fa' — UI language, auto-detected then user-settable via /language
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every CV a student ever uploads, plus the AI-extracted profile from it.
-- Keeping every upload (not overwriting) is what makes this a "history".
CREATE TABLE IF NOT EXISTS cv_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES students(chat_id),
  r2_key TEXT NOT NULL,               -- where the raw PDF lives in R2
  raw_text TEXT,                      -- extracted plain text
  profile_json TEXT,                  -- structured background: degrees, field, GPA, papers, skills, languages...
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The target degree level(s) the student is currently searching for.
-- Stored per-search so a student can run several searches over time
-- (e.g. Master search this month, PhD search next year).
CREATE TABLE IF NOT EXISTS search_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES students(chat_id),
  cv_history_id INTEGER NOT NULL REFERENCES cv_history(id),
  degree_level TEXT NOT NULL,         -- 'bachelor' | 'master' | 'phd'
  field_hint TEXT,                    -- optional free-text refinement from the student
  country_hint TEXT,                  -- optional preferred country/region
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Positions found for a given search request, ranked by match %.
CREATE TABLE IF NOT EXISTS matched_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_request_id INTEGER NOT NULL REFERENCES search_requests(id),
  title TEXT NOT NULL,
  institution TEXT,
  country TEXT,
  url TEXT NOT NULL,
  source_site TEXT,                   -- e.g. findaphd.com, euraxess.ec.europa.eu
  deadline TEXT,
  match_percentage INTEGER,           -- 0-100, from the AI matching step
  match_reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'shortlisted' | 'applied' | 'dismissed'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generated application documents (motivation letters, emails, SOPs) per position.
CREATE TABLE IF NOT EXISTS generated_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matched_position_id INTEGER NOT NULL REFERENCES matched_positions(id),
  doc_type TEXT NOT NULL,             -- 'motivation_letter' | 'email' | 'sop'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extra sources a student wants checked alongside the built-in site search.
-- 'telegram_channel' entries are auto-checked (free, via the public t.me/s/
-- preview page). 'linkedin_page' entries are stored for reference only — see
-- src/services/linkedin.ts for why LinkedIn can't be auto-checked for free —
-- and are just surfaced back to the student as a reminder to check manually.
CREATE TABLE IF NOT EXISTS monitored_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES students(chat_id),
  source_type TEXT NOT NULL,          -- 'telegram_channel' | 'linkedin_page'
  identifier TEXT NOT NULL,           -- channel username (no @) or LinkedIn page URL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cv_history_chat ON cv_history(chat_id);
CREATE INDEX IF NOT EXISTS idx_search_requests_chat ON search_requests(chat_id);
CREATE INDEX IF NOT EXISTS idx_matched_positions_search ON matched_positions(search_request_id);
CREATE INDEX IF NOT EXISTS idx_monitored_sources_chat ON monitored_sources(chat_id);

-- The real application tracker: one row per position the student is actively
-- pursuing (created the first time they generate a letter or email for a
-- matched_position). This is what /report exports to Excel and what the
-- 10-day reminder cron reads.
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
  details_source TEXT,                 -- 'page' | 'student' | null — where professor/funding info came from,
                                        -- never fabricated by the AI

  cover_letter TEXT,
  email_draft TEXT,

  application_status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'ready' | 'sent' | 'replied' | 'rejected' | 'accepted' | 'withdrawn'

  reminder_count INTEGER NOT NULL DEFAULT 0,   -- how many follow-up emails the student has sent
  last_reminder_notified_at TEXT,              -- last time the bot pinged the student about following up
  sent_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_chat ON applications(chat_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_applications_matched_position ON applications(matched_position_id);
