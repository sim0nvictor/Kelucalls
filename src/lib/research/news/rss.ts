/**
 * Minimal RSS 2.0 parser tailored to news-provider feeds.
 *
 * This is intentionally NOT a full XML parser. RSS feeds we consume
 * (CoinDesk, Cointelegraph, TechCrunch) all use the same basic shape:
 *
 *   <rss><channel>
 *     <item>
 *       <title>...</title>
 *       <link>...</link>
 *       <pubDate>RFC 822 (e.g. "Fri, 28 Aug 2026 09:11:45 +0000")</pubDate>
 *       <description>...</description>
 *       <content:encoded>...</content:encoded>
 *       <dc:creator>...</dc:creator>
 *       <media:content url="..." />
 *     </item>
 *     ...
 *   </channel></rss>
 *
 * We only need to extract title, link, pubDate, and a description snippet.
 * Robust against CDATA, namespace prefixes, and the WordPress quirks
 * TechCrunch adds (whitespace, <![CDATA[]]>, escaped entities).
 *
 * If a feed ever deviates, we return what we can; the per-item parser is
 * tolerant of missing fields.
 */

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

/** Strip a CDATA wrapper if present, otherwise return the inner text trimmed. */
function unwrapCdata(value: string): string {
  const trimmed = value.trim();
  const cdataMatch = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdataMatch) return cdataMatch[1].trim();
  return trimmed;
}

/** Strip basic HTML tags and decode the few entities we care about. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a single named element's text content out of an XML chunk. */
function extractTag(chunk: string, tag: string): string | null {
  // Match <tag>...</tag>, <ns:tag>...</ns:tag>, and tags with attributes.
  // The namespace prefix is optional (zero or more word/colon chars).
  const pattern = new RegExp(
    `<(?:[\\w:]+)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/[\\w:]*${tag}>`,
    "i"
  );
  const match = chunk.match(pattern);
  if (!match) return null;
  return unwrapCdata(match[1]);
}

/** Split the feed body into <item>...</item> chunks. */
function splitItems(feed: string): string[] {
  const items: string[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  for (const match of feed.matchAll(re)) {
    items.push(match[0]);
  }
  return items;
}

/** Parse a single <item> chunk into an RssItem, or null if required fields are missing. */
export function parseRssItem(chunk: string): RssItem | null {
  const title = extractTag(chunk, "title");
  const link = extractTag(chunk, "link");
  const pubDate = extractTag(chunk, "pubDate");
  if (!title || !link || !pubDate) return null;

  // Prefer the longer content:encoded snippet; fall back to <description>.
  const encoded = extractTag(chunk, "encoded");
  const descriptionRaw = encoded ?? extractTag(chunk, "description") ?? "";

  return {
    title: stripHtml(title),
    link: stripHtml(link),
    pubDate: stripHtml(pubDate),
    description: stripHtml(descriptionRaw).slice(0, 600)
  };
}

/** Parse an RSS 2.0 feed body and return its items. */
export function parseRssFeed(feed: string): RssItem[] {
  const chunks = splitItems(feed);
  const items: RssItem[] = [];
  for (const chunk of chunks) {
    const parsed = parseRssItem(chunk);
    if (parsed) items.push(parsed);
  }
  return items;
}
