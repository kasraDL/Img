import type {
  StudentProfile,
  DegreeLevel,
  MatchedListing,
  SourceType,
  MonitoredSource,
  PositionStatus,
  MatchedPositionWithContext,
  ApplicationRecord,
  ApplicationStatus,
  PositionDetails,
} from "../types";
import type { Lang } from "../services/i18n";

export async function upsertStudent(
  db: D1Database,
  chatId: number,
  username?: string,
  firstName?: string,
  initialLanguage: Lang = "en"
) {
  // ON CONFLICT deliberately does NOT touch `language` - once set (by this
  // insert, or later via /language), we never silently overwrite the
  // student's choice on a later message.
  await db
    .prepare(
      `INSERT INTO students (chat_id, telegram_username, first_name, language)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         telegram_username = excluded.telegram_username,
         first_name = excluded.first_name,
         updated_at = datetime('now')`
    )
    .bind(chatId, username ?? null, firstName ?? null, initialLanguage)
    .run();
}

export async function getStudentLanguage(db: D1Database, chatId: number): Promise<Lang> {
  const row = await db
    .prepare(`SELECT language FROM students WHERE chat_id = ?`)
    .bind(chatId)
    .first<{ language: string }>();
  return (row?.language as Lang) ?? "en";
}

export async function setStudentLanguage(db: D1Database, chatId: number, lang: Lang): Promise<void> {
  await db
    .prepare(`UPDATE students SET language = ?, updated_at = datetime('now') WHERE chat_id = ?`)
    .bind(lang, chatId)
    .run();
}

export async function insertCvHistory(
  db: D1Database,
  chatId: number,
  r2Key: string,
  rawText: string,
  profile: StudentProfile
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO cv_history (chat_id, r2_key, raw_text, profile_json) VALUES (?, ?, ?, ?)`
    )
    .bind(chatId, r2Key, rawText, JSON.stringify(profile))
    .run();
  return result.meta.last_row_id as number;
}

export async function getCvHistory(
  db: D1Database,
  cvHistoryId: number
): Promise<{ profile: StudentProfile; raw_text: string } | null> {
  const row = await db
    .prepare(`SELECT profile_json, raw_text FROM cv_history WHERE id = ?`)
    .bind(cvHistoryId)
    .first<{ profile_json: string; raw_text: string }>();
  if (!row) return null;
  return { profile: JSON.parse(row.profile_json) as StudentProfile, raw_text: row.raw_text };
}

export async function getLatestCvHistoryId(db: D1Database, chatId: number): Promise<number | null> {
  const row = await db
    .prepare(`SELECT id FROM cv_history WHERE chat_id = ? ORDER BY id DESC LIMIT 1`)
    .bind(chatId)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function insertSearchRequest(
  db: D1Database,
  chatId: number,
  cvHistoryId: number,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO search_requests (chat_id, cv_history_id, degree_level, field_hint, country_hint)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(chatId, cvHistoryId, degreeLevel, fieldHint, countryHint ?? null)
    .run();
  return result.meta.last_row_id as number;
}

/** Inserts every listing and returns the new matched_positions.id for each, same order as the input. */
export async function insertMatchedPositions(
  db: D1Database,
  searchRequestId: number,
  listings: MatchedListing[]
): Promise<number[]> {
  const stmt = db.prepare(
    `INSERT INTO matched_positions
       (search_request_id, title, institution, country, url, source_site, deadline, match_percentage, match_reasoning)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = listings.map((l) =>
    stmt.bind(
      searchRequestId,
      l.title,
      l.institution ?? null,
      l.country ?? null,
      l.url,
      l.source_site ?? null,
      l.deadline ?? null,
      l.match_percentage,
      l.match_reasoning
    )
  );
  const results = await db.batch(batch);
  return results.map((r) => r.meta.last_row_id as number);
}

export interface StoredMatchedPosition {
  id: number;
  title: string;
  institution: string | null;
  country: string | null;
  url: string;
  source_site: string | null;
  match_percentage: number;
  match_reasoning: string | null;
  status: PositionStatus;
}

