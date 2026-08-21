import type { DegreeLevel, PositionType, PositionListing, SearchFilters } from "../types";

const SITES_BY_DEGREE: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelorsportal.com", "scholarship-positions.com"],
  master: ["findamasters.com", "mastersportal.com", "scholarship-positions.com"],
  phd: ["findaphd.com", "phdportal.com", "euraxess.ec.europa.eu", "academicpositions.com", "phdgermany.de", "academicjobsonline.org", "jobs.ac.uk"],
};

const FIELD_ALIASES: Record<string, string[]> = {
  engineering: ["engineering", "civil engineering", "structural engineering", "mechanical engineering", "electrical engineering", "chemical engineering"],
  "structural engineering": ["structural engineering", "structural mechanics", "structural analysis", "structural design", "civil engineering", "structures"],
  "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
  "mechanical engineering": ["mechanical engineering", "mechanics", "thermodynamics", "materials engineering"],
  "electrical engineering": ["electrical engineering", "electronics", "electrical systems", "control engineering"],
  "chemical engineering": ["chemical engineering", "process engineering", "chemical processes"],
  "transportation engineering": ["transportation engineering", "transportation", "traffic engineering", "transport systems"],
  "water resources": ["water resources", "hydrology", "hydraulic engineering", "water engineering"],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning", "ai"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning", "ai"],
  "computer vision": ["computer vision", "image processing", "visual recognition", "artificial intelligence"],
  "data science": ["data science", "machine learning", "statistics", "data analytics"],
  "software engineering": ["software engineering", "software development", "computer science"],
  robotics: ["robotics", "robot", "automation", "control engineering"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
  "water treatment": ["water treatment", "wastewater treatment", "water purification"],
  wastewater: ["wastewater", "wastewater treatment", "sewage", "water treatment"],
  "climate science": ["climate science", "climate change", "climate research"],
  sustainability: ["sustainability", "sustainable development", "environmental engineering"],
  architecture: ["architecture", "architectural design", "built environment"],
  business: ["business", "management", "business administration"],
  economics: ["economics", "econometrics", "economic research"],
  medicine: ["medicine", "medical", "clinical", "health sciences"],
};

const RESEARCH_AREA_PARENT: Record<string, string> = {
  "civil engineering": "engineering",
  "structural engineering": "engineering",
  "mechanical engineering": "engineering",
  "electrical engineering": "engineering",
  "chemical engineering": "engineering",
  "transportation engineering": "engineering",
  "water resources": "engineering",
  "artificial intelligence": "computer science",
  "machine learning": "computer science",
  "computer vision": "computer science",
  "data science": "computer science",
  "software engineering": "computer science",
  robotics: "computer science",
  "environmental engineering": "environmental science",
  "water treatment": "environmental science",
  wastewater: "environmental science",
  "climate science": "environmental science",
  sustainability: "environmental science",
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"], usa: ["usa", "united states", "united states of america", "u.s."],
  uk: ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland"],
  germany: ["germany", "deutschland", "german"], france: ["france", "french"],
  netherlands: ["netherlands", "the netherlands", "holland", "dutch"], switzerland: ["switzerland", "swiss"],
  sweden: ["sweden", "swedish"], norway: ["norway", "norwegian"], finland: ["finland", "finnish"],
  denmark: ["denmark", "danish"], australia: ["australia", "australian"], "new zealand": ["new zealand", "nz"],
  austria: ["austria", "austrian", "österreich"], belgium: ["belgium", "belgian"], ireland: ["ireland", "irish"],
  italy: ["italy", "italian"], spain: ["spain", "spanish"], japan: ["japan", "japanese"],
  "south korea": ["south korea", "republic of korea", "korean"],
};

const FUNDING_TERMS = ["funded", "fully funded", "funding available", "scholarship", "studentship", "stipend", "salary", "paid", "tuition waiver", "financial support"];
const SELF_FUNDED_TERMS = ["self-funded", "self funded", "self finance", "self-finance", "no funding", "without funding"];

const NAV_TITLES = new Set([
  "view jobs", "view all jobs", "view programme information", "view program information",
  "view all programs", "view all programmes", "search", "next", "previous", "login",
  "sign in", "register", "home", "jobs", "all jobs", "job search", "find jobs", "view more",
  "international", "swedish svenska", "danish dansk", "norwegian norsk", "finnish suomi",
  "french français", "german deutsch", "dutch nederlands", "italian italiano", "spanish español",
  "medicine & health", "computer science & it", "business & management", "engineering & technology",
  "natural sciences & mathematics", "social sciences", "arts, design & architecture",
]);

