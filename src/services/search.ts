import type {
  DegreeLevel,
  PositionType,
  PositionListing,
  SearchFilters,
} from "../types";

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

const FIELD_ALIASES: Record<string, string[]> = {
  engineering: ["engineering", "civil engineering", "structural engineering", "mechanical engineering", "electrical engineering", "chemical engineering"],
  "structural engineering": ["structural engineering", "structural mechanics", "structural analysis", "structural design", "civil engineering", "structures"],
  "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning", "ai"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning", "ai"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"],
  usa: ["usa", "united states", "united states of america", "u.s."],
  uk: ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland"],
  germany: ["germany", "deutschland", "german", "de"],
  france: ["france", "french"],
  netherlands: ["netherlands", "the netherlands", "holland", "dutch"],
  switzerland: ["switzerland", "swiss"],
  sweden: ["sweden", "swedish"],
  norway: ["norway", "norwegian"],
  finland: ["finland", "finnish"],
  denmark: ["denmark", "danish"],
  australia: ["australia", "australian"],
  "new zealand": ["new zealand", "nz"],
  austria: ["austria", "austrian", "osterreich", "österreich"],
  belgium: ["belgium", "belgian"],
  ireland: ["ireland", "irish"],
  italy: ["italy", "italian"],
  spain: ["spain", "spanish"],
  japan: ["japan", "japanese"],
  "south korea": ["south korea", "republic of korea", "korean"],
};

const FUNDING_TERMS = [
  "funded",
  "fully funded",
  "funding available",
  "scholarship",
  "studentship",
  "stipend",
  "salary",
  "paid",
  "tuition waiver",
  "financial support",
];

const NAV_TITLES = new Set([
  "view jobs",
  "view all jobs",
  "search",
  "next",
  "previous",
  "login",
  "sign in",
  "register",
  "home",
  "jobs",
  "all jobs",
  "job search",
  "find jobs",
  "view more",
  "view jobs",
]);

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
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

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fieldTerms(value: string): string[] {
  const key = clean(value).toLowerCase();
  return key ? FIELD_ALIASES[key] ?? [key] : [];
}

function countryTerms(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((item) => COUNTRY_ALIASES[item] ?? [item]);
}

function degreeTerms(level: DegreeLevel): string[] {
  if (level === "phd") return ["phd", "doctoral", "doctorate", "studentship", "doctoral researcher", "doktorand", "promotion"];
  if (level === "master") return ["master", "masters", "msc", "mres", "postgraduate"];
  return ["bachelor", "bachelors", "undergraduate", "bsc"];
}

function listingText(listing: PositionListing): string {
  return [
    listing.title,
    listing.snippet,
    listing.institution,
    listing.country,
    listing.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function countryCanonical(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return canonical;
  }
  return undefined;
}

function countryFilterMatch(listing: PositionListing, selected: string[]): boolean {
  if (!selected.length) return true;
  const text = listingText(listing);
  const selectedCanonicals = selected.map((value) => value.toLowerCase());

  if (listing.country) {
    const canonical = countryCanonical(listing.country);
    if (canonical) return selectedCanonicals.includes(canonical);
    if (selectedCanonicals.some((country) => listing.country!.toLowerCase().includes(country))) return true;
    return false;
  }

  return selectedCanonicals.some((country) => {
    const aliases = COUNTRY_ALIASES[country] ?? [country];
    return aliases.some((alias) => text.includes(alias));
  });
}

function fundingMatch(listing: PositionListing, preference: SearchFilters["funding"]): boolean {
  if (!preference || preference === "both") return true;
  const text = listingText(listing);
  const funded = containsAny(text, FUNDING_TERMS);
  return preference === "funded" ? funded : !funded;
}

function positionTypeMatches(listing: PositionListing, selected: PositionType[]): boolean {
  if (!selected.length) return true;
  const text = listingText(listing);
  return selected.some((type) => {
    switch (type) {
      case "phd":
        return containsAny(text, ["phd", "doctoral", "doctorate", "studentship"]);
      case "masters":
        return containsAny(text, ["master", "masters", "msc", "mres"]);
      case "bachelor":
        return containsAny(text, ["bachelor", "bachelors", "bsc", "undergraduate"]);
      case "research_assistant":
        return text.includes("research assistant");
      case "research_fellow":
        return text.includes("research fellow");
      case "internship":
        return containsAny(text, ["internship", "intern"]);
      case "other":
        return true;
      default:
        return false;
    }
  });
}

function keywordMatch(listing: PositionListing, keywords?: string): boolean {
  if (!keywords?.trim()) return true;
  const terms = keywords.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!terms.length) return true;
  const text = listingText(listing);
  return terms.some((term) => text.includes(term));
}

