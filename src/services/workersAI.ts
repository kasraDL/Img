import type {
  StudentProfile,
  PositionListing,
  MatchedListing,
  DegreeLevel,
  PositionDetails,
} from "../types";

const MODEL = "@cf/openai/gpt-oss-120b";
const MAX_CV_LENGTH = 12000;
const MAX_POSITION_TEXT = 5000;

interface WorkersAIResult {
  response?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
}

async function callWorkersAI(
  ai: Ai,
  system: string,
  userContent: string,
  maxTokens = 1024
): Promise<string> {
  try {
    const result = (await ai.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
    })) as WorkersAIResult;

    const content =
      typeof result.response === "string"
        ? result.response
        : result.choices?.[0]?.message?.content ?? "";

    return content.trim();
  } catch (error) {
    console.error(
      "Workers AI invocation failed:",
      error instanceof Error ? error.message : String(error)
    );
    return "";
  }
}

function extractJson(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const starts = [firstObject, firstArray].filter((i) => i >= 0);
  if (!starts.length) return cleaned;
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  return end >= start ? cleaned.slice(start, end + 1) : cleaned;
}

function parseJson<T>(text: string): T {
  const json = extractJson(text);
  if (!json) throw new Error("Workers AI returned empty output.");
  return JSON.parse(json) as T;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizeProfile(value: unknown): StudentProfile {
  if (!value || typeof value !== "object") {
    return {
      institutions: [],
      publications: [],
      research_interests: [],
      skills: [],
      languages: [],
      summary: "CV received but automatic extraction failed.",
    };
  }

  const data = value as Record<string, unknown>;
  const years =
    typeof data.work_experience_years === "number" &&
    Number.isFinite(data.work_experience_years)
      ? Math.max(0, data.work_experience_years)
      : undefined;

  return {
    full_name: stringValue(data.full_name),
    current_degree: stringValue(data.current_degree),
    field_of_study: stringValue(data.field_of_study),
    gpa: stringValue(data.gpa),
    institutions: stringArray(data.institutions),
    publications: stringArray(data.publications),
    research_interests: stringArray(data.research_interests),
    skills: stringArray(data.skills),
    languages: stringArray(data.languages),
    work_experience_years: years,
    summary: stringValue(data.summary) ?? "",
  };
}

export async function extractProfileFromCV(
  ai: Ai,
  cvText: string
): Promise<StudentProfile> {
  if (!cvText.trim()) {
    return normalizeProfile({ summary: "No CV text was provided." });
  }

  const system = `
Extract factual information from the CV.
Return ONLY one valid JSON object. Never invent information.
Use empty strings for unavailable scalar values, [] for unavailable lists,
and null for work_experience_years.

Required JSON:
{
  "full_name":"",
  "current_degree":"",
  "field_of_study":"",
  "gpa":"",
  "institutions":[],
  "publications":[],
  "research_interests":[],
  "skills":[],
  "languages":[],
  "work_experience_years":null,
  "summary":""
}
`;

  const raw = await callWorkersAI(ai, system, cvText.slice(0, MAX_CV_LENGTH), 1400);

  try {
    return normalizeProfile(parseJson<unknown>(raw));
  } catch (error) {
    console.error("CV JSON parsing failed:", String(error));
    if (!raw) return normalizeProfile({});

    try {
      const repaired = await callWorkersAI(
        ai,
        "Repair the following into exactly one valid JSON object matching the requested CV schema. Do not invent facts.",
        raw.slice(0, MAX_CV_LENGTH),
        1400
      );
      return normalizeProfile(parseJson<unknown>(repaired));
    } catch (repairError) {
      console.error("CV JSON repair failed:", String(repairError));
      return normalizeProfile({});
    }
  }
}

export async function matchPositionsToProfile(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  listings: PositionListing[]
): Promise<MatchedListing[]> {
  if (!listings.length) return [];

  const system = `
Score one academic position against a student's profile.
Return ONLY JSON: {"match_percentage":0,"match_reasoning":""}
Score 0-100 using evidence only. Penalize degree, field, and requirement mismatches.
Never invent qualifications. Reasoning must be 1-2 concise sentences.
Target degree: ${degreeLevel}.
`;

  const concurrency = 4;
  const results: MatchedListing[] = new Array(listings.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= listings.length) return;
      const listing = listings[index];
      let score = 50;
      let reasoning = "Automatic scoring unavailable; manual review recommended.";

      try {
        const raw = await callWorkersAI(
          ai,
          system,
          JSON.stringify({
            student_profile: profile,
            position: {
              title: listing.title,
              institution: listing.institution,
              country: listing.country,
              snippet: listing.snippet?.slice(0, MAX_POSITION_TEXT),
            },
          }),
          350
        );

        const parsed = parseJson<{
          match_percentage?: unknown;
          match_reasoning?: unknown;
        }>(raw);

        if (typeof parsed.match_percentage === "number" && Number.isFinite(parsed.match_percentage)) {
          score = Math.round(Math.max(0, Math.min(100, parsed.match_percentage)));
        }
        if (typeof parsed.match_reasoning === "string" && parsed.match_reasoning.trim()) {
          reasoning = parsed.match_reasoning.trim();
        }
      } catch (error) {
        console.error(`Position matching failed for ${listing.title}:`, String(error));
      }

      results[index] = {
        ...listing,
        match_percentage: score,
        match_reasoning: reasoning,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length) }, () => worker())
  );

  return results.sort((a, b) => b.match_percentage - a.match_percentage);
}

