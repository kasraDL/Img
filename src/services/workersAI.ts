import type {
  StudentProfile,
  PositionListing,
  MatchedListing,
  DegreeLevel,
  PositionDetails,
} from "../types";

// Cloudflare Workers AI model.
const MODEL = "@cf/openai/gpt-oss-120b";

// Maximum amount of CV text sent to the model.
const MAX_CV_LENGTH = 12000;

// Maximum amount of model output used during repair.
const MAX_REPAIR_INPUT_LENGTH = 12000;

// Maximum number of characters returned as a fallback summary.
const MAX_FALLBACK_SUMMARY_LENGTH = 1200;

/**
 * Calls Cloudflare Workers AI.
 *
 * The model is intentionally kept behind one helper so that
 * model configuration can be changed in one place later.
 */
async function callWorkersAI(
  ai: Ai,
  system: string,
  userContent: string
): Promise<string> {
  try {
    const result = await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      max_tokens: 2048,
    });

    console.log(
      "Workers AI raw result:",
      JSON.stringify(result)
    );

    const response = result as {
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning?: string | null;
        };
        finish_reason?: string;
      }>;
    };

    const choice = response.choices?.[0];

    if (!choice) {
      console.error("Workers AI returned no choices.");
      return "";
    }

    console.log(
      "Workers AI finish reason:",
      choice.finish_reason
    );

    const content = choice.message?.content;

    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }

    console.error(
      "Workers AI returned no message content.",
      "Reasoning length:",
      choice.message?.reasoning?.length ?? 0
    );

    return "";
  } catch (error) {
    console.error(
      "Workers AI invocation failed:",
      error instanceof Error
        ? error.stack || error.message
        : String(error)
    );

    return "";
  }
}

/**
 * Removes Markdown code fences from model output.
 */
function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Finds the first valid-looking JSON object or array in model output.
 *
 * This is intentionally more tolerant than simply taking everything
 * between the first "{" and last "}" because models sometimes add
 * explanatory text around JSON.
 */
function extractJsonBlock(text: string): string {
  const cleaned = stripJsonFence(text);

  if (!cleaned) {
    return "";
  }

  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");

  let start = -1;

  if (firstObject === -1) {
    start = firstArray;
  } else if (firstArray === -1) {
    start = firstObject;
  } else {
    start = Math.min(firstObject, firstArray);
  }

  if (start === -1) {
    return cleaned;
  }

  const lastObject = cleaned.lastIndexOf("}");
  const lastArray = cleaned.lastIndexOf("]");

  const end = Math.max(lastObject, lastArray);

  if (end === -1 || end < start) {
    return cleaned;
  }

  return cleaned.slice(start, end + 1).trim();
}

/**
 * Safely parses JSON returned by the model.
 */
function parseJson<T>(text: string): T {
  const json = extractJsonBlock(text);

  if (!json) {
    throw new Error("Model returned empty JSON output.");
  }

  return JSON.parse(json) as T;
}

/**
 * Creates a safe empty StudentProfile.
 *
 * This function intentionally follows the TypeScript definition
 * by using undefined for optional scalar fields rather than null.
 */
function createEmptyStudentProfile(
  summary = "CV received but automatic extraction failed."
): StudentProfile {
  return {
    full_name: undefined,
    current_degree: undefined,
    field_of_study: undefined,
    gpa: undefined,
    institutions: [],
    publications: [],
    research_interests: [],
    skills: [],
    languages: [],
    work_experience_years: undefined,
    summary,
  };
}

/**
 * Normalizes and validates the extracted CV profile.
 *
 * This protects the application from malformed model output,
 * such as numbers where strings are expected or null values
 * where the application expects arrays.
 */