function deadlineMatch(listing: PositionListing, required?: boolean): boolean {
  if (!required) return true;
  const text = listingText(listing);
  return Boolean(
    listing.deadline ||
      /deadline|apply by|application closes|closing date|applications close|closing deadline/.test(text),
  );
}

function coreFilterMatch(listing: PositionListing, filters: SearchFilters): boolean {
  if (NAV_TITLES.has(listing.title.toLowerCase())) return false;

  const degreeMatches = containsAny(listingText(listing), degreeTerms(filters.degree_level));
  const degreeGuaranteedBySite =
    (filters.degree_level === "phd" && ["findaphd.com", "phdportal.com", "phdgermany.de"].includes(listing.source_site ?? "")) ||
    (filters.degree_level === "master" && ["findamasters.com", "mastersportal.com"].includes(listing.source_site ?? "")) ||
    (filters.degree_level === "bachelor" && listing.source_site === "bachelorsportal.com");

  if (!degreeMatches && !degreeGuaranteedBySite) return false;

  const selectedFieldTerms = [
    ...fieldTerms(filters.field ?? ""),
    ...fieldTerms(filters.research_area ?? ""),
  ];
  if (selectedFieldTerms.length && !containsAny(listingText(listing), selectedFieldTerms)) return false;

  if (!countryFilterMatch(listing, filters.countries ?? [])) return false;
  if (!fundingMatch(listing, filters.funding)) return false;
  if (!keywordMatch(listing, filters.keywords)) return false;
  if (!positionTypeMatches(listing, filters.position_types ?? [])) return false;
  if (!deadlineMatch(listing, filters.deadline_required)) return false;

  return true;
}

function relevanceScore(listing: PositionListing, filters: SearchFilters): number {
  const text = listingText(listing);
  let score = 0;

  if (containsAny(text, degreeTerms(filters.degree_level))) score += 5;
  for (const term of fieldTerms(filters.field ?? "")) if (text.includes(term)) score += 4;
  for (const term of fieldTerms(filters.research_area ?? "")) if (text.includes(term)) score += 5;
  for (const term of countryTerms((filters.countries ?? []).join(","))) if (text.includes(term)) score += 4;
  if (listing.institution) score += 1;
  if (listing.country) score += 2;
  if (listing.deadline) score += 1;
  if (containsAny(text, FUNDING_TERMS) && filters.funding === "funded") score += 3;

  return score;
}

function mergeListings(a: PositionListing, b: PositionListing): PositionListing {
  return {
    ...a,
    title: a.title || b.title,
    snippet: a.snippet || b.snippet,
    institution: a.institution || b.institution,
    country: a.country || b.country,
    deadline: a.deadline || b.deadline,
    source_site: a.source_site || b.source_site,
  };
}

function dedupe(listings: PositionListing[]): PositionListing[] {
  const map = new Map<string, PositionListing>();
  for (const listing of listings) {
    const key = normalizeUrl(listing.url);
    if (!key) continue;
    const existing = map.get(key);
    map.set(key, existing ? mergeListings(existing, listing) : listing);
  }
  return Array.from(map.values());
}

function parseSearchHtml(html: string, site: string, defaultCountry?: string): PositionListing[] {
  const results: PositionListing[] = [];
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchors.exec(html)) !== null) {
    const url = match[1].trim();
    const title = stripTags(match[2]);
    if (!url || !title || title.length < 4 || NAV_TITLES.has(title.toLowerCase())) continue;
    if (!/^https?:\/\//i.test(url) || !isSourceUrl(url, site)) continue;

    const start = Math.max(0, match.index - 250);
    const end = Math.min(html.length, match.index + match[0].length + 500);
    const context = stripTags(html.slice(start, end));
    const inferredCountry = countryCanonical(`${url} ${title} ${context}`) ?? defaultCountry;

    results.push({
      title: title.slice(0, 300),
      url,
      source_site: site,
      country: inferredCountry,
      snippet: context.slice(0, 900),
    });
  }

  return results.slice(0, 20);
}

function parseBingRss(xml: string, site: string): PositionListing[] {
  const results: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const descriptionMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    const url = linkMatch ? stripTags(linkMatch[1]) : "";
    const snippet = descriptionMatch ? stripTags(descriptionMatch[1]) : "";

    if (!title || !url || NAV_TITLES.has(title.toLowerCase()) || !isSourceUrl(url, site)) continue;

    results.push({
      title,
      url,
      snippet,
      source_site: site,
      country: countryCanonical(`${url} ${title} ${snippet}`),
    });
  }

  return results.slice(0, 20);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/8.0)",
    },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function buildQuery(filters: SearchFilters): string {
  const parts = [
    filters.field,
    filters.research_area,
    ...(filters.countries ?? []),
    filters.keywords,
  ].filter(Boolean);
  return encodeURIComponent(parts.join(" "));
}

