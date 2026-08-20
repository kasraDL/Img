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
  bachelor: "Bachelor program",
  master: "Master program",
  phd: "PhD position",
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
};

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

async function searchSiteViaDuckDuckGo(
  site: string,
  degreeLevel: DegreeLevel,
  fieldHint: string,
  countryHint?: string,
): Promise<PositionListing[]> {
  const query = [
    `site:${site}`,
    `"${DEGREE_TERM[degreeLevel]}"`,
    fieldHint,
    countryHint ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  /*
   * First try DuckDuckGo Lite.
   * It is specifically designed for lightweight non-JS clients.
   */
  try {
    const html = await postDuckDuckGo(
      "https://lite.duckduckgo.com/lite/",
      query,
    );

    const results = parseDuckDuckGoLiteResults(html, site);

    if (results.length > 0) {
      console.log(
        `DuckDuckGo Lite: ${site} -> ${results.length} results`,
      );

      return results;
    }
  } catch (error) {
    console.error(
      `DuckDuckGo Lite failed for ${site}:`,
      String(error),
    );
  }

  /*
   * Fallback to the regular HTML endpoint.
   */
  try {
    const html = await postDuckDuckGo(
      "https://html.duckduckgo.com/html/",
      query,
    );

    const results = parseDuckDuckGoHtmlResults(html, site);

    console.log(
      `DuckDuckGo HTML: ${site} -> ${results.length} results`,
    );

    return results;
  } catch (error) {
    console.error(
      `DuckDuckGo HTML failed for ${site}:`,
      String(error),
    );

    return [];
  }
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
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDuckDuckGoLink(href: string): string {
  if (href.includes("uddg=")) {
    const match = href.match(/[?&]uddg=([^&]+)/);

    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return href;
      }
    }
  }

  if (href.startsWith("//")) {
    return `https:${href}`;
  }

  return href;
}

/**
 * Parser for DuckDuckGo Lite.
 *
 * Typical Lite markup contains:
 *
 * <a rel="nofollow" class="result-link" href="...">
 *   Result title
 * </a>
 */
function parseDuckDuckGoLiteResults(
  html: string,
  sourceSite: string,
): PositionListing[] {
  const results: PositionListing[] = [];

  const resultRegex =
    /<a[^>]*class=["'][^"']*result-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = resultRegex.exec(html)) !== null) {
    const url = resolveDuckDuckGoLink(match[1]);
    const title = decodeHtmlEntities(match[2]);

    if (!url || !title) {
      continue;
    }

    results.push({
      title,
      url,
      snippet: "",
      source_site: sourceSite,
    });
  }

  /*
   * Lite pages sometimes expose snippets in result-snippet elements.
   */
  const snippetRegex =
    /<(?:td|div)[^>]*class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div)>/gi;

  const snippets: string[] = [];

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHtmlEntities(match[1]));
  }

  for (let i = 0; i < results.length; i++) {
    if (snippets[i]) {
      results[i].snippet = snippets[i];
    }
  }

  return results.slice(0, 5);
}

/**
 * Parser for regular DuckDuckGo HTML results.
 */
function parseDuckDuckGoHtmlResults(
  html: string,
  sourceSite: string,
): PositionListing[] {
  const results: PositionListing[] = [];

  const resultRegex =
    /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  const snippetRegex =
    /<(?:a|div)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi;

  const titles: {
    href: string;
    title: string;
  }[] = [];

  let match: RegExpExecArray | null;

  while ((match = resultRegex.exec(html)) !== null) {
    titles.push({
      href: resolveDuckDuckGoLink(match[1]),
      title: decodeHtmlEntities(match[2]),
    });
  }

  const snippets: string[] = [];

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHtmlEntities(match[1]));
  }

  for (let i = 0; i < titles.length; i++) {
    if (!titles[i].href || !titles[i].title) {
      continue;
    }

    results.push({
      title: titles[i].title,
      url: titles[i].href,
      snippet: snippets[i] ?? "",
      source_site: sourceSite,
    });
  }

  return results.slice(0, 5);
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

  /*
   * Remove duplicate URLs.
   */
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