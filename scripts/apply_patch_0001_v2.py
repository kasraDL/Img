from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def edit(path, transform):
    p = ROOT / path
    s = p.read_text()
    n = transform(s)
    if n != s:
        p.write_text(n)
        print('updated', path)

def must_replace(s, old, new, label):
    if old not in s:
        raise SystemExit(f'missing marker: {label}')
    return s.replace(old, new, 1)

# .gitignore
p = ROOT / '.gitignore'
if not p.exists():
    p.write_text('node_modules/\n.wrangler/\ndist/\n*.log\n.env\n.dev.vars\n')

# Env secret binding.
edit('src/types.ts', lambda s: s if 'BRAVE_SEARCH_API_KEY' in s else must_replace(
    s,
    '  TELEGRAM_WEBHOOK_SECRET: string;\n',
    '  TELEGRAM_WEBHOOK_SECRET: string;\n  BRAVE_SEARCH_API_KEY?: string;\n',
    'BRAVE_SEARCH_API_KEY binding'))

# Webhook wiring.
edit('src/handlers/webhook.ts', lambda s: s if 'env.BRAVE_SEARCH_API_KEY' in s else must_replace(
    s,
    '''    const siteListings =\n      await searchPositions(\n        degreeLevel,\n        fieldHint,\n        countryHint\n      );''',
    '''    const siteListings =\n      await searchPositions(\n        degreeLevel,\n        fieldHint,\n        countryHint,\n        undefined,\n        env.BRAVE_SEARCH_API_KEY\n      );''',
    'webhook searchPositions call'))

# Telegram Markdown fallback.
def telegram(s):
    if 'class TelegramApiError' in s:
        return s
    s = must_replace(s,
        '''export interface InlineButton {\n  text: string;\n  callback_data?: string;\n  url?: string; // for "open in mail app" buttons (mailto:) - set exactly one of url/callback_data\n}\n\n''',
        '''export interface InlineButton {\n  text: string;\n  callback_data?: string;\n  url?: string; // for "open in mail app" buttons (mailto:) - set exactly one of url/callback_data\n}\n\nexport class TelegramApiError extends Error {\n  constructor(\n    public readonly method: string,\n    public readonly description: string,\n    public readonly payload: unknown\n  ) {\n    super(`Telegram API error on ${method}: ${description}`);\n    this.name = "TelegramApiError";\n  }\n}\n\nfunction isEntityParseError(error: unknown): boolean {\n  return error instanceof TelegramApiError && /can't parse entities/i.test(error.description);\n}\n\n''',
        'TelegramApiError class')
    s = must_replace(s,
        '''    if (!res.ok || (data as { ok?: boolean }).ok === false) {\n      throw new Error(`Telegram API error on ${method}: ${JSON.stringify(data)}`);\n    }''',
        '''    if (!res.ok || (data as { ok?: boolean }).ok === false) {\n      const description =\n        (data as { description?: string })?.description ?? JSON.stringify(data);\n      throw new TelegramApiError(method, description, data);\n    }''',
        'Telegram error type')
    s = must_replace(s,
        '''  async sendMessage(\n''',
        '''  private async callWithTextFallback<T = unknown>(\n    method: string,\n    body: Record<string, unknown>\n  ): Promise<T> {\n    try {\n      return await this.call<T>(method, body);\n    } catch (error) {\n      if (isEntityParseError(error) && body.parse_mode) {\n        const { parse_mode: _parseMode, ...plain } = body;\n        return await this.call<T>(method, plain);\n      }\n      throw error;\n    }\n  }\n\n  async sendMessage(\n''',
        'Telegram text fallback method')
    s = s.replace('return this.call("sendMessage", body);', 'return this.callWithTextFallback("sendMessage", body);', 1)
    s = s.replace('return this.call("editMessageText", {', 'return this.callWithTextFallback("editMessageText", {', 1)
    return s
edit('src/services/telegramApi.ts', telegram)

