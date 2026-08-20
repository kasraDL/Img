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

const DDG_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  referer: "https://html.duckduckgo.com/",
};

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function getAttribute(tag: string, name: string): string {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(regex)?.[2] ?? "";
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function resolveDuckDuckGoLink(href: string): string {
  const cleaned = decodeHtmlEntities(href.trim());
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned, "https://html.duckduckgo.com/");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  }
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

async function postDuckDuckGo(endpoint: string, query: string): Promise<string> {
  const body = new URLSearchParams({ q: query, b: "" });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...DDG_HEADERS, "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo ${endpoint} returned ${response.status}`);
  }
  return response.text();
}

function parseDuckDuckGoResults(html: string, sourceSite: string): PositionListing[] {
  const results: PositionListing[] = [];
  const snippets: string[] = [];
  let match: RegExpExecArray | null;

  // Supports both current HTML result__a and Lite result-link markup.
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const className = getAttribute(attrs, "class");
    if (!/\b(?:result__a|result-link)\b/i.test(className)) continue;

    const href = resolveDuckDuckGoLink(getAttribute(attrs, "href"));
    const title = decodeHtmlEntities(stripTags(match[2]));
    if (!href || !title || !belongsToSourceSite(href, sourceSite)) continue;

    results.push({
      title,
      url: href,
      snippet: "",
      source_site: sourceSite,
    });
  }

  const snippetRegex = /<(?:a|div|td|span)\b([^>]*)>([\s\S]*?)<\/(?:a|div|td|span)>/gi;
  while ((match = snippetRegex.exec(html)) !== null) {
    const className = getAttribute(match[1], "class");
    if (!/\b(?:result__snippet|result-snippet)\b/i.test(className)) continue;
    const snippet = decodeHtmlEntities(stripTags(match[2]));
    if (snippet) snippets.push(snippet);
  }

  for (let i = 0; i < results.length; i++) {
    results[i].snippet = snippets[i] ?? "";
  }

  return results.slice(0, 5);
}

function buildQueries(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const terms = [DEGREE_TERM[degreeLevel], clean(fieldHint), clean(countryHint ?? "")]
    .filter(Boolean)
    .join(" ");

  // Do not depend exclusively on DDG's site: operator. Some DDG endpoints
  // return an empty page for site-restricted POST queries. We therefore try
  // the restricted query first and then broader queries, while enforcing the
  // requested domain after parsing the final URL.
  return [
    `site:${site} ${terms}`,
    `${terms} ${site}`,
    `"${site}" ${terms}`,
  ];
}

async function searchSiteViaDuckDuckGo(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const queries = buildQueries(site, degreeLevel, fieldHint, countryHint);
  const endpoints = [
    "https://lite.duckduckgo.com/lite/",
    "https://html.duckduckgo.com/html/",
  ];

  for (const query of queries) {
    console.log(`Searching ${site} with query: ${query}`);

    for (const endpoint of endpoints) {
      try {
        const html = await postDuckDuckGo(endpoint, query);
        const results = parseDuckDuckGoResults(html, site);
        console.log(
          `DuckDuckGo ${endpoint.includes("lite") ? "Lite" : "HTML"}: ${site} -> ${results.length} results`,
        );

        if (results.length > 0) return results;
      } catch (error) {
        console.error(
          `DuckDuckGo ${endpoint.includes("lite") ? "Lite" : "HTML"} failed for ${site}:`,
          String(error),
        );
      }
    }
  }

  console.log(`Search exhausted for ${site}: 0 results`);
  return [];
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const all: PositionListing[] = [];

  for (const site of SITES_BY_DEGREE[degreeLevel]) {
    try {
      all.push(...await searchSiteViaDuckDuckGo(site, degreeLevel, fieldHint, countryHint));
    } catch (error) {
      console.error(`Search failed for ${site}:`, String(error));
    }
  }

  const unique = new Map<string, PositionListing>();
  for (const listing of all) {
    if (listing.url && !unique.has(listing.url)) unique.set(listing.url, listing);
  }
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
