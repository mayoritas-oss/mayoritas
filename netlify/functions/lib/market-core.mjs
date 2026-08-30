// netlify/functions/lib/market-core.mjs
// Logika inti refresh harga, dipanggil oleh 3 scheduled function
// (refresh-market-1/2/3.mjs) yang beda jamnya saja. Bukan endpoint sendiri.
import { getStore } from "@netlify/blobs";

export const TICKERS = [
  "BBCA","BMRI","BBRI","BBNI","BREN","PTRO","TPIA","CDIA","BUMI",
  "WBSA","TLKM","EMAS","BRMS","PSAB","ANTM"
];
export const GLOBAL_SYMBOLS = ["^JKSE","^GSPC","^IXIC","^DJI","IDR=X","GC=F","CL=F","^TNX"];

async function fetchYahoo(symbol) {
  const isRaw = /^\^|=F$|=X$/.test(symbol);
  const yahooSymbol = isRaw ? symbol : `${symbol}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=2y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !result.timestamp) {
    throw new Error((json.chart && json.chart.error && json.chart.error.description) || "no data");
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

export async function refreshMarket() {
  const store = getStore("market-cache");
  const all = [...TICKERS, ...GLOBAL_SYMBOLS];
  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < all.length) {
      const symbol = all[cursor++];
      try {
        const data = await fetchYahoo(symbol);
        await store.setJSON(symbol, { ts: Date.now(), data });
      } catch (err) {
        console.error(`refresh-market: gagal untuk ${symbol}:`, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`refresh-market: selesai, ${all.length} simbol diproses`);
}
