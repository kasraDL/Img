import type { DegreeLevel, PositionListing } from "../types";

const SITES_BY_DEGREE: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelorsportal.com", "scholarship-positions.com"],
  master: ["findamasters.com", "mastersportal.com", "scholarship-positions.com"],
  phd: [
    "findaphd.com",
    "phdportal.com",
    "euraxess.ec.europa.eu",
    "academicpositions.com",
    "phdgermany.de",
    "academicjobsonline.org",
    "jobs.ac.uk",
  ],
};

const DEGREE_TERM: Record<DegreeLevel, string> = {
  bachelor: "Bachelor",
  master: "Master",
  phd: "PhD",
};

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function belongsToSourceSite(url: string, sourceSite: string): boolean {
  try {
    const hostname = normalizeHost(new URL(url).hostname);
    const site = normalizeHost(sourceSite);
    return hostname === site || hostname.endsWith(`.${site}`);
  } catch {
    return false;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text: string): string {
  return decodeHtmlEntities(
    text.replace(/<[^>]+>/g, " ")
  );
}

function getAttribute(tag: string, name: string): string {
  const regex = new RegExp(
    `\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    "i",
  );
  return tag.match(regex)?.[2] ?? "";
}

function resolveSearchLink(href: string): string {
  const cleaned = decodeHtmlEntities(href.trim());
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned, "https://search.brave.com/");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  }
}

function buildQueries(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const terms = [
    DEGREE_TERM[degreeLevel],
    clean(fieldHint),
    clean(countryHint ?? ""),
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `site:${site} ${terms}`,
    `${terms} site:${site}`,
    `${terms} ${site}`,
  ];
}

function parseBraveResults(
  payload: unknown,
  sourceSite: string,
): PositionListing[] {
  const web =
    typeof payload === "object" &&
    payload !== null &&
    "web" in payload
      ? (payload as { web?: { results?: unknown[] } }).web
      : undefined;

  const rawResults = Array.isArray(web?.results)
    ? web.results
    : [];

  const results: PositionListing[] = [];

  for (const raw of rawResults) {
    if (typeof raw !== "object" || raw === null) continue;

    const item = raw as {
      title?: unknown;
      url?: unknown;
      description?: unknown;
    };

    const url =
      typeof item.url === "string"
        ? resolveSearchLink(item.url)
        : "";

    const title =
      typeof item.title === "string"
        ? stripTags(item.title)
        : "";

    const snippet =
      typeof item.description === "string"
        ? stripTags(item.description)
        : "";

    if (
      !url ||
      !title ||
      !belongsToSourceSite(url, sourceSite)
    ) {
      continue;
    }

    results.push({
      title,
      url,
      snippet,
      source_site: sourceSite,
    });
  }

  return results.slice(0, 10);
}

async function searchBrave(
  apiKey: string,
  query: string,
  sourceSite: string,
): Promise<PositionListing[]> {
  const url = new URL(
    "https://api.search.brave.com/res/v1/web/search",
  );

  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(
      `Brave Search returned ${response.status}: ${body}`,
    );
  }

  const payload: unknown = await response.json();
  return parseBraveResults(payload, sourceSite);
}

/**
 * Search one site through Brave's structured Search API.
 *
 * This intentionally does not scrape search-engine HTML. HTML scraping was
 * returning zero results from Workers because search-engine bot/challenge
 * pages are not stable application APIs.
 */
async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint: string | undefined,
  apiKey: string,
): Promise<PositionListing[]> {
  for (const query of buildQueries(
    site,
    degreeLevel,
    fieldHint,
    countryHint,
  )) {
    console.log(`Brave Search: ${query}`);

    try {
      const results = await searchBrave(
        apiKey,
        query,
        site,
      );

      console.log(
        `Brave Search: ${site} -> ${results.length} results`,
      );

      if (results.length > 0) return results;
    } catch (error) {
      console.error(
        `Brave Search failed for ${site}:`,
        String(error),
      );
    }
  }

  console.log(`Search exhausted for ${site}: 0 results`);
  return [];
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  if (!braveSearchApiKey?.trim()) {
    console.error(
      "BRAVE_SEARCH_API_KEY is not configured; website search is disabled.",
    );
    return [];
  }

  const all: PositionListing[] = [];

  // Run sites sequentially to keep request volume predictable and avoid
  // unnecessary bursts against the external search API.
  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    all.push(
      ...(await searchSite(
        site,
        degreeLevel,
        fieldHint,
        countryHint,
        braveSearchApiKey,
      )),
    );
  }

  const unique = new Map<string, PositionListing>();
  for (const listing of all) {
    if (listing.url && !unique.has(listing.url)) {
      unique.set(listing.url, listing);
    }
  }

  return Array.from(unique.values());
}

export function fallbackSearchLinks(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const q = encodeURIComponent(
    [fieldHint, countryHint ?? ""]
      .filter(Boolean)
      .join(" "),
  );

  if (degreeLevel === "phd") {
    return [
      `https://www.findaphd.com/phds/?Keywords=${q}`,
      `https://www.phdportal.com/search/phd/${q}`,
      `https://euraxess.ec.europa.eu/jobs/search?keywords=${q}`,
      `https://academicpositions.com/find-jobs?query=${q}`,
    ];
  }

  if (degreeLevel === "master") {
    return [
      `https://www.findamasters.com/masters-degrees/?Keywords=${q}`,
      `https://www.mastersportal.com/search/master/${q}`,
    ];
  }

  return [
    `https://www.bachelorsportal.com/search/bachelor/${q}`,
  ];
}
