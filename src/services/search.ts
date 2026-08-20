import type { DegreeLevel, PositionListing } from "../types";

const MAX_SEARCH_CANDIDATES = 10;

const SITES_BY_DEGREE: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelorsportal.com", "scholarship-positions.com"],
  master: ["findamasters.com", "mastersportal.com", "scholarship-positions.com"],
  phd: ["findaphd.com", "phdportal.com", "euraxess.ec.europa.eu", "academicpositions.com", "phdgermany.de", "academicjobsonline.org", "jobs.ac.uk"],
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"],
  usa: ["usa", "united states", "united states of america", "u.s.", "american"],
  uk: ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland", "britain", "british"],
  germany: ["germany", "deutschland", "german"],
  france: ["france", "french"],
  netherlands: ["netherlands", "the netherlands", "holland", "dutch"],
  switzerland: ["switzerland", "swiss"],
  sweden: ["sweden", "swedish"],
  norway: ["norway", "norwegian"],
  finland: ["finland", "finnish"],
  denmark: ["denmark", "danish"],
  australia: ["australia", "australian"],
  "new zealand": ["new zealand", "nz", "new-zealand"],
  austria: ["austria", "austrian", "österreich"],
  belgium: ["belgium", "belgian"],
  ireland: ["ireland", "irish"],
  italy: ["italy", "italian"],
  spain: ["spain", "spanish"],
  japan: ["japan", "japanese"],
  "south korea": ["south korea", "republic of korea", "korean"],
};