export async function getLatestMatchedPositions(
  db: D1Database,
  chatId: number
): Promise<StoredMatchedPosition[]> {
  const latestRequest = await db
    .prepare(`SELECT id FROM search_requests WHERE chat_id = ? ORDER BY id DESC LIMIT 1`)
    .bind(chatId)
    .first<{ id: number }>();
  if (!latestRequest) return [];

  const { results } = await db
    .prepare(
      `SELECT id, title, institution, country, url, source_site, match_percentage, match_reasoning, status
       FROM matched_positions
       WHERE search_request_id = ? ORDER BY match_percentage DESC`
    )
    .bind(latestRequest.id)
    .all<StoredMatchedPosition>();
  return results;
}

/** Positions the student has tagged with a given status (e.g. 'shortlisted', 'applied'), most recent first. */
export async function getPositionsByStatus(
  db: D1Database,
  chatId: number,
  status: PositionStatus
): Promise<StoredMatchedPosition[]> {
  const { results } = await db
    .prepare(
      `SELECT mp.id, mp.title, mp.institution, mp.country, mp.url, mp.source_site,
              mp.match_percentage, mp.match_reasoning, mp.status
       FROM matched_positions mp
       JOIN search_requests sr ON sr.id = mp.search_request_id
       WHERE sr.chat_id = ? AND mp.status = ?
       ORDER BY mp.id DESC LIMIT 25`
    )
    .bind(chatId, status)
    .all<StoredMatchedPosition>();
  return results;
}

export async function updateMatchedPositionStatus(
  db: D1Database,
  matchedPositionId: number,
  status: PositionStatus
): Promise<void> {
  await db
    .prepare(`UPDATE matched_positions SET status = ? WHERE id = ?`)
    .bind(status, matchedPositionId)
    .run();
}

/**
 * Joins a matched_position back to its search_request for everything needed
 * to act on it (chat, degree level, CV) without relying on KV session state -
 * so a button tap still works even if the session TTL already expired.
 */
export async function getMatchedPositionWithContext(
  db: D1Database,
  matchedPositionId: number
): Promise<MatchedPositionWithContext | null> {
  const row = await db
    .prepare(
      `SELECT mp.id, mp.title, mp.institution, mp.country, mp.url, mp.match_percentage,
              sr.chat_id, sr.degree_level, sr.cv_history_id
       FROM matched_positions mp
       JOIN search_requests sr ON sr.id = mp.search_request_id
       WHERE mp.id = ?`
    )
    .bind(matchedPositionId)
    .first<MatchedPositionWithContext>();
  return row ?? null;
}

