import type { DegreeLevel, PositionListing } from "../types";

const MAX_SEARCH_CANDIDATES = 10;

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

const COUNTRY_ALIASES: Record<string, string[]> = {
  canada: ["canada", "canadian"],
  usa: ["usa", "united states", "u.s.", "american"],
  uk: ["uk", "united kingdom", "england", "scotland", "wales"],
  germany: ["germany", "deutschland", "german"],
  france: ["france", "french"],
  netherlands: ["netherlands", "holland", "dutch"],
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
  "machine learning": ["machine learning", "artificial intelligence", "deep learning"],
  "artificial intelligence": ["artificial intelligence", "machine learning", "deep learning"],
  "computer science": ["computer science", "computing", "software", "artificial intelligence"],
  "environmental engineering": ["environmental engineering", "environmental science", "sustainability"],
};

const SITE_TERMS: Record<string, string[]> = {
  "findaphd.com": ["phd", "doctoral", "studentship"],
  "phdportal.com": ["phd", "doctoral", "programme"],
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

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
  return clean(value.replace(/<[^>]+>/g, " "));
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

function termsForField(fieldHint: string): string[] {
  const key = clean(fieldHint).toLowerCase();
  return key ? FIELD_ALIASES[key] ?? [key] : [];
}

function termsForCountry(countryHint?: string): string[] {
  if (!countryHint) return [];
  return countryHint
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((value) => COUNTRY_ALIASES[value] ?? [value]);
}

function externalQuery(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string {
  const degree =
    degreeLevel === "phd"
      ? "phd OR doctoral OR studentship"
      : degreeLevel === "master"
        ? "master OR masters OR msc"
        : "bachelor OR undergraduate";
  const siteTerms = (SITE_TERMS[site] ?? [degree]).slice(0, 4).join(" OR ");
  const fields = termsForField(fieldHint).slice(0, 5).join(" OR ");
  const countries = termsForCountry(countryHint).slice(0, 5).join(" OR ");
  return [
    `site:${site}`,
    `(${siteTerms || degree})`,
    fields ? `(${fields})` : "",
    countries ? `(${countries})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function titleAndSnippet(listing: PositionListing): string {
  return [listing.title, listing.snippet, listing.institution, listing.country]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function relevanceScore(
  listing: PositionListing,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): number {
  const text = titleAndSnippet(listing);
  let score = 0;

  const degreeTerms =
    degreeLevel === "phd"
      ? ["phd", "doctoral", "doctorate", "studentship"]
      : degreeLevel === "master"
        ? ["master", "masters", "msc", "mres"]
        : ["bachelor", "bachelors", "undergraduate"];

  if (degreeTerms.some((term) => text.includes(term))) score += 5;
  for (const term of termsForField(fieldHint)) {
    if (text.includes(term.toLowerCase())) score += 4;
  }
  for (const term of termsForCountry(countryHint)) {
    if (text.includes(term)) score += 3;
  }
  if (listing.institution) score += 1;
  if (listing.deadline) score += 1;
  return score;
}

function explicitCountryConflict(
  listing: PositionListing,
  selectedCountries: string[],
): boolean {
  if (!selectedCountries.length) return false;

  const text = titleAndSnippet(listing);
  const selected = selectedCountries.flatMap(
    (country) => COUNTRY_ALIASES[country.toLowerCase()] ?? [country.toLowerCase()],
  );

  const known = Object.values(COUNTRY_ALIASES).flat();
  const mentionsOtherCountry = known.some(
    (country) => text.includes(country) && !selected.includes(country),
  );

  return mentionsOtherCountry && !selected.some((country) => text.includes(country));
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
    const title = stripTags(decodeEntities(match[3]));
    if (!href || !title || title.length < 4 || !isSourceUrl(href, site)) continue;
    results.push({
      title,
      url: href,
      snippet: "",
      source_site: site,
    });
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
    const title = titleMatch ? stripTags(decodeEntities(titleMatch[1])) : "";
    const url = linkMatch ? stripTags(decodeEntities(linkMatch[1])) : "";
    const snippet = descMatch ? stripTags(decodeEntities(descMatch[1])) : "";

    if (!title || !url || !isSourceUrl(url, site)) continue;
    results.push({ title, url, snippet, source_site: site });
  }

  return dedupe(results);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/4.0)",
    },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function directSearchUrl(site: string, fieldHint: string, country?: string): string[] {
  const field = encodeURIComponent(fieldHint || "");
  const countryQ = country ? encodeURIComponent(country.split(",")[0].trim()) : "";

  switch (site) {
    case "findaphd.com":
      return [`https://www.findaphd.com/phds/?Keywords=${field}`];
    case "phdportal.com":
      return [`https://www.phdportal.com/search/phd/engineering-technology?keyword=${field}`];
    case "euraxess.ec.europa.eu":
      return [
        `https://euraxess.ec.europa.eu/jobs?keywords=${field}`,
        countryQ ? `https://euraxess.ec.europa.eu/jobs?keywords=${field}&country=${countryQ}` : "",
      ].filter(Boolean);
    case "academicpositions.com":
      return [
        countryQ
          ? `https://academicpositions.com/jobs/country/${countryQ.toLowerCase().replace(/\s+/g, "-")}`
          : `https://academicpositions.com/search?query=${field}`,
      ];
    case "phdgermany.de":
      return [`https://phdgermany.de/search?q=${field}`];
    case "academicjobsonline.org":
      return [
        `https://academicjobsonline.org/ajo?joblist=1&keywords=${field}`,
        `https://academicjobsonline.org/ajo`,
      ];
    case "jobs.ac.uk":
      return [`https://www.jobs.ac.uk/search/?keywords=${field}`];
    case "findamasters.com":
      return [`https://www.findamasters.com/masters-degrees/?Keywords=${field}`];
    case "mastersportal.com":
      return [`https://www.mastersportal.com/search/master/${field}`];
    case "bachelorsportal.com":
      return [`https://www.bachelorsportal.com/search/bachelor/${field}`];
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
  const urls = directSearchUrl(site, fieldHint, countryHint);
  const out: PositionListing[] = [];

  for (const url of urls) {
    try {
      console.log(`Direct portal search ${site}: ${url}`);
      const response = await fetchText(url);
      if (!response.ok) {
        console.log(`Direct portal ${site}: HTTP ${response.status}`);
        continue;
      }

      let listings = parseSearchHtml(response.text, site);
      // Keep obvious UI/navigation anchors out of the opportunity list.
      listings = listings.filter((listing) => {
        const t = listing.title.toLowerCase();
        return !["view jobs", "login", "sign in", "register", "search", "next", "previous"].includes(t);
      });

      out.push(...listings.slice(0, 20));
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
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/4.0)",
    },
  });

  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), site);
}

