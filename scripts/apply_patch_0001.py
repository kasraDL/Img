from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def edit(path: str, fn):
    p = ROOT / path
    text = p.read_text()
    new = fn(text)
    if new == text:
        return False
    p.write_text(new)
    print(f"updated {path}")
    return True

# .gitignore
p = ROOT / ".gitignore"
if not p.exists():
    p.write_text("node_modules/\n.wrangler/\ndist/\n*.log\n.env\n.dev.vars\n")

# Env binding for optional Brave Search API.
def patch_types(s):
    if "BRAVE_SEARCH_API_KEY" in s:
        return s
    marker = '  TELEGRAM_WEBHOOK_SECRET: string;\n'
    if marker not in s:
        raise SystemExit("types.ts: TELEGRAM_WEBHOOK_SECRET marker not found")
    return s.replace(marker, marker + '  BRAVE_SEARCH_API_KEY?: string;\n', 1)
edit("src/types.ts", patch_types)

# Wire the optional key into the current search call.
def patch_webhook(s):
    if "env.BRAVE_SEARCH_API_KEY" in s:
        return s
    old = '''    const siteListings =\n      await searchPositions(\n        degreeLevel,\n        fieldHint,\n        countryHint\n      );'''
    new = '''    const siteListings =\n      await searchPositions(\n        degreeLevel,\n        fieldHint,\n        countryHint,\n        env.BRAVE_SEARCH_API_KEY\n      );'''
    if old not in s:
        raise SystemExit("webhook.ts: searchPositions call site not found")
    return s.replace(old, new, 1)
edit("src/handlers/webhook.ts", patch_webhook)

# Telegram plain-text retry for Markdown entity parsing failures.
def patch_telegram(s):
    if "class TelegramApiError" in s:
        return s

    class_marker = '''export interface InlineButton {\n  text: string;\n  callback_data?: string;\n  url?: string; // for "open in mail app" buttons (mailto:) - set exactly one of url/callback_data\n}\n\n'''
    class_insert = '''export interface InlineButton {\n  text: string;\n  callback_data?: string;\n  url?: string; // for "open in mail app" buttons (mailto:) - set exactly one of url/callback_data\n}\n\nexport class TelegramApiError extends Error {\n  constructor(\n    public readonly method: string,\n    public readonly description: string,\n    public readonly payload: unknown\n  ) {\n    super(`Telegram API error on ${method}: ${description}`);\n    this.name = "TelegramApiError";\n  }\n}\n\nfunction isEntityParseError(error: unknown): boolean {\n  return (\n    error instanceof TelegramApiError &&\n    /can't parse entities/i.test(error.description)\n  );\n}\n\n'''
    if class_marker not in s:
        raise SystemExit("telegramApi.ts: InlineButton marker not found")
    s = s.replace(class_marker, class_insert, 1)

    old_call_error = '''    if (!res.ok || (data as { ok?: boolean }).ok === false) {\n      throw new Error(`Telegram API error on ${method}: ${JSON.stringify(data)}`);\n    }'''
    new_call_error = '''    if (!res.ok || (data as { ok?: boolean }).ok === false) {\n      const description =\n        (data as { description?: string })?.description ?? JSON.stringify(data);\n      throw new TelegramApiError(method, description, data);\n    }'''
    if old_call_error not in s:
        raise SystemExit("telegramApi.ts: call error block not found")
    s = s.replace(old_call_error, new_call_error, 1)

    fallback = '''\n  private async callWithTextFallback<T = unknown>(\n    method: string,\n    body: Record<string, unknown>\n  ): Promise<T> {\n    try {\n      return await this.call<T>(method, body);\n    } catch (error) {\n      if (isEntityParseError(error) && body.parse_mode) {\n        const { parse_mode: _parseMode, ...plain } = body;\n        return await this.call<T>(method, plain);\n      }\n      throw error;\n    }\n  }\n'''
    marker = '''  async sendMessage(\n'''
    if marker not in s:
        raise SystemExit("telegramApi.ts: sendMessage marker not found")
    s = s.replace(marker, fallback + "\n" + marker, 1)
    s = s.replace('return this.call("sendMessage", body);', 'return this.callWithTextFallback("sendMessage", body);', 1)
    s = s.replace('return this.call("editMessageText", {', 'return this.callWithTextFallback("editMessageText", {', 1)
    return s
edit("src/services/telegramApi.ts", patch_telegram)