interface SearchScope {
  field: boolean;
  research_area: boolean;
  country: boolean;
  degree: boolean;
}

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function normalizeHost(hostname: string): string { return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); }
function isSourceUrl(url: string, site: string): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    const wanted = normalizeHost(site);
    return host === wanted || host.endsWith(`.${wanted}`);
  } catch { return false; }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Academic Positions uses locale query parameters only to change UI language;
    // they must not create duplicate candidates.
    parsed.searchParams.delete("locale");
    // Remove common analytics/tracking parameters.
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch { return url.trim().toLowerCase(); }
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

function stripTags(value: string): string { return clean(decodeEntities(value.replace(/<[^>]+>/g, " "))); }
function slug(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function fieldTerms(value: string): string[] { const key = clean(value).toLowerCase(); return key ? FIELD_ALIASES[key] ?? [key] : []; }
function countryTerms(value?: string): string[] { if (!value) return []; return value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).flatMap((x) => COUNTRY_ALIASES[x] ?? [x]); }
function degreeTerms(level: DegreeLevel): string[] { if (level === "phd") return ["phd", "doctoral", "doctorate", "studentship", "doctoral researcher", "doktorand", "promotion"]; if (level === "master") return ["master", "masters", "msc", "mres", "postgraduate"]; return ["bachelor", "bachelors", "undergraduate", "bsc"]; }
function listingText(listing: PositionListing): string { return [listing.title, listing.snippet, listing.institution, listing.country, listing.url].filter(Boolean).join(" ").toLowerCase(); }
function containsAny(text: string, terms: string[]): boolean { return terms.some((term) => text.includes(term.toLowerCase())); }
function countryCanonical(text: string): string | undefined { const lower = text.toLowerCase(); for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) if (aliases.some((alias) => lower.includes(alias))) return country; return undefined; }
function siteGuaranteesDegree(site: string, level: DegreeLevel): boolean { if (level === "phd") return ["findaphd.com", "phdportal.com", "phdgermany.de"].includes(site); if (level === "master") return ["findamasters.com", "mastersportal.com"].includes(site); return site === "bachelorsportal.com"; }

function pathOf(url: string): string {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
}

function hasLocaleOnly(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("locale") && Array.from(parsed.searchParams.keys()).every((key) => key === "locale");
  } catch { return false; }
}

function looksLikeCategoryPage(site: string, url: string, title: string): boolean {
  const path = pathOf(url);
  const lowerTitle = clean(title).toLowerCase();
  if (NAV_TITLES.has(lowerTitle)) return true;
  if (hasLocaleOnly(url)) return true;

  switch (site) {
    case "phdportal.com":
      if (path.includes("/search/") || path.includes("/study-options/") || path.includes("/countries/") || path.includes("/universities/") || path.includes("/scholarships/")) return true;
      return !path.includes("/studies/");

    case "academicpositions.com":
      if (path.startsWith("/jobs/") || path.startsWith("/search") || path.includes("/find-jobs")) return true;
      return !path.includes("/ad/") && !path.includes("/job/");

    case "euraxess.ec.europa.eu":
      if (path === "/jobs" || path === "/jobs/") return true;
      return !/^\/jobs\/[^/]+/.test(path);

    case "academicjobsonline.org":
      if (path === "/ajo" || path === "/ajo/" || path.startsWith("/ajo?")) return true;
      return !path.includes("/ajo/jobs/");

    case "jobs.ac.uk":
      if (path.startsWith("/search") || path.startsWith("/categories") || path.startsWith("/category")) return true;
      return !/^\/job\/\d+/.test(path);

    case "findaphd.com":
      if (path.startsWith("/phds/") && !path.includes("/project/")) return true;
      return !path.includes("/project/");

    case "phdgermany.de":
      if (path.startsWith("/search") || path === "/" || path === "") return true;
      return !/(stellenangebot|stellenangebote|job|jobs|position)/.test(path);

    case "mastersportal.com":
    case "findamasters.com":
    case "bachelorsportal.com":
      return path.startsWith("/search") || path.startsWith("/masters") || path.startsWith("/bachelors") || path === "/";

    case "scholarship-positions.com":
      return path === "/" || path.startsWith("/category/") || path.startsWith("/search");

    default:
      return false;
  }
}

