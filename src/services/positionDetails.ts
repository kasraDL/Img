import type { PositionDetails } from "../types";

/**
 * Fetches a listing page and strips it down to plain-ish text, capped to
 * keep the free AI model's context comfortable.
 */
async function fetchPageText(url: string): Promise<string | null> {
  if (url === "manual-paste" || url.startsWith("https://t.me/")) return null; // nothing to fetch
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch {
    return null;
  }
}

function stripJsonFence(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  return first !== -1 && last !== -1 ? cleaned.slice(first, last + 1) : cleaned;
}

/**
 * Extracts professor name/email, university, country, field, and funding
 * info directly from a listing page's text. Explicitly instructed to leave
 * a field out rather than guess it - this feeds real emails, so accuracy
 * matters more than completeness.
 */
export async function extractPositionDetails(
  ai: Ai,
  url: string,
  fallbackSnippet?: string
): Promise<{ details: PositionDetails; source: "page" | null }> {
  const pageText = await fetchPageText(url);
  const textToUse = pageText ?? fallbackSnippet;
  if (!textToUse || textToUse.length < 30) {
    return { details: {}, source: null };
  }

  const system = `You extract contact and funding details from an academic position listing page.
Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "professor_name": string | null,
  "professor_email": string | null,
  "university": string | null,
  "country": string | null,
  "field": string | null,
  "funding_info": string | null
}
CRITICAL: only include a value if it is LITERALLY written in the text. If a field is not
present, use null. Never guess, infer, or construct an email address - copy it exactly as
written if present, otherwise null. Do not invent a professor's name from a lab or project name.`;

  try {
    const result = await ai.run("@cf/openai/gpt-oss-120b", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: textToUse },
      ],
    });
    const raw = (result as { response?: string }).response ?? "";
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, string | null>;
    const details: PositionDetails = {};
    if (parsed.professor_name) details.professor_name = parsed.professor_name;
    if (parsed.professor_email) details.professor_email = parsed.professor_email;
    if (parsed.university) details.university = parsed.university;
    if (parsed.country) details.country = parsed.country;
    if (parsed.field) details.field = parsed.field;
    if (parsed.funding_info) details.funding_info = parsed.funding_info;
    return { details, source: pageText ? "page" : null };
  } catch {
    return { details: {}, source: null };
  }
}
