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

const DEGREE_TERMS: Record<DegreeLevel, string[]> = {
  bachelor: ["bachelor", "bachelors", "undergraduate"],
  master: ["master", "masters", "msc", "mres", "postgraduate"],
  phd: ["phd", "doctoral", "doctorate", "studentship", "research fellow", "doktorand", "promotion"],
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
  "structural engineering": ["structural engineering", "structural mechanics", "structural analysis", "structural design", "civil engineering", "structures"],
  "civil engineering": ["civil engineering", "structural engineering", "construction", "infrastructure"],
  "machine learning": ["machine learning", "artificial intelligence", "deep learning", "ai"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning", "ai"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
  engineering: ["engineering", "technology"],
};

const SITE_SEARCH_TERMS: Record<string, string[]> = {
  "findaphd.com": ["phd", "doctoral", "studentship"],
  "phdportal.com": ["phd", "doctoral", "programme"],
  "euraxess.ec.europa.eu": ["phd", "doctoral", "researcher"],
  "academicpositions.com": ["phd", "doctoral", "researcher"],
  "phdgermany.de": ["phd", "doctoral", "doktorand", "promotion"],
  "academicjobsonline.org": ["phd", "doctoral", "research", "graduate"],
  "jobs.ac.uk": ["phd", "studentship", "doctoral", "research"],
  "findamasters.com": ["master", "msc", "mres", "postgraduate"],
  "mastersportal.com": ["master", "msc", "mres", "postgraduate"],
  "bachelorsportal.com": ["bachelor", "undergraduate"],
  "scholarship-positions.com": ["scholarship", "studentship", "phd", "master"],
};

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/4.0)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function clean(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripTags(text: string): string {
  return clean(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function belongsToSite(url: string, site: string): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    const root = normalizeHost(site);
    return host === root || host.endsWith(`.${root}`);
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
    return url.toLowerCase().trim();
  }
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
  const key = clean(fieldHint).toLowerCase();
  if (!key) return [];
  return FIELD_ALIASES[key] ?? [key];
}

function relevanceScore(
  listing: PositionListing,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): number {
  const text = [listing.title, listing.snippet, listing.institution, listing.country, listing.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  for (const term of DEGREE_TERMS[degreeLevel]) {
    if (text.includes(term)) score += 4;
  }

  for (const term of fieldTerms(fieldHint)) {
    if (text.includes(term.toLowerCase())) score += 5;
  }

  for (const term of countryTerms(countryHint)) {
    if (text.includes(term)) score += 3;
  }

  if (listing.deadline) score += 1;
  if (listing.institution) score += 1;

  return score;
}

function hasExplicitCountryConflict(
  listing: PositionListing,
  selectedCountries: string[],
): boolean {
  if (!selectedCountries.length) return false;

  const text = [listing.title, listing.snippet, listing.institution, listing.country, listing.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const wanted = selectedCountries.flatMap((c) => COUNTRY_ALIASES[c.toLowerCase()] ?? [c.toLowerCase()]);
  const allKnown = Object.values(COUNTRY_ALIASES).flat();

  const hasWanted = wanted.some((country) => text.includes(country));
  const hasOther = allKnown.some((country) => text.includes(country) && !wanted.includes(country));

  return !hasWanted && hasOther;
}

function getAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function parseAnchors(
  html: string,
  sourceSite: string,
  allowedPath?: RegExp,
): PositionListing[] {
  const out: PositionListing[] = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = getAttr(match[1], "href");
    const text = stripTags(match[2]);
    if (!href || !text || text.length < 4) continue;

    let url: string;
    try {
      url = new URL(href, `https://${sourceSite}`).href;
    } catch {
      continue;
    }

    if (!belongsToSite(url, sourceSite)) continue;
    if (allowedPath && !allowedPath.test(new URL(url).pathname)) continue;

    out.push({
      title: text.slice(0, 240),
      url,
      snippet: "",
      source_site: sourceSite,
    });
  }

  return out;
}

function dedupe(listings: PositionListing[]): PositionListing[] {
  const map = new Map<string, PositionListing>();
  for (const listing of listings) {
    const key = normalizeUrl(listing.url);
    if (key && !map.has(key)) map.set(key, listing);
  }
  return Array.from(map.values());
}

function parseBingRss(xml: string, sourceSite: string): PositionListing[] {
  const out: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const read = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? stripTags(m[1]) : "";
    };

    const title = read("title");
    const url = read("link");
    const snippet = read("description");

    if (!title || !url || !belongsToSite(url, sourceSite)) continue;
    out.push({ title, url, snippet, source_site: sourceSite });
  }

  return out;
}

async function searchBing(
  query: string,
  sourceSite: string,
): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "10");
  url.searchParams.set("setlang", "en-US");

  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": REQUEST_HEADERS["User-Agent"],
    },
  });

  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), sourceSite);
}

