// netlify/functions/news.mjs
// Dipanggil frontend: /.netlify/functions/news
// Cukup baca dari Blobs (diisi refresh-news.mjs) -> tidak pernah fetch
// RSS langsung dari sini, jadi selalu cepat & tidak kena rate-limit apa pun.
import { getStore } from "@netlify/blobs";

const CATEGORIES = ["indonesia", "global", "commodity"];

export default async () => {
  const store = getStore("news-cache");
  const result = {};
  for (const c of CATEGORIES) {
    try {
      const entry = await store.get(c, { type: "json" });
      result[c] = entry ? entry.items : [];
    } catch {
      result[c] = [];
    }
  }
  return new Response(JSON.stringify({ status: "ok", categories: result }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }
  });
};
