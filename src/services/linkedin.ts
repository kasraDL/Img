/**
 * There is no free, automated way to pull a specific LinkedIn page's posts:
 *
 * - LinkedIn's official API only exposes another organization's posts to
 *   approved Marketing Developer Platform partners (an application/approval
 *   process, not a signup), and isn't meant for this use case.
 * - LinkedIn dropped public RSS feeds for pages years ago.
 * - Scraping LinkedIn directly requires a logged-in session, defeats heavy
 *   anti-bot measures, and is against LinkedIn's Terms of Service - this
 *   project intentionally does not do that.
 *
 * So LinkedIn entries in `monitored_sources` are stored for reference only:
 * the bot reminds the student to check them manually during a search, and
 * the student can paste a specific post's text into the chat to have it
 * scored and turned into a motivation letter/email like any other listing.
 */
export function normalizeLinkedInIdentifier(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Allow shorthand like "acme-university" -> a full company page URL.
  return `https://www.linkedin.com/company/${trimmed.replace(/^\//, "")}`;
}