export async function saveGeneratedDocument(
  db: D1Database,
  matchedPositionId: number,
  docType: "motivation_letter" | "email" | "sop",
  content: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO generated_documents (matched_position_id, doc_type, content) VALUES (?, ?, ?)`
    )
    .bind(matchedPositionId, docType, content)
    .run();
}

export async function addMonitoredSource(
  db: D1Database,
  chatId: number,
  sourceType: SourceType,
  identifier: string
): Promise<void> {
  await db
    .prepare(`INSERT INTO monitored_sources (chat_id, source_type, identifier) VALUES (?, ?, ?)`)
    .bind(chatId, sourceType, identifier)
    .run();
}

export async function listMonitoredSources(db: D1Database, chatId: number): Promise<MonitoredSource[]> {
  const { results } = await db
    .prepare(`SELECT id, source_type, identifier FROM monitored_sources WHERE chat_id = ? ORDER BY id`)
    .bind(chatId)
    .all<MonitoredSource>();
  return results;
}

export async function removeMonitoredSource(db: D1Database, chatId: number, id: number): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM monitored_sources WHERE chat_id = ? AND id = ?`)
    .bind(chatId, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// --- Applications tracker ---

const APPLICATION_SELECT = `
  SELECT a.id, a.matched_position_id, a.chat_id, a.university, a.country, a.field,
         a.professor_name, a.professor_email, a.funding_info, a.details_source,
         a.cover_letter, a.email_draft, a.application_status, a.reminder_count,
         a.last_reminder_notified_at, a.sent_at, a.created_at,
         mp.title AS position_title, mp.url AS position_url
  FROM applications a
  JOIN matched_positions mp ON mp.id = a.matched_position_id
`;

/** Returns the existing application row for this position, or creates a fresh 'draft' one. */
export async function getOrCreateApplication(
  db: D1Database,
  matchedPositionId: number,
  chatId: number
): Promise<number> {
  const existing = await db
    .prepare(`SELECT id FROM applications WHERE matched_position_id = ?`)
    .bind(matchedPositionId)
    .first<{ id: number }>();
  if (existing) return existing.id;

  const result = await db
    .prepare(`INSERT INTO applications (matched_position_id, chat_id) VALUES (?, ?)`)
    .bind(matchedPositionId, chatId)
    .run();
  return result.meta.last_row_id as number;
}

export async function getApplicationById(db: D1Database, id: number): Promise<ApplicationRecord | null> {
  const row = await db
    .prepare(`${APPLICATION_SELECT} WHERE a.id = ?`)
    .bind(id)
    .first<ApplicationRecord>();
  return row ?? null;
}

/** Merges newly-found details into the application row without clobbering already-known values. */
export async function updateApplicationDetails(
  db: D1Database,
  id: number,
  details: PositionDetails,
  source: "page" | "student"
): Promise<void> {
  const current = await getApplicationById(db, id);
  if (!current) return;
  await db
    .prepare(
      `UPDATE applications SET
         university = ?, country = ?, field = ?, professor_name = ?, professor_email = ?,
         funding_info = ?, details_source = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      details.university ?? current.university,
      details.country ?? current.country,
      details.field ?? current.field,
      details.professor_name ?? current.professor_name,
      details.professor_email ?? current.professor_email,
      details.funding_info ?? current.funding_info,
      source,
      id
    )
    .run();
}

export async function setApplicationDraft(
  db: D1Database,
  id: number,
  kind: "cover_letter" | "email_draft",
  content: string
): Promise<void> {
  const column = kind === "cover_letter" ? "cover_letter" : "email_draft";
  await db
    .prepare(`UPDATE applications SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(content, id)
    .run();
}

export async function setApplicationStatus(
  db: D1Database,
  id: number,
  status: ApplicationStatus
): Promise<void> {
  const sentAtClause = status === "sent" ? `, sent_at = datetime('now')` : "";
  await db
    .prepare(`UPDATE applications SET application_status = ?, updated_at = datetime('now')${sentAtClause} WHERE id = ?`)
    .bind(status, id)
    .run();
}

export async function incrementReminderCount(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(
      `UPDATE applications SET reminder_count = reminder_count + 1, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(id)
    .run();
}

export async function markReminderNotified(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(`UPDATE applications SET last_reminder_notified_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();
}

/** Every application for one student, most recent first - what /report exports to Excel. */
export async function listApplicationsForChat(db: D1Database, chatId: number): Promise<ApplicationRecord[]> {
  const { results } = await db
    .prepare(`${APPLICATION_SELECT} WHERE a.chat_id = ? ORDER BY a.created_at DESC`)
    .bind(chatId)
    .all<ApplicationRecord>();
  return results;
}

/**
 * Applications 'sent' at least 10 days ago with no reply logged and no
 * reminder pinged in the last 10 days - read by the daily cron across ALL
 * chats (no chat_id filter), so it's fully independent of any session state.
 */
export async function listApplicationsDueForReminder(db: D1Database): Promise<ApplicationRecord[]> {
  const { results } = await db
    .prepare(
      `${APPLICATION_SELECT}
       WHERE a.application_status = 'sent'
         AND (
           (a.last_reminder_notified_at IS NULL AND a.sent_at <= datetime('now', '-10 days'))
           OR
           (a.last_reminder_notified_at IS NOT NULL AND a.last_reminder_notified_at <= datetime('now', '-10 days'))
         )`
    )
    .all<ApplicationRecord>();
  return results;
}
