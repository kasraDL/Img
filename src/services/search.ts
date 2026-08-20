import type { DegreeLevel, PositionListing } from "../types";

/**
 * Multi-site search is intentionally bounded: one primary provider request per
 * portal, followed by one fallback request only when the primary provider
 * returns no usable results. This keeps a Worker invocation well below the
 * Cloudflare subrequest limit while still giving every configured portal an
 * independent search attempt.
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

const DEGREE_TERMS: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelor", "bachelors", "undergraduate"],
  master: ["master", "masters", "msc", "mres", "postgraduate"],
  phd: ["phd", "doctoral", "doctorate", "studentship", "research fellow", "doktorand", "promotion"],
};

const SITE_TERMS: Record<string, string[]> = {
  "findaphd.com": ["phd", "phd project", "doctoral", "studentship"],
  "phdportal.com": ["phd", "doctoral", "doctoral programme", "doctoral program"],
  "euraxess.ec.europa.eu": ["phd", "doctoral", "researcher", "research position"],
  "academicpositions.com": ["phd", "doctoral", "researcher", "research assistant"],
  "phdgermany.de": ["phd", "doctoral", "promotion", "doktorand"],
  "academicjobsonline.org": ["phd", "doctoral", "research", "graduate"],
  "jobs.ac.uk": ["phd", "studentship", "doctoral", "research assistant", "research fellow"],
  "findamasters.com": ["master", "masters", "msc", "mres", "postgraduate"],
  "mastersportal.com": ["master", "masters", "msc", "mres", "postgraduate"],
  "bachelorsportal.com": ["bachelor", "bachelors", "undergraduate"],
  "scholarship-positions.com": ["scholarship", "studentship", "phd", "master", "research"],
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"],
  usa: ["usa", "united states", "united states of america", "u.s."],
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
  "south korea": ["south korea", "republic of korea", "korean"],
};

const FIELD_ALIASES: Record<string, string[]> = {
  "structural engineering": [
    "structural engineering",
    "structural mechanics",
    "structural analysis",
    "structural design",
    "civil engineering",
    "structures",
  ],
  "civil engineering": [
    "civil engineering",
    "structural engineering",
    "construction",
    "infrastructure",
  ],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning", "ai"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning", "ai"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
};

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function belongsToSourceSite(url: string, sourceSite: string): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    const site = normalizeHost(sourceSite);
    return host === site || host.endsWith(`.${site}`);
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
}

function stripTags(text: string): string {
  return clean(decodeEntities(text.replace(/<[^>]+>/g, " ")));
}

function countryTerms(countryHint?: string): string[] {
  if (!countryHint) return [];
  return countryHint
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((v) => COUNTRY_ALIASES[v] ?? [v]);
}

function fieldTerms(fieldHint: string): string[] {
  const field = clean(fieldHint).toLowerCase();
  if (!field) return [];
  return FIELD_ALIASES[field] ?? [field];
}

function searchTerms(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string {
  const degree = DEGREE_TERMS[degreeLevel].slice(0, 4).join(" OR ");
  const siteTerms = (SITE_TERMS[site] ?? DEGREE_TERMS[degreeLevel]).slice(0, 4).join(" OR ");
  const field = fieldTerms(fieldHint).slice(0, 5).join(" OR ");
  const countries = countryTerms(countryHint).slice(0, 4).join(" OR ");
  return [
    `site:${site}`,
    `(${siteTerms})`,
    field ? `(${field})` : `(${degree})`,
    countries ? `(${countries})` : "",
  ].filter(Boolean).join(" ");
}

function fallbackQuery(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string {
  const field = fieldTerms(fieldHint).slice(0, 3).join(" OR ");
  const countries = countryTerms(countryHint).slice(0, 3).join(" OR ");
  const degree = DEGREE_TERMS[degreeLevel].slice(0, 3).join(" OR ");
  return [
    `site:${site}`,
    field ? `(${field})` : `(${degree})`,
    countries ? `(${countries})` : "",
  ].filter(Boolean).join(" ");
}

function parseBrave(payload: unknown, sourceSite: string): PositionListing[] {
  const web = typeof payload === "object" && payload !== null && "web" in payload
    ? (payload as { web?: { results?: unknown[] } }).web
    : undefined;
  const raw = Array.isArray(web?.results) ? web.results : [];
  const out: PositionListing[] = [];

  for (const value of raw) {
    if (typeof value !== "object" || value === null) continue;
    const item = value as { title?: unknown; url?: unknown; description?: unknown };
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? stripTags(item.title) : "";
    const snippet = typeof item.description === "string" ? stripTags(item.description) : "";
    if (!url || !title || !belongsToSourceSite(url, sourceSite)) continue;
    out.push({ title, url, snippet, source_site: sourceSite });
  }
  return out;
}

function xmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function parseBing(xml: string, sourceSite: string): PositionListing[] {
  const out: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = xmlTag(block, "title");
    const url = xmlTag(block, "link");
    const snippet = xmlTag(block, "description");
    if (!title || !url || !belongsToSourceSite(url, sourceSite)) continue;
    out.push({ title, url, snippet, source_site: sourceSite });
  }
  return out;
}

async function searchBrave(apiKey: string, query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("search_lang", "en");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
  });
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`);
  return parseBrave(await response.json(), sourceSite);
}

async function searchBing(query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "10");
  url.searchParams.set("setlang", "en-US");
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/3.0)",
    },
  });
  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBing(await response.text(), sourceSite);
}

function listingText(listing: PositionListing): string {
  return [listing.title, listing.snippet, listing.institution, listing.country, listing.url]
    .filter(Boolean).join(" ").toLowerCase();
}

function hasCountryConflict(listing: PositionListing, selectedCountries: string[]): boolean {
  if (selectedCountries.length === 0) return false;
  const text = listingText(listing);
  const selected = selectedCountries.flatMap((c) => COUNTRY_ALIASES[c.toLowerCase()] ?? [c.toLowerCase()]);
  const allKnown = Object.values(COUNTRY_ALIASES).flat();
  const explicitOther = allKnown.some((country) => text.includes(country) && !selected.includes(country));
  return explicitOther && !selected.some((country) => text.includes(country));
}

function relevanceScore(listing: PositionListing, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): number {
  const text = listingText(listing);
  let score = 0;
  if (DEGREE_TERMS[degreeLevel].some((term) => text.includes(term))) score += 5;
  for (const term of fieldTerms(fieldHint)) if (term && text.includes(term.toLowerCase())) score += 4;
  for (const term of countryTerms(countryHint)) if (term && text.includes(term)) score += 3;
  if (listing.institution) score += 1;
  if (listing.deadline) score += 1;
  return score;
}

async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint: string | undefined,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  const primary = searchTerms(site, degreeLevel, fieldHint, countryHint);
  const fallback = fallbackQuery(site, degreeLevel, fieldHint, countryHint);
  const collected = new Map<string, PositionListing>();

  console.log(`Search plan ${site}: primary provider + fallback only if needed`);
  console.log(`Searching ${site}: ${primary}`);

  let primaryResults: PositionListing[] = [];
  if (braveSearchApiKey?.trim()) {
    try {
      primaryResults = await searchBrave(braveSearchApiKey, primary, site);
      console.log(`Brave Search: ${site} -> ${primaryResults.length} results`);
    } catch (error) {
      console.error(`Brave Search failed for ${site}:`, String(error));
    }
  }

  if (primaryResults.length === 0) {
    try {
      primaryResults = await searchBing(primary, site);
      console.log(`Bing RSS: ${site} -> ${primaryResults.length} results`);
    } catch (error) {
      console.error(`Bing RSS failed for ${site}:`, String(error));
    }
  }

  for (const result of primaryResults) collected.set(normalizeUrl(result.url), result);

  // Provider fallback is executed only when the primary query produced no
  // usable listing. This bounds each portal to at most two provider calls.
  if (collected.size === 0 && fallback !== primary) {
    console.log(`Fallback search ${site}: ${fallback}`);
    try {
      const fallbackResults = await searchBing(fallback, site);
      console.log(`Bing fallback: ${site} -> ${fallbackResults.length} results`);
      for (const result of fallbackResults) collected.set(normalizeUrl(result.url), result);
    } catch (error) {
      console.error(`Fallback search failed for ${site}:`, String(error));
    }
  }

  const selectedCountries = countryHint?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  const ranked = Array.from(collected.values())
    .filter((listing) => !hasCountryConflict(listing, selectedCountries))
    .sort((a, b) => relevanceScore(b, degreeLevel, fieldHint, countryHint) - relevanceScore(a, degreeLevel, fieldHint, countryHint));

  console.log(`Search complete ${site}: ${collected.size} raw -> ${ranked.length} ranked results`);
  return ranked.slice(0, 20);
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  const all: PositionListing[] = [];

  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(...await searchSite(site, degreeLevel, fieldHint, countryHint, braveSearchApiKey));
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const unique = new Map<string, PositionListing>();
  for (const listing of all) {
    const key = normalizeUrl(listing.url);
    if (key && !unique.has(key)) unique.set(key, listing);
  }

  console.log(`Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${unique.size} unique listings`);
  return Array.from(unique.values());
}

export function fallbackSearchLinks(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const q = encodeURIComponent([fieldHint, countryHint ?? ""].filter(Boolean).join(" "));
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
