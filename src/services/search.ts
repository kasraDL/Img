import type { DegreeLevel, PositionListing } from "../types";

/**
 * Search is intentionally bounded to stay below the Cloudflare Workers
 * subrequest limit. We search every configured portal independently, but use
 * at most one Brave request and one Bing RSS request per portal.
 */
const SITES_BY_DEGREE: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelorsportal.com", "scholarship-positions.com"],
  master: ["findamasters.com", "mastersportal.com", "scholarship-positions.com"],
  phd: ["findaphd.com", "phdportal.com", "euraxess.ec.europa.eu", "academicpositions.com", "phdgermany.de", "academicjobsonline.org", "jobs.ac.uk"],
};

const DEGREE_TERMS: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelor", "bachelors", "undergraduate"],
  master: ["master", "masters", "msc", "mres", "postgraduate"],
  phd: ["phd", "doctoral", "studentship", "research degree", "doctoral candidate"],
};

const FIELD_ALIASES: Record<string, string[]> = {
  "structural engineering": ["structural engineering", "structural mechanics", "civil engineering", "structures"],
  "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning", "data science"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning", "ai"],
  engineering: ["engineering", "technology"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"], usa: ["usa", "united states", "united states of america", "u.s.", "us", "american"],
  uk: ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland", "british"],
  germany: ["germany", "deutschland", "german", "berlin", "munich", "hamburg"], france: ["france", "french"],
  netherlands: ["netherlands", "the netherlands", "holland", "dutch"], switzerland: ["switzerland", "swiss", "zurich", "zürich", "geneva", "lausanne", "basel"],
  sweden: ["sweden", "swedish"], norway: ["norway", "norwegian"], finland: ["finland", "finnish"], denmark: ["denmark", "danish"],
  australia: ["australia", "australian"], "new zealand": ["new zealand", "nz", "zealand"], austria: ["austria", "austrian", "österreich", "vienna", "wien"],
  belgium: ["belgium", "belgian"], ireland: ["ireland", "irish"], italy: ["italy", "italian"], spain: ["spain", "spanish"],
  japan: ["japan", "japanese"], "south korea": ["south korea", "korea", "republic of korea", "korean"],
};

const SITE_QUERY_TERMS: Record<string, string> = {
  "findaphd.com": "PhD doctoral studentship", "phdportal.com": "PhD doctoral programme", "euraxess.ec.europa.eu": "PhD doctoral researcher",
  "academicpositions.com": "PhD doctoral researcher", "phdgermany.de": "PhD doctoral Doktorand Promotion", "academicjobsonline.org": "PhD doctoral research graduate",
  "jobs.ac.uk": "PhD studentship doctoral research", "findamasters.com": "Master MSc postgraduate", "mastersportal.com": "Master MSc postgraduate",
  "bachelorsportal.com": "Bachelor undergraduate", "scholarship-positions.com": "PhD Master scholarship studentship research",
};

function clean(value: string): string { return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeHost(hostname: string): string { return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }
function belongsToSourceSite(url: string, sourceSite: string): boolean {
  try { const hostname = normalizeHost(new URL(url).hostname); const site = normalizeHost(sourceSite); return hostname === site || hostname.endsWith(`.${site}`); }
  catch { return false; }
}
function decodeHtmlEntities(text: string): string {
  return text.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code: string) => { const n = Number(code); return Number.isFinite(n) ? String.fromCodePoint(n) : _; })
    .replace(/\s+/g, " ").trim();
}
function stripTags(text: string): string { return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ")); }
function termsForCountry(countryHint?: string): string[] {
  if (!countryHint) return [];
  return countryHint.split(",").map(v => v.trim().toLowerCase()).filter(Boolean).flatMap(v => COUNTRY_ALIASES[v] ?? [v]);
}
function termsForField(fieldHint: string): string[] {
  const field = clean(fieldHint).toLowerCase(); return field ? (FIELD_ALIASES[field] ?? [field]) : [];
}
function buildSiteQuery(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string {
  const degreeTerms = DEGREE_TERMS[degreeLevel].slice(0, 3).join(" OR ");
  const fieldTerms = termsForField(fieldHint).slice(0, 4).join(" OR ");
  const countryTerms = termsForCountry(countryHint).slice(0, 3).join(" OR ");
  const siteTerms = SITE_QUERY_TERMS[site] ?? degreeTerms;
  const parts = [`site:${site}`, `(${siteTerms})`, `(${degreeTerms})`];
  if (fieldTerms) parts.push(`(${fieldTerms})`); if (countryTerms) parts.push(`(${countryTerms})`);
  return clean(parts.join(" "));
}
function extractXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")); return match ? stripTags(match[1]) : "";
}
function parseBingRss(xml: string, sourceSite: string): PositionListing[] {
  const results: PositionListing[] = []; const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi; let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]; const title = extractXmlTag(block, "title"); const url = extractXmlTag(block, "link"); const snippet = extractXmlTag(block, "description");
    if (title && url && belongsToSourceSite(url, sourceSite)) results.push({ title, url, snippet, source_site: sourceSite });
  }
  return results;
}
async function searchBingRss(query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search"); url.searchParams.set("q", query); url.searchParams.set("format", "rss"); url.searchParams.set("count", "20"); url.searchParams.set("setlang", "en-US");
  const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/3.0)" } });
  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`); return parseBingRss(await response.text(), sourceSite);
}
function parseBraveResults(payload: unknown, sourceSite: string): PositionListing[] {
  if (typeof payload !== "object" || payload === null || !("web" in payload)) return [];
  const web = (payload as { web?: { results?: unknown[] } }).web; const raw = Array.isArray(web?.results) ? web.results : []; const results: PositionListing[] = [];
  for (const value of raw) {
    if (typeof value !== "object" || value === null) continue; const item = value as { title?: unknown; url?: unknown; description?: unknown };
    const title = typeof item.title === "string" ? stripTags(item.title) : ""; const url = typeof item.url === "string" ? item.url : ""; const snippet = typeof item.description === "string" ? stripTags(item.description) : "";
    if (title && url && belongsToSourceSite(url, sourceSite)) results.push({ title, url, snippet, source_site: sourceSite });
  }
  return results;
}
async function searchBrave(apiKey: string, query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search"); url.searchParams.set("q", query); url.searchParams.set("count", "20"); url.searchParams.set("search_lang", "en"); url.searchParams.set("safesearch", "moderate");
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } });
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`); return parseBraveResults(await response.json(), sourceSite);
}
function normalizeUrl(url: string): string {
  try { const parsed = new URL(url); parsed.hash = ""; parsed.search = ""; return parsed.toString().replace(/\/$/, "").toLowerCase(); }
  catch { return url.trim().toLowerCase(); }
}
function listingText(listing: PositionListing): string { return [listing.title, listing.snippet, listing.institution, listing.country, listing.url].filter(Boolean).join(" ").toLowerCase(); }
function scoreListing(listing: PositionListing, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): number {
  const text = listingText(listing); let score = 0;
  for (const term of DEGREE_TERMS[degreeLevel]) if (text.includes(term)) score += term === DEGREE_TERMS[degreeLevel][0] ? 5 : 2;
  for (const term of termsForField(fieldHint)) if (text.includes(term.toLowerCase())) score += 4;
  for (const term of termsForCountry(countryHint)) if (text.includes(term)) score += 3;
  return score;
}
function rankResults(listings: PositionListing[], degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): PositionListing[] {
  return listings.map((listing, index) => ({ listing, index, score: scoreListing(listing, degreeLevel, fieldHint, countryHint) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(x => x.listing).slice(0, 20);
}
async function searchSite(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, braveSearchApiKey?: string): Promise<PositionListing[]> {
  const query = buildSiteQuery(site, degreeLevel, fieldHint, countryHint); const collected = new Map<string, PositionListing>();
  console.log(`Search plan ${site}: 1 primary query + optional second provider`); console.log(`Searching ${site}: ${query}`);
  if (braveSearchApiKey?.trim()) {
    try { const results = await searchBrave(braveSearchApiKey, query, site); console.log(`Brave Search: ${site} -> ${results.length} results`); for (const r of results) collected.set(normalizeUrl(r.url), r); }
    catch (error) { console.error(`Brave Search failed for ${site}:`, String(error)); }
  }
  try { const results = await searchBingRss(query, site); console.log(`Bing RSS: ${site} -> ${results.length} results`); for (const r of results) { const key = normalizeUrl(r.url); if (!collected.has(key)) collected.set(key, r); } }
  catch (error) { console.error(`Bing RSS failed for ${site}:`, String(error)); }
  const ranked = rankResults(Array.from(collected.values()), degreeLevel, fieldHint, countryHint);
  console.log(`Search complete ${site}: ${collected.size} raw -> ${ranked.length} ranked results`); return ranked;
}
export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, braveSearchApiKey?: string): Promise<PositionListing[]> {
  const sites = SITES_BY_DEGREE[degreeLevel] ?? []; const all: PositionListing[] = [];
  for (const site of sites) { try { all.push(...await searchSite(site, degreeLevel, fieldHint, countryHint, braveSearchApiKey)); } catch (error) { console.error(`Site search failed for ${site}:`, String(error)); } }
  const unique = new Map<string, PositionListing>(); for (const listing of all) { const key = normalizeUrl(listing.url); if (key && !unique.has(key)) unique.set(key, listing); }
  const finalResults = rankResults(Array.from(unique.values()), degreeLevel, fieldHint, countryHint);
  console.log(`Multi-site search complete: ${sites.length} sites, ${finalResults.length} unique listings`); return finalResults;
}
export function fallbackSearchLinks(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string[] {
  const q = encodeURIComponent([fieldHint, countryHint ?? ""].filter(Boolean).join(" "));
  if (degreeLevel === "phd") return [
    `https://www.findaphd.com/phds/?Keywords=${q}`, `https://www.phdportal.com/search/phd/${q}`, `https://euraxess.ec.europa.eu/jobs/search?keywords=${q}`,
    `https://academicpositions.com/find-jobs?query=${q}`, `https://phdgermany.de/search?q=${q}`, `https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`, `https://www.jobs.ac.uk/search/?keywords=${q}`,
  ];
  if (degreeLevel === "master") return [`https://www.findamasters.com/masters-degrees/?Keywords=${q}`, `https://www.mastersportal.com/search/master/${q}`, `https://www.scholarship-positions.com/?s=${q}`];
  return [`https://www.bachelorsportal.com/search/bachelor/${q}`, `https://www.scholarship-positions.com/?s=${q}`];
}