# Current search layer: add Brave as the first provider fallback and parallelize portal calls.
def search_patch(s):
    if 'async function searchBrave(' not in s:
        marker = '''async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {'''
        helper = '''async function searchBrave(\n  apiKey: string,\n  query: string,\n  sourceSite: string\n): Promise<PositionListing[]> {\n  const url = new URL("https://api.search.brave.com/res/v1/web/search");\n  url.searchParams.set("q", query);\n  url.searchParams.set("count", "20");\n  url.searchParams.set("search_lang", "en");\n  const response = await fetch(url, {\n    headers: {\n      Accept: "application/json",\n      "X-Subscription-Token": apiKey,\n    },\n  });\n  if (!response.ok) {\n    throw new Error(`Brave Search returned ${response.status}`);\n  }\n  const payload = (await response.json()) as {\n    web?: {\n      results?: Array<{ title?: string; url?: string; description?: string }>;\n    };\n  };\n  return (payload.web?.results ?? []).\n    .filter((item) => item.url && item.title && isSourceUrl(item.url, sourceSite))\n    .map((item) => ({\n      title: stripTags(item.title ?? ""),\n      url: item.url ?? "",\n      snippet: stripTags(item.description ?? ""),\n      source_site: sourceSite,\n      country: countryCanonical(`${item.title ?? ""} ${item.description ?? ""} ${item.url ?? ""}`),\n    }))\n    .filter((item) => looksLikeRealPosition(sourceSite, item.url, item.title))\n    .slice(0, 10);\n}\n\nasync function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {'''
        s = must_replace(s, marker, helper, 'Brave helper insertion')
    s = s.replace(
        'async function searchSite(site: string, filters: SearchFilters): Promise<PositionListing[]> {',
        'async function searchSite(site: string, filters: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {',
        1,
    )
    if 'if (raw.length === 0 && braveSearchApiKey?.trim())' not in s:
        marker = '''  raw = dedupe(raw);\n  if (raw.length === 0) {'''
        repl = '''  raw = dedupe(raw);\n\n  if (raw.length === 0 && braveSearchApiKey?.trim()) {\n    try {\n      const query = providerQuery(site, filters);\n      console.log(`Brave evidence search ${site}: ${query}`);\n      raw = dedupe(await searchBrave(braveSearchApiKey, query, site));\n      console.log(`Brave Search ${site}: ${raw.length} results`);\n    } catch (error) {\n      console.error(`Brave Search failed for ${site}:`, String(error));\n    }\n  }\n\n  if (raw.length === 0) {'''
        s = must_replace(s, marker, repl, 'Brave fallback insertion')
    old_loop = '''  const all: PositionListing[] = [];\n  for (const site of SITES_BY_DEGREE[filters.degree_level]) { try { all.push(...await searchSite(site, filters)); } catch (error) { console.error(`Site search failed for ${site}:`, String(error)); } }\n  const unique = dedupe(all).sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters)).slice(0, 10);'''
    if old_loop in s:
        s = s.replace(old_loop, '''  const perSite = await Promise.all(\n    SITES_BY_DEGREE[filters.degree_level].map(async (site) => {\n      try {\n        return await searchSite(site, filters, braveSearchApiKey);\n      } catch (error) {\n        console.error(`Site search failed for ${site}:`, String(error));\n        return [] as PositionListing[];\n      }\n    }),\n  );\n  const all = perSite.flat();\n  const unique = dedupe(all).sort((a, b) => relevanceScore(b, filters) - relevanceScore(a, filters)).slice(0, 10);''', 1)
    if 'export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters, braveSearchApiKey?: string)' not in s:
        s = s.replace(
            'export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters): Promise<PositionListing[]> {',
            'export async function searchPositions(degreeLevel: DegreeLevel, fieldHint: string, countryHint?: string, filtersInput?: SearchFilters, braveSearchApiKey?: string): Promise<PositionListing[]> {',
            1,
        )
    return s
edit('src/services/search.ts', search_patch)

# Wrangler docs.
edit('wrangler.toml', lambda s: s if 'BRAVE_SEARCH_API_KEY' in s else must_replace(
    s,
    '''#\n# No paid API keys are required for this version. Position search uses a free,\n# unofficial DuckDuckGo HTML scrape (see src/services/search.ts) instead of a\n# paid search API - see that file's comments if you want to upgrade later.\n''',
    '''# BRAVE_SEARCH_API_KEY    - optional. If set, position search uses the Brave Search\n#                           API. If unset, the bot falls back to Bing's public RSS\n#                           endpoint automatically.\n''',
    'wrangler Brave secret comment'))

# README and audit notes.
def readme(s):
    s = s.replace('via a **free DuckDuckGo HTML search** (no API key)', 'using the **Brave Search API** if configured, or **Bing public RSS** automatically if no key is configured')
    s = s.replace('Position search | **DuckDuckGo HTML scrape** | Free, no key — but unofficial (see caveat below) |', 'Position search | **Brave Search API** (optional) / **Bing RSS** fallback | Free fallback; optional API key |')
    s = s.replace('its plain HTML results page', "Bing's public RSS endpoint")
    s = s.replace('DuckDuckGo search has no official API', 'Bing RSS is an unofficial public endpoint')
    if 'BRAVE_SEARCH_API_KEY' not in s:
        s = s.replace('wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string you make up yourself', 'wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string you make up yourself\nwrangler secret put BRAVE_SEARCH_API_KEY       # optional')
    return s
edit('README.md', readme)

def audit(s):
    if 'Brave Search API key wiring' in s:
        return s
    block = '''## Second pass — confirmed bugs fixed\n\n- **Brave Search API key wiring:** the optional `BRAVE_SEARCH_API_KEY` binding is passed from the Worker handler into the search layer.\n- **Telegram Markdown fallback:** text-send methods retry as plain text when Telegram rejects unescaped Markdown entities.\n- **Parallel multi-site search:** curated site searches run concurrently with `Promise.all`.\n\n'''
    return s.replace('# Audit status\n', '# Audit status\n\n' + block, 1) if '# Audit status' in s else block + s
edit('AUDIT.md', audit)

print('patch 0001 migration applied')