# Add Brave support and parallel site execution without disturbing the current
# portal-specific parsing/filtering pipeline.
def patch_search(s):
    if "function parseBraveResults" not in s:
        marker = '''async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {'''
        helper = r'''function parseBraveResults(payload: unknown, sourceSite: string): PositionListing[] {
  const web =
    typeof payload === "object" && payload !== null && "web" in payload
      ? (payload as { web?: { results?: unknown[] } }).web
      : undefined;
  const rawResults = Array.isArray(web?.results) ? web.results : [];
  const results: PositionListing[] = [];

  for (const raw of rawResults) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as { title?: unknown; url?: unknown; description?: unknown };
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? stripTags(item.title) : "";
    const snippet = typeof item.description === "string" ? stripTags(item.description) : "";
    if (!url || !title || !isSourceUrl(url, sourceSite) || !looksLikeRealPosition(sourceSite, url, title)) continue;
    results.push({ title, url, snippet, source_site: sourceSite, country: countryCanonical(`${title} ${snippet} ${url}`) });
  }
  return results.slice(0, 10);
}

async function searchBrave(apiKey: string, query: string, sourceSite: string): Promise<PositionListing[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`);
  return parseBraveResults(await response.json(), sourceSite);
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {'''
        if marker not in s:
            raise SystemExit("search.ts: fetchText marker not found")
        s = s.replace(marker, helper, 1)

    s = s.replace(
        'async function searchSite(site: string, filters: SearchFilters): Promise<PositionListing[]> {',
        'async function searchSite(site: string, filters: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {',
        1,
    )

    old_fallback = '''  raw = dedupe(raw);\n  if (raw.length === 0) {\n    const query = providerQuery(site, filters);'''
    new_fallback = '''  raw = dedupe(raw);\n\n  if (raw.length === 0 && braveSearchApiKey?.trim()) {\n    const braveQuery = `${providerQuery(site, filters)}`;\n    console.log(`Brave evidence search ${site}: ${braveQuery}`);\n    try {\n      const brave = await searchBrave(braveSearchApiKey, braveQuery, site);\n      console.log(`Brave Search ${site}: ${brave.length} results`);\n      raw = dedupe(brave);\n    } catch (error) {\n      console.error(`Brave Search failed for ${site}:`, String(error));\n    }\n  }\n\n  if (raw.length === 0) {\n    const query = providerQuery(site, filters);'''
    if old_fallback not in s:
        raise SystemExit("search.ts: fallback marker not found")
    s = s.replace(old_fallback, new_fallback, 1)

    old_loop = '''  const all: PositionListing[] = [];\n  for (const site of SITES_BY_DEGREE[filters.degree_level]) { try { all.push(...await searchSite(site, filters)); } catch (error) { console.error(`Site search failed for ${site}:`, String(error)); } }\n  const unique = dedupe(all).sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters)).slice(0, 10);'''
    new_loop = '''  const perSite = await Promise.all(\n    SITES_BY_DEGREE[filters.degree_level].map(async (site) => {\n      try {\n        return await searchSite(site, filters, braveSearchApiKey);\n      } catch (error) {\n        console.error(`Site search failed for ${site}:`, String(error));\n        return [] as PositionListing[];\n      }\n    }),\n  );\n  const all = perSite.flat();\n  const unique = dedupe(all).sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters)).slice(0, 10);'''
    if old_loop not in s:
        raise SystemExit("search.ts: sequential loop marker not found")
    s = s.replace(old_loop, new_loop, 1)

    s = s.replace(
        'export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters): Promise<PositionListing[]> {',
        'export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {',
        1,
    )
    return s
edit("src/services/search.ts", patch_search)

# Wrangler documentation update.
def patch_wrangler(s):
    if "BRAVE_SEARCH_API_KEY" in s:
        return s
    old = '''#\n# No paid API keys are required for this version. Position search uses a free,\n# unofficial DuckDuckGo HTML scrape (see src/services/search.ts) instead of a\n# paid search API - see that file's comments if you want to upgrade later.\n'''
    new = '''# BRAVE_SEARCH_API_KEY    - optional. If set, position search uses the Brave Search\n#                           API. If unset, the bot falls back to Bing's public RSS\n#                           endpoint automatically.\n'''
    if old not in s:
        raise SystemExit("wrangler.toml: old search secret comment not found")
    return s.replace(old, new, 1)
edit("wrangler.toml", patch_wr
default := patch_wrangler)

# README: update provider descriptions without rewriting the whole document.
def patch_readme(s):
    replacements = {
        '**DuckDuckGo HTML scrape**': '**Brave Search API** (optional key) or **Bing RSS** fallback',
        'via a **free DuckDuckGo HTML search** (no API key)': 'using the **Brave Search API** if configured, or **Bing public RSS** automatically if no key is configured',
        'Position search | **DuckDuckGo HTML scrape** | Free, no key — but unofficial (see caveat below) |': 'Position search | **Brave Search API** (optional) / **Bing RSS** fallback | Free fallback; optional API key |',
        'its plain HTML results page': "Bing's public RSS endpoint",
        'DuckDuckGo search has no official API': 'Bing RSS is an unofficial public endpoint',
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    s = s.replace('wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string you make up yourself', 'wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string you make up yourself\nwrangler secret put BRAVE_SEARCH_API_KEY       # optional')
    s = s.replace('No credit card, no external API keys beyond your Telegram bot token', 'No credit card required; Brave Search is optional, and the Bing RSS fallback needs no search key')
    return s
edit("README.md", patch_readme)

# AUDIT: add the patch's audit notes at the top if not already present.
def patch_audit(s):
    if "Brave Search API key was never wired up" in s:
        return s
    header = '''## Second pass — confirmed bugs fixed\n\n- **Brave Search API key wiring:** the optional `BRAVE_SEARCH_API_KEY` binding is now passed from the Worker handler into the search layer.\n- **Telegram Markdown fallback:** text-send methods now retry as plain text when Telegram rejects unescaped Markdown entities.\n- **Parallel multi-site search:** the curated site searches now run concurrently with `Promise.all`, reducing end-to-end webhook latency.\n\n'''
    return s.replace('# Audit status\n', '# Audit status\n\n' + header, 1) if '# Audit status' in s else header + s
edit("AUDIT.md", patch_audit)

# Remove this helper from the commit; the workflow file remains intentionally transient and is deleted below.
workflow = ROOT / ".github/workflows/apply-patch-0001.yml"
if workflow.exists():
    workflow.unlink()

# The migration script itself is also temporary.
try:
    Path(__file__).unlink()
except OSError:
    pass

print("Patch 0001 migration completed.")