function looksLikeRealPosition(site: string, url: string, title: string): boolean {
  if (!isSourceUrl(url, site)) return false;
  if (looksLikeCategoryPage(site, url, title)) return false;
  if (title.length < 8) return false;
  if (/^(international|swedish|danish|norwegian|finnish|french|german|dutch|italian|spanish)(\s|$)/i.test(title)) return false;
  if (/^(view|search|find|all|browse|jobs|programmes|programs|studies|scholarships|categories)\b/i.test(title)) return false;
  return true;
}

function countryMatch(listing: PositionListing, selected: string[], scopeCountry: boolean): boolean {
  if (!selected.length) return true;
  const text = listingText(listing);
  const wanted = selected.map((x) => x.toLowerCase());
  if (listing.country) {
    const canonical = countryCanonical(listing.country);
    if (canonical) return wanted.includes(canonical);
    return wanted.some((x) => listing.country!.toLowerCase().includes(x));
  }
  if (wanted.some((country) => (COUNTRY_ALIASES[country] ?? [country]).some((alias) => text.includes(alias)))) return true;
  return scopeCountry;
}

function fieldMatch(listing: PositionListing, value: string | undefined, scoped: boolean): boolean {
  if (!value?.trim()) return true;
  return containsAny(listingText(listing), fieldTerms(value)) || scoped;
}
function fundingMatch(listing: PositionListing, preference: SearchFilters["funding"]): boolean { if (!preference || preference === "both") return true; const text = listingText(listing); if (preference === "funded") return containsAny(text, FUNDING_TERMS); return containsAny(text, SELF_FUNDED_TERMS); }
function positionTypeMatch(listing: PositionListing, selected: PositionType[]): boolean {
  if (!selected.length) return true;
  const text = listingText(listing);
  return selected.some((type) => {
    if (type === "other") return true;
    if (type === "phd") return containsAny(text, ["phd", "doctoral", "doctorate", "studentship"]);
    if (type === "masters") return containsAny(text, ["master", "masters", "msc", "mres"]);
    if (type === "bachelor") return containsAny(text, ["bachelor", "bachelors", "bsc", "undergraduate"]);
    if (type === "research_assistant") return text.includes("research assistant");
    if (type === "research_fellow") return text.includes("research fellow");
    if (type === "internship") return containsAny(text, ["internship", "intern"]);
    return false;
  });
}
function keywordMatch(listing: PositionListing, keywords?: string): boolean { if (!keywords?.trim()) return true; const items = keywords.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); if (!items.length) return true; return items.some((item) => listingText(listing).includes(item)); }
function deadlineMatch(listing: PositionListing, required?: boolean): boolean { if (!required) return true; const text = listingText(listing); return Boolean(listing.deadline || /deadline|apply by|application closes|applications close|closing date|closing deadline/.test(text)); }

function coreFilterMatch(listing: PositionListing, filters: SearchFilters, scope: SearchScope): boolean {
  if (!looksLikeRealPosition(listing.source_site ?? "", listing.url, listing.title)) return false;
  const text = listingText(listing);
  const degreeOk = containsAny(text, degreeTerms(filters.degree_level)) || siteGuaranteesDegree(listing.source_site ?? "", filters.degree_level) || scope.degree;
  if (!degreeOk) return false;
  if (!fieldMatch(listing, filters.field, scope.field)) return false;
  if (!fieldMatch(listing, filters.research_area, scope.research_area)) return false;
  if (!countryMatch(listing, filters.countries ?? [], scope.country)) return false;
  if (!fundingMatch(listing, filters.funding)) return false;
  if (!keywordMatch(listing, filters.keywords)) return false;
  if (!positionTypeMatch(listing, filters.position_types ?? [])) return false;
  if (!deadlineMatch(listing, filters.deadline_required)) return false;
  return true;
}

function relevanceScore(listing: PositionListing, filters: SearchFilters): number {
  const text = listingText(listing); let score = 0;
  if (containsAny(text, degreeTerms(filters.degree_level))) score += 5;
  if (filters.field && containsAny(text, fieldTerms(filters.field))) score += 5;
  if (filters.research_area && containsAny(text, fieldTerms(filters.research_area))) score += 6;
  if (filters.countries?.length && countryMatch(listing, filters.countries, false)) score += 5;
  if (filters.funding === "funded" && containsAny(text, FUNDING_TERMS)) score += 3;
  if (filters.funding === "self_funded" && containsAny(text, SELF_FUNDED_TERMS)) score += 3;
  if (listing.institution) score += 1;
  if (listing.deadline) score += 1;
  return score;
}