function directSearchUrls(site: string, filters: SearchFilters): string[] {
  const q = buildQuery(filters);
  const field = slug(filters.research_area || filters.field || "");
  const country = filters.countries?.[0] ? encodeURIComponent(filters.countries[0].toLowerCase()) : "";

  switch (site) {
    case "findaphd.com":
      return [`https://www.findaphd.com/phds/?Keywords=${q}`];
    case "phdportal.com":
      return [`https://www.phdportal.com/search/phd/engineering-technology?keyword=${q}`];
    case "euraxess.ec.europa.eu":
      return [`https://euraxess.ec.europa.eu/jobs?keywords=${q}${country ? `&country=${country}` : ""}`];
    case "academicpositions.com":
      return country && field
        ? [`https://academicpositions.com/jobs/field/${field}/country/${country}`]
        : country
          ? [`https://academicpositions.com/jobs/country/${country}?query=${q}`]
          : [`https://academicpositions.com/search?query=${q}`];
    case "phdgermany.de":
      return [`https://phdgermany.de/search?q=${q}`];
    case "academicjobsonline.org":
      return [`https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`];
    case "jobs.ac.uk":
      return [`https://www.jobs.ac.uk/search/?keywords=${q}`];
    default:
      return [];
  }
}

function providerQuery(site: string, filters: SearchFilters): string {
  const degree = degreeTerms(filters.degree_level).slice(0, 4).join(" OR ");
  const fields = [...fieldTerms(filters.field ?? ""), ...fieldTerms(filters.research_area ?? "")].slice(0, 6).join(" OR ");
  const countries = countryTerms((filters.countries ?? []).join(",")).slice(0, 6).join(" OR ");
  const keywords = filters.keywords ? `(${filters.keywords.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5).join(" OR ")})` : "";

  return [
    `site:${site}`,
    `(${degree})`,
    fields ? `(${fields})` : "",
    countries ? `(${countries})` : "",
    keywords,
  ].filter(Boolean).join(" ");
}

async function searchBing(query: string, site: string): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "10");

  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/8.0)",
    },
  });

  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), site);
}

async function searchSite(site: string, filters: SearchFilters): Promise<PositionListing[]> {
  let raw: PositionListing[] = [];

  for (const url of directSearchUrls(site, filters)) {
    console.log(`Direct portal search ${site}: ${url}`);
    try {
      const response = await fetchText(url);
      if (!response.ok) {
        console.log(`Direct portal ${site}: HTTP ${response.status}`);
        continue;
      }

      const defaultCountry =
        site === "phdgermany.de" && (filters.countries ?? []).includes("Germany")
          ? "Germany"
          : site === "jobs.ac.uk" && (filters.countries ?? []).includes("UK")
            ? "UK"
            : undefined;

      raw.push(...parseSearchHtml(response.text, site, defaultCountry));
    } catch (error) {
      console.error(`Direct portal ${site} failed:`, String(error));
    }
  }

  raw = dedupe(raw);

  // Provider fallback/evidence is used only when direct results are unavailable.
  // It never replaces direct results and therefore cannot weaken user filters.
  if (raw.length === 0) {
    const query = providerQuery(site, filters);
    console.log(`Provider fallback ${site}: ${query}`);
    try {
      const provider = await searchBing(query, site);
      console.log(`Bing fallback ${site}: ${provider.length} results`);
      raw = dedupe(provider);
    } catch (error) {
      console.error(`Bing fallback failed for ${site}:`, String(error));
    }
  }

  const filtered = raw.filter((listing) => coreFilterMatch(listing, filters));
  filtered.sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters));

  console.log(`Search complete ${site}: ${raw.length} raw -> ${filtered.length} after all filters -> ${filtered.length} ranked`);
  return filtered.slice(0, 20);
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
  filtersInput?: SearchFilters,
): Promise<PositionListing[]> {
  const filters: SearchFilters = {
    ...(filtersInput ?? {}),
    degree_level: filtersInput?.degree_level ?? degreeLevel,
    field: filtersInput?.field,
    research_area: filtersInput?.research_area ?? fieldHint,
    countries: filtersInput?.countries ?? (countryHint ? countryHint.split(",").map((x) => x.trim()).filter(Boolean) : []),
  };

  const all: PositionListing[] = [];

  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(...(await searchSite(site, filters)));
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const unique = dedupe(all);
  const final = unique
    .filter((listing) => coreFilterMatch(listing, filters))
    .sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters))
    .slice(0, 10);

  console.log(`Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${final.length} fully filtered candidates for AI matching`);
  return final;
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