async function searchBrave(
  apiKey: string,
  query: string,
  sourceSite: string,
): Promise<PositionListing[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("search_lang", "en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`);

  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (payload.web?.results ?? [])
    .filter((item) => typeof item.url === "string" && typeof item.title === "string")
    .filter((item) => belongsToSite(item.url!, sourceSite))
    .map((item) => ({
      title: stripTags(item.title!),
      url: item.url!,
      snippet: stripTags(item.description ?? ""),
      source_site: sourceSite,
    }));
}

function buildExternalQuery(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string {
  const degree = DEGREE_TERMS[degreeLevel].slice(0, 4).join(" OR ");
  const field = fieldTerms(fieldHint).slice(0, 4).join(" OR ");
  const country = countryTerms(countryHint).slice(0, 3).join(" OR ");
  const siteTerms = (SITE_SEARCH_TERMS[site] ?? DEGREE_TERMS[degreeLevel]).slice(0, 4).join(" OR ");

  return [
    `site:${site}`,
    `(${siteTerms || degree})`,
    field ? `(${field})` : "",
    country ? `(${country})` : "",
  ].filter(Boolean).join(" ");
}

function slugCountry(country: string): string {
  return country.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function directUrls(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const field = encodeURIComponent(fieldHint || DEGREE_TERMS[degreeLevel][0]);
  const country = countryHint?.split(",")[0]?.trim();
  const countrySlug = country ? slugCountry(country) : "";

  switch (site) {
    case "euraxess.ec.europa.eu":
      return [
        `https://euraxess.ec.europa.eu/jobs?keywords=${field}`,
        country ? `https://euraxess.ec.europa.eu/jobs?keywords=${field}&country=${encodeURIComponent(country)}` : "",
      ].filter(Boolean);

    case "academicpositions.com":
      return [
        countrySlug ? `https://academicpositions.com/jobs/country/${countrySlug}` : "https://academicpositions.com/browse",
        `https://academicpositions.com/jobs/position/${degreeLevel === "phd" ? "phd" : degreeLevel}`,
      ];

    case "jobs.ac.uk":
      return [
        `https://www.jobs.ac.uk/search/?keywords=${encodeURIComponent(fieldHint || DEGREE_TERMS[degreeLevel][0])}`,
      ];

    case "phdportal.com":
      return [
        `https://www.phdportal.com/search/phd/engineering-technology?keyword=${field}`,
        "https://www.phdportal.com/search/phd",
      ];

    case "academicjobsonline.org":
      return [
        `https://academicjobsonline.org/ajo?joblist=1&keywords=${field}`,
        "https://academicjobsonline.org/ajo",
      ];

    case "findaphd.com":
      return [
        `https://www.findaphd.com/phds/?Keywords=${field}`,
      ];

    case "phdgermany.de":
      return [
        `https://phdgermany.de/search?q=${field}`,
        "https://phdgermany.de/",
      ];

    case "findamasters.com":
      return [`https://www.findamasters.com/masters-degrees/?Keywords=${field}`];

    case "mastersportal.com":
      return [`https://www.mastersportal.com/search/master/${field}`];

    case "bachelorsportal.com":
      return [`https://www.bachelorsportal.com/search/bachelor/${field}`];

    case "scholarship-positions.com":
      return [`https://www.scholarship-positions.com/?s=${field}`];

    default:
      return [];
  }
}

async function directPortalSearch(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const urls = directUrls(site, degreeLevel, fieldHint, countryHint);
  const out: PositionListing[] = [];

  for (const url of urls.slice(0, 2)) {
    try {
      console.log(`Direct portal search ${site}: ${url}`);
      const response = await fetch(url, { headers: REQUEST_HEADERS });
      if (!response.ok) {
        console.log(`Direct portal ${site}: HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) continue;

      const html = await response.text();
      let listings: PositionListing[] = [];

      // These pages expose useful job/program links in regular HTML, so a
      // generic anchor parser is preferable to depending on one unstable DOM.
      listings = parseAnchors(html, site, /\/(jobs?|phds?|programmes?|programs?)(\/|$)/i);

      if (!listings.length) {
        listings = parseAnchors(html, site);
      }

      out.push(...listings);

      if (out.length >= 20) break;
    } catch (error) {
      console.error(`Direct portal search failed for ${site}:`, String(error));
    }
  }

  return dedupe(out).slice(0, 20);
}

async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
  braveSearchApiKey?: string,
): Promise<PositionListing[]> {
  const selectedCountries = countryHint?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  const collected: PositionListing[] = [];

  // Direct source first. This is the important change: a search-engine index
  // is no longer treated as the source of truth for any portal.
  const direct = await directPortalSearch(site, degreeLevel, fieldHint, countryHint);
  collected.push(...direct);
  console.log(`Direct search complete ${site}: ${direct.length} results`);

  // External provider is a bounded fallback, not the primary source.
  if (collected.length === 0) {
    const query = buildExternalQuery(site, degreeLevel, fieldHint, countryHint);
    console.log(`Provider fallback ${site}: ${query}`);

    if (braveSearchApiKey?.trim()) {
      try {
        const brave = await searchBrave(braveSearchApiKey, query, site);
        console.log(`Brave fallback ${site}: ${brave.length} results`);
        collected.push(...brave);
      } catch (error) {
        console.error(`Brave fallback failed for ${site}:`, String(error));
      }
    }

    if (!collected.length) {
      try {
        const bing = await searchBing(query, site);
        console.log(`Bing fallback ${site}: ${bing.length} results`);
        collected.push(...bing);
      } catch (error) {
        console.error(`Bing fallback failed for ${site}:`, String(error));
      }
    }
  }

  const ranked = dedupe(collected)
    .filter((listing) => !hasExplicitCountryConflict(listing, selectedCountries))
    .sort((a, b) => relevanceScore(b, degreeLevel, fieldHint, countryHint) - relevanceScore(a, degreeLevel, fieldHint, countryHint));

  console.log(`Search complete ${site}: ${collected.length} raw -> ${ranked.length} ranked results`);
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

  const unique = dedupe(all);
  console.log(`Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${unique.length} unique listings`);
  return unique;
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
      `https://euraxess.ec.europa.eu/jobs?keywords=${q}`,
      `https://academicpositions.com/browse?query=${q}`,
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