const FIELD_ALIASES: Record<string, string[]> = {
  engineering: ["engineering"],
  "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
  "structural engineering": ["structural engineering", "structural mechanics", "structural analysis", "structural design", "civil engineering", "structures"],
  "mechanical engineering": ["mechanical engineering", "mechanical", "mechatronics"],
  "electrical engineering": ["electrical engineering", "electrical", "electronics"],
  "chemical engineering": ["chemical engineering", "chemical process", "process engineering"],
  "transportation engineering": ["transportation engineering", "transportation", "traffic engineering", "mobility"],
  "water resources": ["water resources", "hydrology", "hydraulic engineering", "water engineering"],
  "computer science": ["computer science", "computer sciences", "computing", "software"],
  "artificial intelligence": ["artificial intelligence", "ai", "machine learning", "deep learning"],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning"],
  "computer vision": ["computer vision", "image processing", "visual computing"],
  "data science": ["data science", "data analytics", "machine learning"],
  "software engineering": ["software engineering", "software development", "software"],
  robotics: ["robotics", "robotic", "automation"],
  "environmental science": ["environmental science", "environmental studies", "environment"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
  "water treatment": ["water treatment", "water purification", "drinking water"],
  wastewater: ["wastewater", "waste water", "sewage", "water treatment"],
  "climate science": ["climate science", "climate", "climatology"],
  sustainability: ["sustainability", "sustainable development", "sustainable"],
  architecture: ["architecture", "architectural design"],
  business: ["business", "management", "business administration"],
  economics: ["economics", "economic"],
  medicine: ["medicine", "medical", "clinical"],
};

const SITE_TERMS: Record<string, string[]> = {
  "findaphd.com": ["phd", "doctoral", "studentship"],
  "phdportal.com": ["phd", "doctoral", "doctoral programme"],
  "euraxess.ec.europa.eu": ["phd", "doctoral", "researcher"],
  "academicpositions.com": ["phd", "doctoral", "researcher"],
  "phdgermany.de": ["phd", "doctoral", "doktorand", "promotion"],
  "academicjobsonline.org": ["phd", "doctoral", "research", "graduate"],
  "jobs.ac.uk": ["phd", "studentship", "doctoral", "research assistant"],
  "findamasters.com": ["master", "masters", "msc", "postgraduate"],
  "mastersportal.com": ["master", "masters", "msc", "postgraduate"],
  "bachelorsportal.com": ["bachelor", "bachelors", "undergraduate"],
  "scholarship-positions.com": ["scholarship", "studentship", "research"],
};

const NAV_TITLES = new Set(["view jobs", "view all jobs", "search", "next", "previous", "login", "sign in", "register", "home", "jobs", "all jobs", "job search", "find jobs", "view more"]);

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function isSourceUrl(url: string, site: string): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    const wanted = normalizeHost(site);
    return host === wanted || host.endsWith(`.${wanted}`);
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTags(value: string): string {
  return clean(decodeEntities(value.replace(/<[^>]+>/g, " ")));
}

function fieldTerms(fieldHint: string): string[] {
  const key = clean(fieldHint).toLowerCase();
  return key ? FIELD_ALIASES[key] ?? [key] : [];
}

function countryTerms(countryHint?: string): string[] {
  if (!countryHint) return [];
  return countryHint
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((v) => COUNTRY_ALIASES[v] ?? [v]);
}

function degreeTerms(level: DegreeLevel): string[] {
  if (level === "phd") return ["phd", "doctoral", "doctorate", "studentship", "doctoral researcher"];
  if (level === "master") return ["master", "masters", "msc", "mres", "postgraduate"];
  return ["bachelor", "bachelors", "undergraduate", "bsc"];
}

function listingText(listing: PositionListing): string {
  return [listing.title, listing.snippet, listing.institution, listing.country, listing.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

/**
 * Core filters are deliberately metadata-aware.
 *
 * A missing country/field/degree signal is UNKNOWN, not a mismatch, because
 * many portals put location/discipline on the detail page rather than in the
 * search-result title/snippet. Only an explicit conflicting signal rejects a
 * result here. This prevents valid positions from being dropped simply because
 * the search provider omitted a country or discipline from its snippet.
 */
function passesCoreFilters(
  listing: PositionListing,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): boolean {
  const text = listingText(listing);
  const fields = fieldTerms(fieldHint);
  const countries = countryTerms(countryHint);
  const degrees = degreeTerms(degreeLevel);

  // An explicit listing.country is authoritative when present.
  if (countries.length && listing.country) {
    const explicitCountry = listing.country.toLowerCase();
    if (!matchesAny(explicitCountry, countries)) return false;
  }

  // An explicit listing field is authoritative when present.
  if (fields.length && listing.field) {
    const explicitField = listing.field.toLowerCase();
    if (!matchesAny(explicitField, fields)) return false;
  }

  // Only reject a clear textual conflict. Missing degree/field/country text is
  // allowed through to the scoring stage/detail extraction.
  const degreeMatch = matchesAny(text, degrees);
  if (!degreeMatch && listing.source_site === "findamasters.com" && degreeLevel !== "master") return false;
  if (!degreeMatch && listing.source_site === "mastersportal.com" && degreeLevel !== "master") return false;
  if (!degreeMatch && listing.source_site === "bachelorsportal.com" && degreeLevel !== "bachelor") return false;

  // If the raw result explicitly names a different known country, reject it.
  if (countries.length) {
    const knownCountries = Object.values(COUNTRY_ALIASES).flat();
    const mentionsSelected = matchesAny(text, countries);
    const mentionsOther = knownCountries.some((country) => text.includes(country) && !countries.includes(country));
    if (mentionsOther && !mentionsSelected) return false;
  }

  return true;
}

function relevanceScore(
  listing: PositionListing,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): number {
  const text = listingText(listing);
  let score = 0;
  if (matchesAny(text, degreeTerms(degreeLevel))) score += 5;
  for (const term of fieldTerms(fieldHint)) if (text.includes(term)) score += 4;
  for (const term of countryTerms(countryHint)) if (text.includes(term)) score += 3;
  if (listing.institution) score += 1;
  if (listing.country) score += 2;
  if (listing.field) score += 2;
  if (listing.deadline) score += 1;
  return score;
}

function dedupe(listings: PositionListing[]): PositionListing[] {
  const map = new Map<string, PositionListing>();
  for (const listing of listings) {
    const key = normalizeUrl(listing.url);
    if (key && !map.has(key)) map.set(key, listing);
  }
  return Array.from(map.values());
}

function parseSearchHtml(html: string, site: string): PositionListing[] {
  const results: PositionListing[] = [];
  const regex = /<a\b([^>]*)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = decodeEntities(match[2]);
    const title = stripTags(match[3]);
    if (!href || !title || title.length < 5 || !isSourceUrl(href, site)) continue;
    if (NAV_TITLES.has(title.toLowerCase())) continue;
    results.push({ title, url: href, snippet: "", source_site: site });
  }
  return dedupe(results);
}

function parseBingRss(xml: string, site: string): PositionListing[] {
  const results: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    const url = linkMatch ? stripTags(linkMatch[1]) : "";
    const snippet = descMatch ? stripTags(descMatch[1]) : "";
    if (!title || !url || !isSourceUrl(url, site) || NAV_TITLES.has(title.toLowerCase())) continue;
    results.push({ title, url, snippet, source_site: site });
  }
  return dedupe(results);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/5.0)",
    },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function directSearchUrls(site: string, fieldHint: string, countryHint?: string): string[] {
  const field = encodeURIComponent(fieldHint || "");
  const countries = (countryHint ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  switch (site) {
    case "findaphd.com": return [`https://www.findaphd.com/phds/?Keywords=${field}`];
    case "phdportal.com": return [`https://www.phdportal.com/search/phd/engineering-technology?keyword=${field}`];
    case "euraxess.ec.europa.eu": return [`https://euraxess.ec.europa.eu/jobs?keywords=${field}`, ...countries.slice(0, 2).map((c) => `https://euraxess.ec.europa.eu/jobs?keywords=${field}&country=${encodeURIComponent(c)}`)];
    case "academicpositions.com": return countries.length ? countries.slice(0, 2).map((c) => `https://academicpositions.com/jobs/country/${c.toLowerCase().replace(/\s+/g, "-")}`) : [`https://academicpositions.com/search?query=${field}`];
    case "phdgermany.de": return [`https://phdgermany.de/search?q=${field}`];
    case "academicjobsonline.org": return [`https://academicjobsonline.org/ajo?joblist=1&keywords=${field}`];
    case "jobs.ac.uk": return [`https://www.jobs.ac.uk/search/?keywords=${field}`];
    case "findamasters.com": return [`https://www.findamasters.com/masters-degrees/?Keywords=${field}`];
    case "mastersportal.com": return [`https://www.mastersportal.com/search/master/${field}`];
    case "bachelorsportal.com": return [`https://www.bachelorsportal.com/search/bachelor/${field}`];
    case "scholarship-positions.com": return [`https://www.scholarship-positions.com/?s=${field}`];
    default: return [];
  }
}

async function directPortalSearch(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): Promise<PositionListing[]> {
  const out: PositionListing[] = [];
  for (const url of directSearchUrls(site, fieldHint, countryHint)) {
    try {
      console.log(`Direct portal search ${site}: ${url}`);
      const response = await fetchText(url);
      if (!response.ok) {
        console.log(`Direct portal ${site}: HTTP ${response.status}`);
        continue;
      }
      out.push(...parseSearchHtml(response.text, site).slice(0, 20));
      if (out.length >= 20) break;
    } catch (error) {
      console.error(`Direct portal search failed for ${site}:`, String(error));
    }
  }
  return dedupe(out).slice(0, 20);
}

async function searchBing(query: string, site: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "10");
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/5.0)",
    },
  });
  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), site);
}

