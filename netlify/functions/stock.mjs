// netlify/functions/stock.mjs
// Dipanggil frontend: /.netlify/functions/stock?symbol=BBCA
// Urutan: 1) baca dari Blobs (diisi oleh refresh-market-1/2/3.mjs, 12x/hari
//            di jam-jam tetap)
//         2) kalau kosong/basi -> fetch langsung ke Yahoo sebagai fallback
//            (tetap terjadi kalau cron belum sempat jalan, situs baru deploy, dst)
import { getStore } from "@netlify/blobs";

// Jarak terlama antar-jadwal refresh adalah ~6 jam (22:01 -> 04:01 WIB),
// jadi TTL dibikin 6.5 jam biar tidak jatuh ke live-fetch di jeda itu.
const CACHE_TTL_MS = 6.5 * 60 * 60 * 1000;
function cacheTtlMs() { return CACHE_TTL_MS; }

function jsonResponse(status, body, cacheStatus) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...(cacheStatus ? { "X-Cache": cacheStatus } : {})
    }
  });
}

async function fetchLive(symbol) {
  const isRaw = /^\^|=F$|=X$/.test(symbol);
  const yahooSymbol = isRaw ? symbol : `${symbol}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=2y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !result.timestamp) {
    throw new Error((json.chart && json.chart.error && json.chart.error.description) || "no data returned");
  }
  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const values = ts
    .map((t, i) => ({
      datetime: new Date(t * 1000).toISOString().slice(0, 10),
      open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i]
    }))
    .filter(v => v.close !== null && v.close !== undefined)
    .reverse();
  return { status: "ok", values };
}

export default async (req) => {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  if (!symbol) return jsonResponse(400, { status: "error", message: "missing 'symbol' query param" });

  const store = getStore("market-cache");

  try {
    const cached = await store.get(symbol, { type: "json" });
    if (cached && Date.now() - cached.ts < cacheTtlMs()) {
      return jsonResponse(200, cached.data, "HIT");
    }
  } catch (e) {
    // key belum ada di Blobs -> lanjut ke live fetch
  }

  try {
    const data = await fetchLive(symbol);
    store.setJSON(symbol, { ts: Date.now(), data }).catch(() => {});
    return jsonResponse(200, data, "MISS");
  } catch (err) {
    return jsonResponse(502, { status: "error", message: String(err.message || err) });
  }
};