function merge(a: PositionListing, b: PositionListing): PositionListing { return { ...a, title: a.title || b.title, snippet: a.snippet || b.snippet, institution: a.institution || b.institution, country: a.country || b.country, deadline: a.deadline || b.deadline, source_site: a.source_site || b.source_site }; }
function dedupe(listings: PositionListing[]): PositionListing[] { const map = new Map<string, PositionListing>(); for (const listing of listings) { const key = normalizeUrl(listing.url); if (!key) continue; map.set(key, map.has(key) ? merge(map.get(key)!, listing) : listing); } return Array.from(map.values()); }

function parseSearchHtml(html: string, site: string, defaultCountry?: string): PositionListing[] {
  const out: PositionListing[] = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim(); const title = stripTags(match[2]);
    if (!url || !title || !looksLikeRealPosition(site, url, title)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    const context = stripTags(html.slice(Math.max(0, match.index - 220), Math.min(html.length, match.index + match[0].length + 650)));
    out.push({ title: title.slice(0, 300), url, source_site: site, country: defaultCountry || countryCanonical(`${url} ${title} ${context}`), snippet: context.slice(0, 900) });
  }
  return out.slice(0, 20);
}

function parseBingRss(xml: string, site: string): PositionListing[] {
  const out: PositionListing[] = [];
  const regex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi; let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const url = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "";
    const snippet = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "";
    const cleanTitle = stripTags(title); const cleanUrl = stripTags(url); const cleanSnippet = stripTags(snippet);
    if (!cleanTitle || !cleanUrl || !looksLikeRealPosition(site, cleanUrl, cleanTitle)) continue;
    out.push({ title: cleanTitle, url: cleanUrl, snippet: cleanSnippet, source_site: site, country: countryCanonical(`${cleanTitle} ${cleanSnippet} ${cleanUrl}`) });
  }
  return out.slice(0, 20);
}

async function searchBrave(
  apiKey: string,
  query: string,
  sourceSite: string
): Promise<PositionListing[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("search_lang", "en");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Brave Search returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
  };
  return (payload.web?.results ?? []).
    .filter((item) => item.url && item.title && isSourceUrl(item.url, sourceSite))
    .map((item) => ({
      title: stripTags(item.title ?? ""),
      url: item.url ?? "",
      snippet: stripTags(item.description ?? ""),
      source_site: sourceSite,
      country: countryCanonical(`${item.title ?? ""} ${item.description ?? ""} ${item.url ?? ""}`),
    }))
    .filter((item) => looksLikeRealPosition(sourceSite, item.url, item.title))
    .slice(0, 10);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/10.0)" } });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function buildQuery(filters: SearchFilters): string { return encodeURIComponent([filters.field, filters.research_area, ...(filters.countries ?? []), filters.keywords].filter(Boolean).join(" ")); }
function directSearchUrls(site: string, filters: SearchFilters): string[] {
  const q = buildQuery(filters); const area = slug(filters.research_area || filters.field || ""); const country = filters.countries?.[0] ? encodeURIComponent(filters.countries[0].toLowerCase()) : "";
  switch (site) {
    case "findaphd.com": return [`https://www.findaphd.com/phds/?Keywords=${q}`];
    case "phdportal.com": return [`https://www.phdportal.com/search/phd/engineering-technology?keyword=${q}`];
    case "euraxess.ec.europa.eu": return [`https://euraxess.ec.europa.eu/jobs?keywords=${q}${country ? `&country=${country}` : ""}`];
    case "academicpositions.com": return country && area ? [`https://academicpositions.com/jobs/field/${area}/country/${country}`] : country ? [`https://academicpositions.com/jobs/country/${country}?query=${q}`] : [`https://academicpositions.com/search?query=${q}`];
    case "phdgermany.de": return [`https://phdgermany.de/search?q=${q}`];
    case "academicjobsonline.org": return [`https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`];
    case "jobs.ac.uk": return [`https://www.jobs.ac.uk/search/?keywords=${q}`];
    default: return [];
  }
}
function providerQuery(site: string, filters: SearchFilters): string { const degree = degreeTerms(filters.degree_level).slice(0, 4).join(" OR "); const fields = [...fieldTerms(filters.field ?? ""), ...fieldTerms(filters.research_area ?? "")].slice(0, 8).join(" OR "); const countries = countryTerms((filters.countries ?? []).join(",")).slice(0, 8).join(" OR "); return [`site:${site}`, `(${degree})`, fields ? `(${fields})` : "", countries ? `(${countries})` : "", filters.keywords ? `(${filters.keywords})` : ""].filter(Boolean).join(" "); }

async function searchBing(query: string, site: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search"); url.searchParams.set("q", query); url.searchParams.set("format", "rss"); url.searchParams.set("count", "10");
  const response = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/10.0)" });
  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), site);
}

