export interface Env {
  DB: D1Database;
  CV_BUCKET: R2Bucket;
  SESSIONS: KVNamespace;
  AI: Ai;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  /** Optional production web-search API token. */
  BRAVE_SEARCH_API_KEY?: string;
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
  degree_level: DegreeLevel;
  countries?: string[];
  funding?: FundingPreference;
  field?: string;
  research_area?: string;
  position_types?: PositionType[];
  keywords?: string;
  minimum_match_percentage?: number;
  deadline_required?: boolean;
  deadline_before?: string;
}

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

export interface SessionState {
  step: ConversationStep;
  cv_history_id?: number;
  search_filters?: SearchFilters;
  degree_level?: DegreeLevel;
  field_hint?: string;
  pending_application_id?: number;
  pending_application_field?:
    | "professor_name"
    | "professor_email"
    | "funding_info";
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

export interface PositionDetails {
  professor_name?: string;
  professor_email?: string;
  university?: string;
  country?: string;
  field?: string;
  funding_info?: string;
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
  details_source: "page" | "student" | null;
  cover_letter: string | null;
  email_draft: string | null;
  application_status: ApplicationStatus;
  reminder_count: number;
  last_reminder_notified_at: string | null;
  sent_at: string | null;
  created_at: string;
  position_title?: string;
  position_url?: string;
}