export async function generateMotivationLetter(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details?: PositionDetails
): Promise<string> {
  const system = `
Write a concise, evidence-based academic motivation letter for a ${degreeLevel} position.
Use ONLY facts supplied in the profile and position. Never invent qualifications.
If professor_name is supplied, copy it exactly; otherwise address the selection committee.
Keep it under 500 words, professional, specific, and plain text.
`;

  return callWorkersAI(
    ai,
    system,
    JSON.stringify({
      candidate_profile: profile,
      target_position: {
        title: position.title,
        institution: details?.university ?? position.institution,
        country: details?.country ?? position.country,
        snippet: position.snippet?.slice(0, MAX_POSITION_TEXT),
        professor_name: details?.professor_name ?? null,
        funding_info: details?.funding_info ?? null,
      },
    }),
    1200
  );
}

export async function generateApplicationEmail(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details?: PositionDetails
): Promise<string> {
  const system = `
Write a concise professional application email for a ${degreeLevel} academic position.
The first line MUST be "Subject: ...". Maximum 200 words.
Use only supplied facts. Never invent information. Plain text only.
If professor_name is absent, use exactly "Dear Hiring Committee".
`;

  return callWorkersAI(
    ai,
    system,
    JSON.stringify({
      candidate_profile: profile,
      target_position: {
        title: position.title,
        institution: details?.university ?? position.institution,
        country: details?.country ?? position.country,
        professor_name: details?.professor_name ?? null,
        funding_info: details?.funding_info ?? null,
      },
    }),
    700
  );
}

export async function generateFollowUpEmail(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details: PositionDetails | undefined,
  daysSinceApplied: number
): Promise<string> {
  const days = Number.isFinite(daysSinceApplied)
    ? Math.max(0, Math.round(daysSinceApplied))
    : 0;

  const system = `
Write a brief polite follow-up email for a ${degreeLevel} application submitted ${days} days ago.
First line MUST be "Subject: Re: ...". Maximum 120 words. Plain text only.
Never invent information. If professor_name is absent, use exactly "Dear Hiring Committee".
`;

  return callWorkersAI(
    ai,
    system,
    JSON.stringify({
      candidate: {
        full_name: profile.full_name,
        field_of_study: profile.field_of_study,
      },
      position: {
        title: position.title,
        institution: details?.university ?? position.institution,
        professor_name: details?.professor_name ?? null,
      },
      days_since_applied: days,
    }),
    500
  );
}
