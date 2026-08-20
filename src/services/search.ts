import type { DegreeLevel, PositionFilterEvidence, PositionListing } from "../types";

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
]);

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

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function siteGuaranteesDegree(site: string, degreeLevel: DegreeLevel): boolean {
  if (degreeLevel === "phd") {
    return site === "findaphd.com" || site === "phdportal.com" || site === "phdgermany.de";
  }
  if (degreeLevel === "master") {
    return site === "findamasters.com" || site === "mastersportal.com";
  }
  return site === "bachelorsportal.com";
}

function countryFromUrl(url: string): string | undefined {
  const lower = url.toLowerCase();
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(`/${alias.replace(/\s+/g, "-")}`) || lower.includes(`country=${encodeURIComponent(alias)}`.toLowerCase()))) {
      return canonical;
    }
  }
  return undefined;
}

function evidenceForDirectUrl(site: string, url: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): PositionFilterEvidence {
  const lower = url.toLowerCase();
  const evidence: PositionFilterEvidence = {};

  if (siteGuaranteesDegree(site, degreeLevel) || lower.includes(`/phd`) || lower.includes(`/master`) || lower.includes(`/bachelor`)) {
    evidence.degree = true;
  }

  if (fieldHint.trim()) {
    const encodedField = encodeURIComponent(fieldHint.trim()).toLowerCase();
    evidence.field = lower.includes(`keyword=${encodedField}`) || lower.includes(`keywords=${encodedField}`) || lower.includes(`query=${encodedField}`) || lower.includes(`q=${encodedField}`);
  }

  if (countryHint) {
    const selected = countryHint.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    const urlCountry = countryFromUrl(url);
    evidence.country = !!urlCountry && selected.includes(urlCountry);

    if (lower.includes("country=")) {
      const hasSelected = selected.some((country) => lower.includes(encodeURIComponent(country).toLowerCase()));
      if (hasSelected) evidence.country = true;
    }
  }

  return evidence;
}

function evidenceForProvider(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): PositionFilterEvidence {
  return {
    degree: true,
    field: !!fieldHint.trim(),
    country: !!countryHint?.trim(),
  };
}

function hasEvidence(listing: PositionListing, key: keyof PositionFilterEvidence): boolean {
  return listing.filter_evidence?.[key] === true;
}

function passesCoreFilters(listing: PositionListing, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): boolean {
  const text = listingText(listing);
  const fields = fieldTerms(fieldHint);
  const countries = countryTerms(countryHint);
  const degrees = degreeTerms(degreeLevel);

  if (!siteGuaranteesDegree(listing.source_site ?? "", degreeLevel) && !hasEvidence(listing, "degree") && !matchesAny(text, degrees)) {
    return false;
  }

  if (fields.length) {
    const fieldMatch = matchesAny(text, fields);
    if (!fieldMatch && !hasEvidence(listing, "field")) return false;
  }

  if (countries.length) {
    const countryMatch = matchesAny(text, countries);
    if (!countryMatch && !hasEvidence(listing, "country")) return false;
  }

  if (NAV_TITLES.has(listing.title.toLowerCase())) return false;
  return true;
}

function relevanceScore(listing: PositionListing, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): number {
  const text = listingText(listing);
  let score = 0;
  if (matchesAny(text, degreeTerms(degreeLevel)) || hasEvidence(listing, "degree")) score += 5;
  for (const term of fieldTerms(fieldHint)) if (text.includes(term)) score += 4;
  if (hasEvidence(listing, "field")) score += 3;
  for (const term of countryTerms(countryHint)) if (text.includes(term)) score += 4;
  if (hasEvidence(listing, "country")) score += 3;
  if (listing.institution) score += 1;
  if (listing.country) score += 2;
  if (listing.deadline) score += 1;
  if (NAV_TITLES.has(listing.title.toLowerCase())) score -= 20;
  return score;
}

function dedupe(listings: PositionListing[]): PositionListing[] {
  const map = new Map<string, PositionListing>();
  for (const listing of listings) {
    const key = normalizeUrl(listing.url);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, listing);
      continue;
    }
    map.set(key, {
      ...existing,
      snippet: existing.snippet || listing.snippet,
      country: existing.country || listing.country,
      institution: existing.institution || listing.institution,
      filter_evidence: {
        degree: existing.filter_evidence?.degree || listing.filter_evidence?.degree,
        field: existing.filter_evidence?.field || listing.filter_evidence?.field,
        country: existing.filter_evidence?.country || listing.filter_evidence?.country,
      },
    });
  }
  return Array.from(map.values());
}

function parseSearchHtml(html: string, site: string, evidence: PositionFilterEvidence): PositionListing[] {
  const results: PositionListing[] = [];
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchors.exec(html)) !== null) {
    const url = match[1].trim();
    const title = stripTags(match[2]);
    if (!url || !title || title.length < 4 || NAV_TITLES.has(title.toLowerCase())) continue;
    if (!/^https?:\/\//i.test(url) || !isSourceUrl(url, site)) continue;
    results.push({
      title: title.slice(0, 300),
      url,
      snippet: "",
      source_site: site,
      country: countryFromUrl(url),
      filter_evidence: evidence,
    });
  }
  return results.slice(0, 20);
}