async function searchSite(site: string, filters: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {
  let raw: PositionListing[] = []; let scope: SearchScope = { field: false, research_area: false, country: false, degree: false };
  for (const url of directSearchUrls(site, filters)) {
    console.log(`Direct portal search ${site}: ${url}`);
    try {
      const response = await fetchText(url);
      if (!response.ok) { console.log(`Direct portal ${site}: HTTP ${response.status}`); continue; }
      const defaultCountry = site === "phdgermany.de" && (filters.countries ?? []).includes("Germany") ? "Germany" : site === "jobs.ac.uk" && (filters.countries ?? []).includes("UK") ? "UK" : undefined;
      raw.push(...parseSearchHtml(response.text, site, defaultCountry));
      scope = { field: Boolean(filters.field || filters.research_area), research_area: Boolean(filters.research_area), country: Boolean(filters.countries?.length), degree: true };
    } catch (error) { console.error(`Direct portal ${site} failed:`, String(error)); }
  }
  raw = dedupe(raw);

  if (raw.length === 0 && braveSearchApiKey?.trim()) {
    try {
      const query = providerQuery(site, filters);
      console.log(`Brave evidence search ${site}: ${query}`);
      raw = dedupe(await searchBrave(braveSearchApiKey, query, site));
      console.log(`Brave Search ${site}: ${raw.length} results`);
    } catch (error) {
      console.error(`Brave Search failed for ${site}:`, String(error));
    }
  }

  if (raw.length === 0) {
    const query = providerQuery(site, filters); console.log(`Provider fallback ${site}: ${query}`);
    try {
      const provider = await searchBing(query, site); console.log(`Bing fallback ${site}: ${provider.length} results`); raw = dedupe(provider);
      if (raw.length > 0) scope = { field: Boolean(filters.field || filters.research_area), research_area: Boolean(filters.research_area), country: Boolean(filters.countries?.length), degree: true };
    } catch (error) { console.error(`Bing fallback failed for ${site}:`, String(error)); }
  }
  const filtered = raw.filter((listing) => coreFilterMatch(listing, filters, scope)); filtered.sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters));
  console.log(`Search complete ${site}: ${raw.length} raw -> ${filtered.length} after all filters -> ${filtered.length} ranked`);
  return filtered.slice(0, 20);
}

export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {
  const fieldKey = clean(fieldHint).toLowerCase(); const inferredParentField = RESEARCH_AREA_PARENT[fieldKey];
  const filters: SearchFilters = { ...(filtersInput ?? {}), degree_level: filtersInput?.degree_level ?? degreeLevel, field: filtersInput?.field ?? inferredParentField, research_area: filtersInput?.research_area ?? fieldHint, countries: filtersInput?.countries ?? (countryHint ? countryHint.split(",").map((x) => x.trim()).filter(Boolean) : []) };
  const perSite = await Promise.all(
    SITES_BY_DEGREE[filters.degree_level].map(async (site) => {
      try {
        return await searchSite(site, filters, braveSearchApiKey);
      } catch (error) {
        console.error(`Site search failed for ${site}:`, String(error));
        return [] as PositionListing[];
      }
    }),
  );
  const all = perSite.flat();
  const unique = dedupe(all).sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters)).slice(0, 10);
  console.log(`Multi-site search complete: ${SITES_BY_DEGREE[filters.degree_level].length} sites, ${unique.length} filtered unique listings, returning ${unique.length} candidates for AI matching`);
  return unique;
}

export function fallbackSearchLinks(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string[] {
  const q = encodeURIComponent([fieldHint, countryHint ?? ""].filter(Boolean).join(" "));
  if (degreeLevel === "phd") return [
    `https://www.findaphd.com/phds/?Keywords=${q}`,
    `https://www.phdportal.com/search/phd/${q}`,
    `https://euraxess.ec.europa.eu/jobs/search?keywords=${q}`,
    `https://academicpositions.com/find-jobs?query=${q}`,
    `https://phdgermany.de/search?q=${q}`,
    `https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`,
    `https://www.jobs.ac.uk/search/?keywords=${q}`,
  ];
  if (degreeLevel === "master") return [
    `https://www.findamasters.com/masters-degrees/?Keywords=${q}`,
    `https://www.mastersportal.com/search/master/${q}`,
    `https://www.scholarship-positions.com/?s=${q}`,
  ];
  return [
    `https://www.bachelorsportal.com/search/bachelor/${q}`,
    `https://www.scholarship-positions.com/?s=${q}`,
  ];
}
