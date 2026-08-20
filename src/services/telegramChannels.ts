import type { PositionListing } from "../types";

/**
 * Fetches the most recent posts from a PUBLIC Telegram channel using its
 * plain HTML preview page (t.me/s/<channel>). This page is what Telegram
 * itself serves for embedding/sharing channel content in browsers - it
 * needs no bot-admin rights and no API key, so it's genuinely free.
 *
 * Limitations:
 * - Only works for public channels (have a @username, not invite-only).
 * - Only shows roughly the most recent ~20 posts, no deep history.
 * - It's an HTML page meant for humans, not a documented API, so Telegram
 *   could change its markup - if this starts returning nothing, that's the
 *   first thing to check.
 */
export async function fetchChannelPosts(channelUsername: string): Promise<PositionListing[]> {
  const handle = channelUsername.replace(/^@/, "").trim();
  const url = `https://t.me/s/${encodeURIComponent(handle)}`;

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  return parseChannelPosts(html, handle);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Each post on the preview page sits in a
 * <div class="tgme_widget_message_wrap" ...>...<div class="tgme_widget_message_text" ...>TEXT</div>...</div>
 * block, with the post's own permalink in a data-post="channel/123" attribute
 * on an ancestor. We parse both with regex since Workers has no DOM.
 */
function parseChannelPosts(html: string, channelUsername: string): PositionListing[] {
  const posts: PositionListing[] = [];

  const blockRegex = /data-post="([^"]+)"[\s\S]*?(?=data-post="|$)/g;
  const textRegex = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/;

  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(html)) !== null) {
    const postPath = m[1]; // e.g. "somechannel/123"
    const block = m[0];
    const textMatch = textRegex.exec(block);
    if (!textMatch) continue;

    const text = decodeHtmlEntities(textMatch[1]);
    if (!text || text.length < 20) continue;

    posts.push({
      title: text.split("\n")[0].slice(0, 120),
      snippet: text.slice(0, 500),
      url: `https://t.me/${postPath}`,
      source_site: `t.me/${channelUsername}`,
    });
  }

  return posts.slice(0, 15);
}