function parseBingRss(xml: string, site: string, evidence: PositionFilterEvidence): PositionListing[] {
  const results: PositionListing[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
    const url = linkMatch ? stripTags(linkMatch[1]) : "";
    const snippet = descMatch ? stripTags(descMatch[1]) : "";
    if (!title || !url || NAV_TITLES.has(title.toLowerCase()) || !isSourceUrl(url, site)) continue;
    results.push({
      title,
      url,
      snippet,
      source_site: site,
      country: countryFromUrl(url),
      filter_evidence: evidence,
    });
  }
  return results.slice(0, 20);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/6.0)",
    },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function directSearchUrls(site: string, fieldHint: string, countryHint?: string): string[] {
  const q = encodeURIComponent(fieldHint || "");
  const firstCountry = countryHint?.split(",").map((x) => x.trim()).filter(Boolean)[0];
  const c = firstCountry ? encodeURIComponent(firstCountry) : "";
  switch (site) {
    case "findaphd.com":
      return [`https://www.findaphd.com/phds/?Keywords=${q}`];
    case "phdportal.com":
      return [`https://www.phdportal.com/search/phd/engineering-technology?keyword=${q}`];
    case "euraxess.ec.europa.eu":
      return [`https://euraxess.ec.europa.eu/jobs?keywords=${q}`, ...(c ? [`https://euraxess.ec.europa.eu/jobs?keywords=${q}&country=${c}`] : [])];
    case "academicpositions.com":
      return c ? [`https://academicpositions.com/jobs/country/${c}`] : [`https://academicpositions.com/search?query=${q}`];
    case "phdgermany.de":
      return [`https://phdgermany.de/search?q=${q}`];
    case "academicjobsonline.org":
      return [`https://academicjobsonline.org/ajo?joblist=1&keywords=${q}`, `https://academicjobsonline.org/ajo`];
    case "jobs.ac.uk":
      return [`https://www.jobs.ac.uk/search/?keywords=${q}`];
    default:
      return [];
  }
}

async function directPortalSearch(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): Promise<PositionListing[]> {
  const urls = directSearchUrls(site, fieldHint, countryHint);
  const all: PositionListing[] = [];
  for (const url of urls) {
    console.log(`Direct portal search ${site}: ${url}`);
    try {
      const response = await fetchText(url);
      if (!response.ok) {
        console.log(`Direct portal ${site}: HTTP ${response.status}`);
        continue;
      }
      all.push(...parseSearchHtml(htmlText(response.text), site, evidenceForDirectUrl(site, url, degreeLevel, fieldHint, countryHint)));
    } catch (error) {
      console.error(`Direct portal ${site} failed:`, String(error));
    }
  }
  return dedupe(all).slice(0, 20);
}

function htmlText(value: string): string {
  return value;
}

function providerQuery(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): string {
  const siteTerms = (SITE_TERMS[site] ?? degreeTerms(degreeLevel)).slice(0, 4).join(" OR ");
  const fields = fieldTerms(fieldHint).slice(0, 5).join(" OR ");
  const countries = countryTerms(countryHint).slice(0, 5).join(" OR ");
  return [
    `site:${site}`,
    `(${siteTerms})`,
    fields ? `(${fields})` : "",
    countries ? `(${countries})` : "",
  ].filter(Boolean).join(" ");
}

async function searchBing(query: string, site: string, evidence: PositionFilterEvidence): Promise<PositionListing[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("count", "10");
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; ImmigrationPositionBot/6.0)",
    },
  });
  if (!response.ok) throw new Error(`Bing RSS returned ${response.status}`);
  return parseBingRss(await response.text(), site, evidence);
}

async function searchSite(site: string, degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string): Promise<PositionListing[]> {
  let raw = await directPortalSearch(site, degreeLevel, fieldHint, countryHint);

  // When the user selected core filters, always run one provider query as an
  // independent evidence source. Direct portal result pages often expose only
  // titles/URLs, while the provider snippet contains the requested field/country.
  const needsProviderEvidence = !!fieldHint.trim() || !!countryHint?.trim();
  if (needsProviderEvidence || raw.length === 0) {
    const query = providerQuery(site, degreeLevel, fieldHint, countryHint);
    console.log(`Provider evidence search ${site}: ${query}`);
    try {
      const provider = await searchBing(
        query,
        site,
        evidenceForProvider(degreeLevel, fieldHint, countryHint),
      );
      console.log(`Bing evidence ${site}: ${provider.length} results`);
      raw = dedupe([...raw, ...provider]);
    } catch (error) {
      console.error(`Bing provider failed for ${site}:`, String(error));
    }
  }

  const filtered = raw.filter((listing) =>
    passesCoreFilters(listing, degreeLevel, fieldHint, countryHint)
  );
  const ranked = filtered.sort(
    (a, b) =>
      relevanceScore(b, degreeLevel, fieldHint, countryHint) -
      relevanceScore(a, degreeLevel, fieldHint, countryHint),
  );

  console.log(
    `Search complete ${site}: ${raw.length} raw -> ${filtered.length} after hard filters -> ${ranked.length} ranked`,
  );
  return ranked;
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const all: PositionListing[] = [];
  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(
        ...(await searchSite(
          site,
          degreeLevel,
          fieldHint,
          countryHint,
        )),
      );
    } catch (error) {
      console.error(`Site search failed for ${site}:`, String(error));
    }
  }

  const unique = dedupe(all);
  console.log(
    `Multi-site search complete: ${SITES_BY_DEGREE[degreeLevel].length} sites, ${unique.length} filtered unique listings, returning ${Math.min(unique.length, 10)} candidates for AI matching`,
  );
  return unique.slice(0, 10);
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