function normalizeStudentProfile(
  value: unknown
): StudentProfile {
  if (!value || typeof value !== "object") {
    return createEmptyStudentProfile();
  }

  const data = value as Record<string, unknown>;

  const stringOrUndefined = (
    input: unknown
  ): string | undefined => {
    if (typeof input !== "string") {
      return undefined;
    }

    const trimmed = input.trim();

    return trimmed || undefined;
  };

  const stringArray = (
    input: unknown
  ): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter(
        (item): item is string =>
          typeof item === "string"
      )
      .map((item) => item.trim())
      .filter(Boolean);
  };

  let workExperienceYears:
    | number
    | undefined;

  if (
    typeof data.work_experience_years ===
      "number" &&
    Number.isFinite(
      data.work_experience_years
    )
  ) {
    workExperienceYears = Math.max(
      0,
      data.work_experience_years
    );
  }

  const summary =
    typeof data.summary === "string"
      ? data.summary.trim()
      : "";

  return {
    full_name: stringOrUndefined(
      data.full_name
    ),

    current_degree: stringOrUndefined(
      data.current_degree
    ),

    field_of_study: stringOrUndefined(
      data.field_of_study
    ),

    gpa: stringOrUndefined(data.gpa),

    institutions: stringArray(
      data.institutions
    ),

    publications: stringArray(
      data.publications
    ),

    research_interests: stringArray(
      data.research_interests
    ),

    skills: stringArray(data.skills),

    languages: stringArray(data.languages),

    work_experience_years:
      workExperienceYears,

    summary,
  };
}

/**
 * Extracts factual information from a CV.
 */
export async function extractProfileFromCV(
  ai: Ai,
  cvText: string
): Promise<StudentProfile> {
  if (!cvText.trim()) {
    return createEmptyStudentProfile(
      "No CV text was provided."
    );
  }

  const system = `
You are a high-precision CV information extraction system.

Your task is to extract factual information from the candidate's CV.

STRICT RULES:

1. Return ONLY one valid JSON object.
2. Do NOT use Markdown.
3. Do NOT use code fences.
4. Do NOT write explanations before or after the JSON.
5. Use double quotes for all JSON keys and string values.
6. Never invent, infer, or hallucinate facts.
7. Extract only information supported by the CV.
8. If a value is not explicitly available, use an empty string "".
9. If a list has no information, return [].
10. work_experience_years must be a number or null.
11. Do not include any fields other than the required fields.

Return EXACTLY this structure:

{
  "full_name": "",
  "current_degree": "",
  "field_of_study": "",
  "gpa": "",
  "institutions": [],
  "publications": [],
  "research_interests": [],
  "skills": [],
  "languages": [],
  "work_experience_years": null,
  "summary": ""
}

FIELD RULES:

- full_name:
  Candidate's full name exactly as stated in the CV.

- current_degree:
  Current degree or, if completed, the most recently completed degree.

- field_of_study:
  Main academic field or discipline.

- gpa:
  GPA only if explicitly stated. Preserve the stated scale when available.

- institutions:
  Universities, research institutions, or other academic institutions
  explicitly mentioned as places of study or research.

- publications:
  Publication titles explicitly listed in the CV.
  Do not invent titles from journal names or research topics.

- research_interests:
  Explicit research interests, research areas, thesis topics,
  or strongly stated research topics.

- skills:
  Technical, programming, software, computational,
  analytical, research, laboratory, or engineering skills explicitly stated.

- languages:
  Languages explicitly listed in the CV.

- work_experience_years:
  Estimate only when the CV provides sufficient dates to make a
  reasonable calculation. Otherwise return null.

- summary:
  Write 3-5 concise factual sentences based ONLY on the CV.
`;

  const cv = cvText.slice(0, MAX_CV_LENGTH);

  let raw = "";

  try {
    raw = await callWorkersAI(
      ai,
      system,
      cv
    );

    console.log(
      "CV AI response length:",
      raw.length
    );

    console.log(
      "CV AI response preview:",
      raw.slice(0, 2000)
    );

    const parsed =
      parseJson<unknown>(raw);

    return normalizeStudentProfile(
      parsed
    );
  } catch (error) {
    console.error(
      "CV extraction/parsing failed:",
      String(error)
    );
  }

  /**
   * Second attempt:
   * ask the model to repair its previous response.
   */
  if (raw) {
    try {
      const repairSystem = `
You are a JSON repair system.

The previous AI response was intended to contain
structured CV information but may not be valid JSON.

Convert it into exactly ONE valid JSON object.

STRICT RULES:

- Return ONLY valid JSON.
- No Markdown.
- No code fences.
- No explanations.
- No comments.
- Never invent information.
- Preserve factual information from the original response.
- If information is unavailable, use "" for strings.
- Use [] for arrays.
- Use null for work_experience_years when unavailable.

Return EXACTLY:

{
  "full_name": "",
  "current_degree": "",
  "field_of_study": "",
  "gpa": "",
  "institutions": [],
  "publications": [],
  "research_interests": [],
  "skills": [],
  "languages": [],
  "work_experience_years": null,
  "summary": ""
}
`;

      const repaired =
        await callWorkersAI(
          ai,
          repairSystem,
          raw.slice(
            0,
            MAX_REPAIR_INPUT_LENGTH
          )
        );

      console.log(
        "CV repair response:",
        repaired.slice(0, 2000)
      );

      const parsed =
        parseJson<unknown>(repaired);

      return normalizeStudentProfile(
        parsed
      );
    } catch (repairError) {
      console.error(
        "CV JSON repair failed:",
        String(repairError)
      );
    }
  }

  /**
   * Safe final fallback.
   *
   * No unsafe cast is required here.
   */
  return createEmptyStudentProfile(
    raw.slice(
      0,
      MAX_FALLBACK_SUMMARY_LENGTH
    ) ||
      "CV received but automatic extraction failed."
  );
}

