import type { DegreeLevel, PositionListing } from "../types";

const SITES_BY_DEGREE: Record<DegreeLevel, string[]> = {
  bachelor: [
    "bachelorsportal.com",
    "scholarship-positions.com",
  ],

  master: [
    "findamasters.com",
    "mastersportal.com",
    "scholarship-positions.com",
  ],

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
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
    "image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  referer: "https://html.duckduckgo.com/",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
};

function escapeQueryPart(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQuery(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string {
  const parts = [
    `site:${site}`,
    DEGREE_TERM[degreeLevel],
    escapeQueryPart(fieldHint),
    escapeQueryPart(countryHint ?? ""),
  ].filter(Boolean);

  return parts.join(" ");
}

async function postDuckDuckGo(
  endpoint: string,
  query: string,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("q", query);
  body.set("b", "");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...DDG_HEADERS,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `DuckDuckGo ${endpoint} returned ${response.status}`,
    );
  }

  return await response.text();
}

function getAttribute(tag: string, name: string): string {
  const regex = new RegExp(
    `\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    "i",
  );

  const match = tag.match(regex);
  return match?.[2] ?? "";
}

function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
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
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDuckDuckGoLink(href: string): string {
  const cleaned = decodeHtmlEntities(href.trim());

  if (!cleaned) {
    return "";
  }

  try {
    const url = new URL(cleaned, "https://html.duckduckgo.com/");
    const uddg = url.searchParams.get("uddg");

    if (uddg) {
      return decodeURIComponent(uddg);
    }

    return url.href;
  } catch {
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  }
}

function normalizeHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
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

function parseResultAnchors(
  html: string,
  sourceSite: string,
): PositionListing[] {
  const results: PositionListing[] = [];

  // Do not assume attribute order. DDG has changed the order of class/href
  // attributes over time, which made the old regex silently return zero rows.
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const className = getAttribute(attrs, "class");

    if (!/\bresult__a\b/i.test(className)) {
      continue;
    }

    const href = resolveDuckDuckGoLink(getAttribute(attrs, "href"));
    const title = decodeHtmlEntities(stripTags(match[2]));

    if (!href || !title || !belongsToSourceSite(href, sourceSite)) {
      continue;
    }

    results.push({
      title,
      url: href,
      snippet: "",
      source_site: sourceSite,
    });
  }

  return results;
}

function parseSnippets(html: string): string[] {
  const snippets: string[] = [];

  const elementRegex =
    /<(?:a|div|td|span)\b([^>]*)>([\s\S]*?)<\/(?:a|div|td|span)>/gi;

  let match: RegExpExecArray | null;

  while ((match = elementRegex.exec(html)) !== null) {
    const className = getAttribute(match[1], "class");

    if (!/\bresult(?:__snippet|-snippet)\b/i.test(className)) {
      continue;
    }

    const snippet = decodeHtmlEntities(stripTags(match[2]));

    if (snippet) {
      snippets.push(snippet);
    }
  }

  return snippets;
}

/**
 * Parser for DuckDuckGo Lite and regular HTML results.
 *
 * The parser intentionally checks the final URL against sourceSite so that
 * even if DuckDuckGo ignores or weakens the site: operator, a result from
 * another domain is never returned as a match for the requested source.
 */
function parseDuckDuckGoResults(
  html: string,
  sourceSite: string,
): PositionListing[] {
  const results = parseResultAnchors(html, sourceSite);
  const snippets = parseSnippets(html);

  for (let i = 0; i < results.length; i++) {
    results[i].snippet = snippets[i] ?? "";
  }

  return results.slice(0, 5);
}

async function searchSiteViaDuckDuckGo(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const query = buildSearchQuery(
    site,
    degreeLevel,
    fieldHint,
    countryHint,
  );

  console.log(`Searching ${site} with query: ${query}`);

  /*
   * DuckDuckGo's no-JS HTML endpoint is intended for form POST requests.
   * Try Lite first, then the regular HTML endpoint.
   */
  for (const endpoint of [
    "https://lite.duckduckgo.com/lite/",
    "https://html.duckduckgo.com/html/",
  ]) {
    try {
      const html = await postDuckDuckGo(endpoint, query);
      const results = parseDuckDuckGoResults(html, site);

      console.log(
        `DuckDuckGo ${endpoint.includes("lite") ? "Lite" : "HTML"}: ` +
          `${site} -> ${results.length} results`,
      );

      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      console.error(
        `DuckDuckGo ${endpoint.includes("lite") ? "Lite" : "HTML"} ` +
          `failed for ${site}:`,
        String(error),
      );
    }
  }

  return [];
}

export async function searchPositions(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const sites = SITES_BY_DEGREE[degreeLevel];
  const all: PositionListing[] = [];

  for (const site of sites) {
    try {
      const results = await searchSiteViaDuckDuckGo(
        site,
        degreeLevel,
        fieldHint,
        countryHint,
      );

      all.push(...results);
    } catch (error) {
      console.error(
        `Search failed for ${site}:`,
        String(error),
      );
    }
  }

  const unique = new Map<string, PositionListing>();

  for (const listing of all) {
    if (!listing.url) {
      continue;
    }

    if (!unique.has(listing.url)) {
      unique.set(listing.url, listing);
    }
  }

  return Array.from(unique.values());
}

export function fallbackSearchLinks(
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): string[] {
  const query = [fieldHint, countryHint ?? ""]
    .filter(Boolean)
    .join(" ");

  const q = encodeURIComponent(query);

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

  return [
    `https://www.bachelorsportal.com/search/bachelor/${q}`,
  ];
}
