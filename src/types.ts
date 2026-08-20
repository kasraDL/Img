export interface Env {
  DB: D1Database;
  CV_BUCKET: R2Bucket;
  SESSIONS: KVNamespace;
  AI: Ai;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

// -----------------------------------------------------------------------------
// Degree
// -----------------------------------------------------------------------------

export type DegreeLevel =
  | "bachelor"
  | "master"
  | "phd";

// -----------------------------------------------------------------------------
// Student profile
// -----------------------------------------------------------------------------

export interface StudentProfile {
  full_name?: string;
  current_degree?: string;
  field_of_study?: string;
  gpa?: string;
  institutions?: string[];
  publications?: string[];
  research_interests?: string[];
  skills?: string[];
  languages?: string[];
  work_experience_years?: number;

  /**
   * Natural-language summary extracted from the CV.
   * Used primarily for AI-based position matching.
   */
  summary: string;
}

// -----------------------------------------------------------------------------
// Conversation state
// -----------------------------------------------------------------------------

export type ConversationStep =
  | "awaiting_cv"
  | "awaiting_search_keywords"
  | "awaiting_degree_level"
  | "awaiting_search_filters"
  | "awaiting_field_hint"
  | "awaiting_country_hint"
  | "awaiting_minimum_match"
  | "searching"
  | "reviewing_results"
  | "awaiting_application_field"
  | "idle";

// -----------------------------------------------------------------------------
// Funding
// -----------------------------------------------------------------------------

export type FundingPreference =
  | "funded"
  | "self_funded"
  | "both";

// -----------------------------------------------------------------------------
// Position type
// -----------------------------------------------------------------------------

export type PositionType =
  | "phd"
  | "research_assistant"
  | "research_fellow"
  | "masters"
  | "bachelor"
  | "internship"
  | "other";

// -----------------------------------------------------------------------------
// Search filters
// -----------------------------------------------------------------------------

export interface SearchFilters {
  /**
   * Selected degree level.
   */
  degree_level: DegreeLevel;

  /**
   * Multiple countries are allowed.
   *
   * Example:
   * ["Norway", "Sweden", "Germany"]
   */
  countries?: string[];

  /**
   * Funding preference:
   *
   * funded       -> only funded positions
   * self_funded  -> only self-funded positions
   * both         -> no funding restriction
   */
  funding?: FundingPreference;

  /**
   * Broad academic field.
   *
   * Examples:
   * "Engineering"
   * "Computer Science"
   * "Environmental Science"
   */
  field?: string;

  /**
   * Specific research area.
   *
   * Examples:
   * "Structural Engineering"
   * "Machine Learning"
   * "Artificial Intelligence"
   */
  research_area?: string;

  /**
   * Optional position types.
   */
  position_types?: PositionType[];

  /**
   * Optional free-text keyword refinement.
   *
   * Example:
   * "surrogate models, truss optimization"
   */
  keywords?: string;

  /**
   * Minimum AI match percentage.
   *
   * Example:
   * 70 -> only positions with match >= 70.
   */
  minimum_match_percentage?: number;

  /**
   * Whether the position must have an explicitly
   * stated application deadline.
   */
  deadline_required?: boolean;

  /**
   * Optional maximum acceptable deadline.
   *
   * Example:
   * "2026-12-31"
   */
  deadline_before?: string;
}

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

export interface SessionState {
  step: ConversationStep;

  /**
   * ID of the CV version currently being used.
   */
  cv_history_id?: number;

  /**
   * Complete search configuration currently being built.
   */
  search_filters?: SearchFilters;

  /**
   * Backward-compatible fields used by the older search flow.
   */
  degree_level?: DegreeLevel;
  field_hint?: string;

  /**
   * Application currently being completed.
   */
  pending_application_id?: number;

  /**
   * Application field for which user input is expected.
   */
  pending_application_field?:
    | "professor_name"
    | "professor_email"
    | "funding_info";

  /**
   * Document that should be generated after
   * the missing application field is supplied.
   */
  pending_doc_kind?: "letter" | "email";
}

// -----------------------------------------------------------------------------
// Position listing
// -----------------------------------------------------------------------------

export interface PositionListing {
  title: string;
  institution?: string;
  country?: string;
  url: string;
  source_site?: string;
  deadline?: string;
  snippet?: string;
}

// -----------------------------------------------------------------------------
// Monitored sources
// -----------------------------------------------------------------------------

export type SourceType =
  | "telegram_channel"
  | "linkedin_page";

export interface MonitoredSource {
  id: number;
  source_type: SourceType;
  identifier: string;
}

// -----------------------------------------------------------------------------
// AI-matched listing
// -----------------------------------------------------------------------------

export interface MatchedListing
  extends PositionListing {
  match_percentage: number;
  match_reasoning: string;
}

// -----------------------------------------------------------------------------
// Position status
// -----------------------------------------------------------------------------

export type PositionStatus =
  | "new"
  | "shortlisted"
  | "applied"
  | "dismissed";

// -----------------------------------------------------------------------------
// Matched position with context
// -----------------------------------------------------------------------------

/**
 * A matched_position row joined with its parent
 * search_request.
 *
 * This provides enough context for callback actions
 * even if the KV session has expired.
 */
export interface MatchedPositionWithContext {
  id: number;

  title: string;

  institution: string | null;

  country: string | null;

  url: string;

  match_percentage: number | null;

  chat_id: number;

  degree_level: DegreeLevel;

  cv_history_id: number;
}

// -----------------------------------------------------------------------------
// Position details
// -----------------------------------------------------------------------------

/**
 * Details extracted from the actual position page.
 *
 * Every field is optional and should remain undefined
 * when the information cannot be reliably extracted.
 */
export interface PositionDetails {
  professor_name?: string;
  professor_email?: string;

  university?: string;
  country?: string;

  field?: string;

  funding_info?: string;

  /**
   * Optional deadline extracted from the listing page.
   */
  deadline?: string;
}

// -----------------------------------------------------------------------------
// Application
// -----------------------------------------------------------------------------

export type ApplicationStatus =
  | "draft"
  | "ready"
  | "sent"
  | "replied"
  | "rejected"
  | "accepted"
  | "withdrawn";

// -----------------------------------------------------------------------------
// Application record
// -----------------------------------------------------------------------------

export interface ApplicationRecord {
  id: number;

  matched_position_id: number;

  chat_id: number;

  university: string | null;

  country: string | null;

  field: string | null;

  professor_name: string | null;

  professor_email: string | null;

  funding_info: string | null;

  details_source:
    | "page"
    | "student"
    | null;

  cover_letter: string | null;

  email_draft: string | null;

  application_status: ApplicationStatus;

  reminder_count: number;

  last_reminder_notified_at:
    | string
    | null;

  sent_at: string | null;

  created_at: string;

  /**
   * Joined fields from matched_positions.
   * Used by reports, reminders and Excel export.
   */
  position_title?: string;

  position_url?: string;
}