/**
 * Scores position listings against the student's profile.
 *
 * Each position is scored separately because this is more reliable
 * for structured JSON generation than asking the model to score
 * a large array in one request.
 */
export async function matchPositionsToProfile(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  listings: PositionListing[]
): Promise<MatchedListing[]> {
  if (listings.length === 0) {
    return [];
  }

  const system = `
You are a high-precision academic position matching engine.

Given:
1. A student's academic/research profile.
2. ONE ${degreeLevel} position.

Calculate a realistic match score from 0 to 100.

Evaluate:

- academic field alignment
- research interest overlap
- technical/software skill overlap
- educational requirements
- research experience
- stated position requirements
- overall suitability

IMPORTANT:

- Do not reward information that is not present in the student profile.
- Do not invent missing qualifications.
- Do not assume that a generic skill means direct research experience.
- Penalize clear mismatches in degree level, field, or required background.
- A high score requires strong evidence of compatibility.
- Return ONLY valid JSON.
- Do NOT use Markdown.
- Do NOT use code fences.

Return EXACTLY:

{
  "match_percentage": 0,
  "match_reasoning": ""
}

Rules:

- match_percentage must be a number between 0 and 100.
- match_reasoning must be 1-2 concise sentences.
- Explain the strongest reasons for the score.
`;

  const scored: MatchedListing[] = [];

  for (const listing of listings) {
    const userContent = JSON.stringify({
      student_profile: profile,

      position: {
        title: listing.title,
        institution:
          listing.institution,
        country: listing.country,
        snippet: listing.snippet,
      },
    });

    let matchPercentage = 50;

    let matchReasoning =
      "Automatic scoring unavailable; manual review recommended.";

    try {
      const raw =
        await callWorkersAI(
          ai,
          system,
          userContent
        );

      const parsed =
        parseJson<{
          match_percentage?: unknown;
          match_reasoning?: unknown;
        }>(raw);

      if (
        typeof parsed.match_percentage ===
          "number" &&
        Number.isFinite(
          parsed.match_percentage
        )
      ) {
        matchPercentage = Math.round(
          Math.max(
            0,
            Math.min(
              100,
              parsed.match_percentage
            )
          )
        );
      }

      if (
        typeof parsed.match_reasoning ===
          "string" &&
        parsed.match_reasoning.trim()
      ) {
        matchReasoning =
          parsed.match_reasoning.trim();
      }
    } catch (error) {
      console.error(
        "Position matching failed:",
        listing.title,
        String(error)
      );
    }

    scored.push({
      ...listing,
      match_percentage:
        matchPercentage,
      match_reasoning:
        matchReasoning,
    });
  }

  return scored.sort(
    (a, b) =>
      b.match_percentage -
      a.match_percentage
  );
}

/**
 * Generates a tailored motivation letter for one position.
 */