async function searchSite(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const selectedCountries = countryHint?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  let collected = await directPortalSearch(site, degreeLevel, fieldHint, countryHint);
  console.log(`Direct search complete ${site}: ${collected.length} results`);

  if (!collected.length) {
    const query = externalQuery(site, degreeLevel, fieldHint, countryHint);
    console.log(`Provider fallback ${site}: ${query}`);
    try {
      collected = await searchBing(query, site);
      console.log(`Bing fallback ${site}: ${collected.length} results`);
    } catch (error) {
      console.error(`Bing fallback failed for ${site}:`, String(error));
    }
  }

  const ranked = dedupe(collected)
    .filter((listing) => !explicitCountryConflict(listing, selectedCountries))
    .sort((a, b) => relevanceScore(b, degreeLevel, fieldHint, countryHint) - relevanceScore(a, degreeLevel, fieldHint, countryHint));

  console.log(`Search complete ${site}: ${collected.length} raw -> ${ranked.length} ranked results`);
  return ranked.slice(0, 20);
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const all: PositionListing[] = [];

  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(...await searchSite(site, degreeLevel, fieldHint, countryHint));
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const ranked = dedupe(all).sort(
    (a, b) => relevanceScore(b, degreeLevel, fieldHint, countryHint) - relevanceScore(a, degreeLevel, fieldHint, countryHint),
  );

  console.log(
    `Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ` +
      `${ranked.length} unique listings, returning ${Math.min(MAX_SEARCH_CANDIDATES, ranked.length)} candidates for AI matching`,
  );

  return ranked.slice(0, MAX_SEARCH_CANDIDATES);
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
