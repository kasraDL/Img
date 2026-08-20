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
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " "));
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

    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? stripTags(item.title) : "";
    const snippet =
      typeof item.description === "string"
        ? stripTags(item.description)
        : "";

    if (!url || !title || !belongsToSourceSite(url, sourceSite)) continue;

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
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search returned ${response.status}`);
  }

  return parseBraveResults(await response.json(), sourceSite);
}

function extractXmlTag(block: string, tag: string): string {
  const match = block.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? stripTags(match[1]) : "";
}

/**
 * Bing exposes an RSS search representation which is much more stable for
 * server-side requests than scraping an interactive search-engine page.
 */
function parseBingRss(xml: string, sourceSite: string): PositionListing[] {
  const results: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractXmlTag(block, "title");
    const url = extractXmlTag(block, "link");
    const snippet = extractXmlTag(block, "description");

    if (!title || !url || !belongsToSourceSite(url, sourceSite)) continue;

    results.push({
      title,
      url,
      snippet,
      source_site: sourceSite,
    });
  }

  return results.slice(0, 10);
}

async function searchBingRss(
  query: string,
  sourceSite: string,
): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "20");
  url.searchParams.set("setlang", "en-US");

  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Bing RSS returned ${response.status}`);
  }

  return parseBingRss(await response.text(), sourceSite);
}

async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint: string | undefined,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  for (const query of buildQueries(site, degreeLevel, fieldHint, countryHint)) {
    console.log(`Searching ${site}: ${query}`);

    // Preferred provider: structured Brave API.
    if (braveSearchApiKey?.trim()) {
      try {
        const results = await searchBrave(braveSearchApiKey, query, site);
        console.log(`Brave Search: ${site} -> ${results.length} results`);
        if (results.length > 0) return results;
      } catch (error) {
        console.error(`Brave Search failed for ${site}:`, String(error));
      }
    }

    // No secret is required for this fallback. Bing's RSS representation is
    // substantially more suitable for Workers than DDG HTML scraping.
    try {
      const results = await searchBingRss(query, site);
      console.log(`Bing RSS: ${site} -> ${results.length} results`);
      if (results.length > 0) return results;
    } catch (error) {
      console.error(`Bing RSS failed for ${site}:`, String(error));
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
  // Each site can take several sequential requests to resolve (query variants x
  // provider fallback), and a PhD search spans 7 sites. Running sites in parallel
  // instead of one-by-one keeps the whole search well within Telegram's webhook
  // response window instead of risking a slow reply (and a duplicate webhook
  // delivery from Telegram retrying what it thinks was a dropped request).
  const perSite = await Promise.all(
    SITES_BY_DEGREE[degreeLevel].map((site) =>
      searchSite(site, degreeLevel, fieldHint, countryHint, braveSearchApiKey),
    ),
  );
  const all = perSite.flat();

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
    [fieldHint, countryHint ?? ""].filter(Boolean).join(" "),
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

  return [`https://www.bachelorsportal.com/search/bachelor/${q}`];
}
