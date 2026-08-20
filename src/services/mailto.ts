/**
 * Sending via mailto: (rather than an email-sending API) is a deliberate
 * choice, not a shortcut:
 * - It's free with zero setup (no domain verification, no API key).
 * - The email goes out from the student's OWN address, which reads as
 *   genuine to a professor rather than as bulk/automated mail.
 * - It keeps a human glance-and-tap in the loop before anything reaches a
 *   real person - see the caveat in README.md.
 *
 * The AI draft is expected as "Subject: ...\n\n<body>" - the first line is
 * pulled out as the subject, the rest becomes the mailto body.
 */
export function buildMailtoLink(toEmail: string | null | undefined, draft: string): string {
  const lines = draft.split("\n");
  let subject = "";
  let bodyStartIndex = 0;

  if (lines[0]?.toLowerCase().startsWith("subject:")) {
    subject = lines[0].slice(lines[0].indexOf(":") + 1).trim();
    bodyStartIndex = 1;
    while (lines[bodyStartIndex] === "") bodyStartIndex++;
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);

  const to = toEmail ? encodeURIComponent(toEmail) : "";
  return `mailto:${to}?${params.toString()}`;
}