export async function generateMotivationLetter(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details?: PositionDetails
): Promise<string> {
  const system = `
You are an expert academic application writer.

Write a concise, specific, evidence-based motivation letter
for a ${degreeLevel} academic position.

IMPORTANT:

- Use ONLY facts contained in the candidate profile.
- Never invent publications, achievements, degrees,
  positions, skills, supervisors, funding, or experience.
- Do not exaggerate the candidate's qualifications.
- Tailor the letter specifically to the target position.
- Avoid generic statements and clichés.
- Keep the letter under 500 words.
- Use a professional academic tone.
- Do not use Markdown.
- Respond ONLY with the letter text.

Recommended structure:

1. Opening:
   State the position and connect it to the candidate's background.

2. Academic background:
   Mention the most relevant degree and field.

3. Research/technical background:
   Mention only relevant research interests,
   publications, methods, programming, and technical skills.

4. Position fit:
   Explain specifically why the candidate's background
   aligns with the position.

5. Closing:
   Express interest professionally and concisely.

PROFESSOR NAME RULE:

If professor_name is provided:
- Copy it EXACTLY.
- Do not respell it.
- Do not abbreviate it.
- Do not correct it.
- Do not change its title.

If professor_name is not provided:
- Do not invent a professor's name.
- Address the letter to the admissions or selection committee.

FUNDING RULE:

If funding_info is provided, use only the information supplied.
Never invent scholarship or funding details.

Respond with ONLY the final letter.
`;

  const userContent = JSON.stringify({
    degree_level: degreeLevel,

    candidate_profile: profile,

    target_position: {
      title: position.title,

      institution:
        details?.university ??
        position.institution,

      country:
        details?.country ??
        position.country,

      snippet:
        position.snippet,

      professor_name:
        details?.professor_name ??
        null,

      funding_info:
        details?.funding_info ??
        null,
    },
  });

  return callWorkersAI(
    ai,
    system,
    userContent
  );
}

/**
 * Generates a short application/outreach email.
 */
export async function generateApplicationEmail(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details?: PositionDetails
): Promise<string> {
  const system = `
You are an expert academic application email writer.

Write a short, polite, professional email from a prospective
${degreeLevel} student regarding one specific academic position.

STRICT REQUIREMENTS:

- Maximum 200 words.
- The first line MUST be:
  Subject: ...

- Mention the specific position.
- Mention the institution when appropriate.
- Reference only 1-2 concrete facts from the candidate profile.
- Never invent facts.
- Do not repeat the entire CV.
- Do not use generic or exaggerated claims.
- Keep the tone professional and concise.
- Do not use Markdown.
- Respond ONLY with the email text.

PROFESSOR NAME:

If professor_name is provided:
- Copy it EXACTLY.
- Preserve the title exactly.
- Never respell, abbreviate, or correct it.

If professor_name is not provided:
Use exactly:

Dear Hiring Committee

FUNDING:

If funding_info is provided, mention it only if relevant.
Never invent funding information.
`;

  const userContent = JSON.stringify({
    degree_level: degreeLevel,

    candidate_profile: profile,

    target_position: {
      title: position.title,

      institution:
        details?.university ??
        position.institution,

      country:
        details?.country ??
        position.country,

      professor_name:
        details?.professor_name ??
        null,

      funding_info:
        details?.funding_info ??
        null,
    },
  });

  return callWorkersAI(
    ai,
    system,
    userContent
  );
}

/**
 * Generates a short follow-up email for an application
 * that has not received a response.
 */
export async function generateFollowUpEmail(
  ai: Ai,
  profile: StudentProfile,
  degreeLevel: DegreeLevel,
  position: PositionListing,
  details: PositionDetails | undefined,
  daysSinceApplied: number
): Promise<string> {
  const safeDaysSinceApplied =
    Number.isFinite(daysSinceApplied)
      ? Math.max(
          0,
          Math.round(daysSinceApplied)
        )
      : 0;

  const system = `
You are an expert academic application email writer.

Write a brief and polite follow-up email regarding a
${degreeLevel} application submitted ${safeDaysSinceApplied}
days ago.

STRICT REQUIREMENTS:

- Maximum 120 words.
- The first line MUST be:
  Subject: Re: ...

- Clearly but politely refer to the previous application.
- Briefly reaffirm interest.
- Do not repeat the original application pitch.
- Do not sound impatient, demanding, or entitled.
- Do not invent information.
- Do not use Markdown.
- Respond ONLY with the email text.

PROFESSOR NAME:

If professor_name is provided:
- Copy it EXACTLY in the salutation.
- Do not respell or modify it.

If professor_name is not provided:
Use exactly:

Dear Hiring Committee
`;

  const userContent = JSON.stringify({
    degree_level: degreeLevel,

    candidate_profile: {
      full_name:
        profile.full_name,
      field_of_study:
        profile.field_of_study,
    },

    target_position: {
      title: position.title,

      institution:
        details?.university ??
        position.institution,

      professor_name:
        details?.professor_name ??
        null,
    },

    days_since_applied:
      safeDaysSinceApplied,
  });

  return callWorkersAI(
    ai,
    system,
    userContent
  );
}