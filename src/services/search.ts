import type { DegreeLevel, PositionListing } from "../types";

/**
 * Search configuration is deliberately site-specific. Search engines are
 * indexes, not the source of truth, so every configured site gets its own
 * query family and we collect results from all providers instead of stopping
 * after the first successful query.
 */
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

const SITE_ALIASES: Record<string, string[]> = {
  "findaphd.com": ["phd", "phd project", "doctoral", "studentship", "studentships"],
  "phdportal.com": ["phd", "doctoral", "doctoral programme", "doctoral program"],
  "euraxess.ec.europa.eu": ["phd", "doctoral", "researcher", "research", "doctoral candidate"],
  "academicpositions.com": ["phd", "doctoral", "researcher", "research assistant", "doctoral candidate"],
  "phdgermany.de": ["phd", "doctoral", "promotion", "doktorand", "doctoral candidate"],
  "academicjobsonline.org": ["phd", "doctoral", "research", "research assistant", "graduate"],
  "jobs.ac.uk": ["phd", "studentship", "studentships", "doctoral", "research assistant", "research fellow"],
  "findamasters.com": ["master", "masters", "msc", "mres", "postgraduate"],
  "mastersportal.com": ["master", "masters", "msc", "mres", "postgraduate"],
  "bachelorsportal.com": ["bachelor", "bachelors", "undergraduate"],
  "scholarship-positions.com": ["scholarship", "studentship", "phd", "master", "research"],
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada"],
  usa: ["usa", "united states", "united states of america", "u.s.", "us"],
  uk: ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland"],
  germany: ["germany", "deutschland", "german"],
  france: ["france", "french"],
  netherlands: ["netherlands", "the netherlands", "holland", "dutch"],
  switzerland: ["switzerland", "swiss"],
  sweden: ["sweden", "swedish"],
  norway: ["norway", "norwegian"],
  finland: ["finland", "finnish"],
  denmark: ["denmark", "danish"],
  australia: ["australia", "australian"],
  "new zealand": ["new zealand", "nz"],
  austria: ["austria", "austrian", "österreich"],
  belgium: ["belgium", "belgian"],
  ireland: ["ireland", "irish"],
  italy: ["italy", "italian"],
  spain: ["spain", "spanish"],
  japan: ["japan", "japanese"],
  "south korea": ["south korea", "korea", "republic of korea", "korean"],
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

function countryTerms(countryHint?: string): string[] {
  if (!countryHint) return [];
  return countryHint
    .split(",")
    .map((country) => country.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((country) => COUNTRY_ALIASES[country] ?? [country]);
}

function fieldTerms(fieldHint: string): string[] {
  const field = clean(fieldHint).toLowerCase();
  if (!field) return [];

  const aliases: Record<string, string[]> = {
    "structural engineering": [
      "structural engineering",
      "structural mechanics",
      "civil engineering",
      "structures",
      "structural",
    ],
    "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
    "machine learning": ["machine learning", "artificial intelligence", "ai", "deep learning"],
    "artificial intelligence": ["artificial intelligence", "machine learning", "ai", "deep learning"],
    engineering: ["engineering", "technology"],
    "computer science": ["computer science", "computing", "software", "artificial intelligence"],
    "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
  };

  return aliases[field] ?? [field];
}

function buildQueries(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const degree = DEGREE_TERM[degreeLevel];
  const field = clean(fieldHint);
  const countries = countryTerms(countryHint);
  const aliases = SITE_ALIASES[site] ?? [degree.toLowerCase()];

  const queries = new Set<string>();
  const add = (value: string) => {
    const query = clean(value);
    if (query) queries.add(query);
  };

  // First query is the precise request, but additional queries deliberately
  // relax the wording so that a site with a different title vocabulary is not
  // silently excluded by the search engine.
  if (countries.length > 0) {
    add(`site:${site} ${degree} ${field} ${countries[0]}`);
    add(`site:${site} ${field} ${countries[0]}`);
    add(`site:${site} ${aliases.slice(0, 3).join(" OR ")} ${field} ${countries[0]}`);
  }

  add(`site:${site} ${degree} ${field}`);
  add(`site:${site} ${field}`);
  add(`site:${site} ${aliases.slice(0, 4).join(" OR ")} ${field}`);
  add(`${degree} ${field} ${countries.slice(0, 2).join(" ")} site:${site}`);

  // A final broad query is useful for portals whose indexed pages do not
  // contain the literal word "PhD" in the title.
  add(`site:${site} ${field || degree}`);

  return Array.from(queries).slice(0, 8);
}

function parseBraveResults(payload: unknown, sourceSite: string): PositionListing[] {
  const web =
    typeof payload === "object" && payload !== null && "web" in payload
      ? (payload as { web?: { results?: unknown[] } }).web
      : undefined;

  const rawResults = Array.isArray(web?.results) ? web.results : [];
  const results: PositionListing[] = [];

  for (const raw of rawResults) {
    if (typeof raw !== "object" || raw === null) continue;

    const item = raw as { title?: unknown; url?: unknown; description?: unknown };
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? stripTags(item.title) : "";
    const snippet = typeof item.description === "string" ? stripTags(item.description) : "";

    if (!url || !title || !belongsToSourceSite(url, sourceSite)) continue;

    results.push({ title, url, snippet, source_site: sourceSite });
  }

  return results;
}

async function searchBrave(apiKey: string, query: string, sourceSite: string): Promise<PositionListing[]> {
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

  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`);
  return parseBraveResults(await response.json(), sourceSite);
}

function extractXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

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
    results.push({ title, url, snippet, source_site: sourceSite });
  }

  return results;
}

async function searchBingRss(query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "20");
  url.searchParams.set("setlang", "en-US");

  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/2.0)",
    },
  });

  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), sourceSite);
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function listingText(listing: PositionListing): string {
  return [listing.title, listing.snippet, listing.institution, listing.country, listing.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferCountry(listing: PositionListing, selectedCountries: string[]): boolean {
  if (selectedCountries.length === 0) return true;

  const text = listingText(listing);
  return selectedCountries.some((selected) => {
    const normalized = selected.trim().toLowerCase();
    const aliases = COUNTRY_ALIASES[normalized] ?? [normalized];
    return aliases.some((alias) => text.includes(alias));
  });
}

function relevanceScore(
  listing: PositionListing,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): number {
  const text = listingText(listing);
  let score = 0;
  const degree = DEGREE_TERM[degreeLevel].toLowerCase();

  if (text.includes(degree)) score += 3;
  if (degreeLevel === "phd" && /doctoral|studentship|research fellow|research assistant/.test(text)) score += 2;

  for (const term of fieldTerms(fieldHint)) {
    if (term && text.includes(term.toLowerCase())) score += 2;
  }

  for (const term of countryTerms(countryHint)) {
    if (term && text.includes(term)) score += 1;
  }

  return score;
}

async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint: string | undefined,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  const queries = buildQueries(site, degreeLevel, fieldHint, countryHint);
  const collected: PositionListing[] = [];
  const seen = new Set<string>();

  console.log(`Search plan ${site}: ${queries.length} queries`);

  for (const query of queries) {
    console.log(`Searching ${site}: ${query}`);

    if (braveSearchApiKey?.trim()) {
      try {
        const results = await searchBrave(braveSearchApiKey, query, site);
        console.log(`Brave Search: ${site} -> ${results.length} results`);
        for (const result of results) {
          const key = normalizeUrl(result.url);
          if (!seen.has(key)) {
            seen.add(key);
            collected.push(result);
          }
        }
      } catch (error) {
        console.error(`Brave Search failed for ${site}:`, String(error));
      }
    }

    try {
      const results = await searchBingRss(query, site);
      console.log(`Bing RSS: ${site} -> ${results.length} results`);
      for (const result of results) {
        const key = normalizeUrl(result.url);
        if (!seen.has(key)) {
          seen.add(key);
          collected.push(result);
        }
      }
    } catch (error) {
      console.error(`Bing RSS failed for ${site}:`, String(error));
    }
  }

  const selectedCountries = countryHint
    ? countryHint.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  const filtered = collected
    .filter((listing) => inferCountry(listing, selectedCountries))
    .sort(
      (a, b) =>
        relevanceScore(b, degreeLevel, fieldHint, countryHint) -
        relevanceScore(a, degreeLevel, fieldHint, countryHint),
    );

  console.log(
    `Search complete ${site}: ${collected.length} raw -> ${filtered.length} relevant results`,
  );

  return filtered.slice(0, 20);
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  const all: PositionListing[] = [];

  // Do not return early. A successful result from one portal must never hide
  // failures/zero results from the other configured portals.
  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      const results = await searchSite(
        site,
        degreeLevel,
        fieldHint,
        countryHint,
        braveSearchApiKey,
      );
      all.push(...results);
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const unique = new Map<string, PositionListing>();
  for (const listing of all) {
    const key = normalizeUrl(listing.url);
    if (key && !unique.has(key)) unique.set(key, listing);
  }

  console.log(
    `Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${unique.size} unique listings`,
  );

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
      `https://phdgermany.de/search?q=${q}`,
      `https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`,
      `https://www.jobs.ac.uk/search/?keywords=${q}`,
    ];
  }

  if (degreeLevel === "master") {
    return [
      `https://www.findamasters.com/masters-degrees/?Keywords=${q}`,
      `https://www.mastersportal.com/search/master/${q}`,
      `https://www.scholarship-positions.com/?s=${q}`,
    ];
  }

  return [
    `https://www.bachelorsportal.com/search/bachelor/${q}`,
    `https://www.scholarship-positions.com/?s=${q}`,
  ];
}
