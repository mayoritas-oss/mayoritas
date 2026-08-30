// netlify/functions/lib/news-core.mjs
// Logika inti tarik RSS, dipanggil scheduled function refresh-news-1/2/3.mjs
import { getStore } from "@netlify/blobs";

const FEEDS = {
  indonesia: [
    "https://www.cnbcindonesia.com/market/rss/",
    "https://www.cnbcindonesia.com/news/rss",
  ],
  global: [
    "https://feeds.marketwatch.com/marketwatch/topstories/",
    "https://finance.yahoo.com/news/rssindex",
  ],
  commodity: [
    "https://oilprice.com/rss/main",
    "https://www.investing.com/rss/commodities.rss",
  ],
};

function stripCdata(s) {
  return (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function parseRss(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) && items.length < 8) {
    const block = m[1];
    const title = stripCdata((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = stripCdata((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    const pubDate = stripCdata((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

async function fetchFeed(feedUrl) {
  const res = await fetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const host = new URL(feedUrl).hostname.replace(/^www\./, "");
  return parseRss(xml, host);
}

export async function refreshNews() {
  const store = getStore("news-cache");
  for (const [category, urls] of Object.entries(FEEDS)) {
    let items = [];
    for (const feedUrl of urls) {
      try {
        items = items.concat(await fetchFeed(feedUrl));
      } catch (err) {
        console.error(`refresh-news: gagal ${feedUrl}:`, err.message);
      }
    }
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    await store.setJSON(category, { ts: Date.now(), items: items.slice(0, 10) });
  }
  console.log("refresh-news: selesai");
}