function providerQuery(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string {
  const degree = degreeLevel === "phd" ? "phd OR doctoral OR studentship" : degreeLevel === "master" ? "master OR masters OR msc" : "bachelor OR undergraduate";
  const siteTerms = (SITE_TERMS[site] ?? [degree]).slice(0, 4).join(" OR ");
  const fields = fieldTerms(fieldHint).slice(0, 5).join(" OR ");
  const countries = countryTerms(countryHint).slice(0, 5).join(" OR ");
  return [`site:${site}`, `(${siteTerms || degree})`, fields ? `(${fields})` : "", countries ? `(${countries})` : ""].filter(Boolean).join(" ");
}

async function searchSite(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): Promise<PositionListing[]> {
  let collected = await directPortalSearch(site, degreeLevel, fieldHint, countryHint);
  console.log(`Direct search complete ${site}: ${collected.length} results`);

  if (!collected.length) {
    const query = providerQuery(site, degreeLevel, fieldHint, countryHint);
    console.log(`Provider fallback ${site}: ${query}`);
    try {
      collected = await searchBing(query, site);
      console.log(`Bing fallback ${site}: ${collected.length} results`);
    } catch (error) {
      console.error(`Bing fallback failed for ${site}:`, String(error));
    }
  }

  const rawCount = collected.length;
  const filtered = collected.filter((listing) => passesCoreFilters(listing, degreeLevel, fieldHint, countryHint));
  console.log(`Search complete ${site}: ${rawCount} raw -> ${filtered.length} after hard filters -> ${filtered.length} ranked`);

  return filtered
    .sort((a, b) => relevanceScore(b, degreeLevel, fieldHint, countryHint) - relevanceScore(a, degreeLevel, fieldHint, countryHint))
    .slice(0, 20);
}

export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): Promise<PositionListing[]> {
  const all: PositionListing[] = [];
  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(...await searchSite(site, degreeLevel, fieldHint, countryHint));
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const unique = dedupe(all).slice(0, MAX_SEARCH_CANDIDATES);
  console.log(`Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${unique.length} filtered unique listings, returning ${unique.length} candidates for AI matching`);
  return unique;
}

export function fallbackSearchLinks(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string[] {
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
