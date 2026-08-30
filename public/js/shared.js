// ====== EDIT DI SINI SAJA — tambah/hapus ticker di array ini ======
const TICKERS = [
  "BBCA","BMRI","BBRI","BBNI","BREN","PTRO","TPIA","CDIA","BUMI",
  "WBSA","TLKM","EMAS","BRMS","PSAB","ANTM"
];
// ====================================================================

const MA_PERIODS = [10, 20, 50, 100, 200];
const MA_COLORS = {
  10: "#2962FF",
  20: "#00C853",
  50: "#FFD600",
  100: "#FF9100",
  200: "#FF1744"
};

// ---- CACHE (localStorage) ----
// TTL pendek pas jam bursa IDX (09:00-15:50 WIB) biar kerasa update, TTL panjang di luar jam bursa biar hemat fetch.
const CACHE_KEY = "mayoritas_stock_cache_v3";
const CACHE_TTL_MARKET_OPEN_MS = 15 * 60 * 1000;   // 15 menit
const CACHE_TTL_MARKET_CLOSED_MS = 6 * 60 * 60 * 1000; // 6 jam

function isIdxMarketOpen() {
  // WIB = UTC+7, tanpa perlu library timezone
  const now = new Date();
  const wib = new Date(now.getTime() + (7 * 60 - now.getTimezoneOffset()) * 60000);
  const day = wib.getDay(); // 0=Minggu, 6=Sabtu
  if (day === 0 || day === 6) return false;
  const mins = wib.getHours() * 60 + wib.getMinutes();
  return mins >= 9 * 60 && mins <= 15 * 60 + 50;
}

function currentCacheTtl() {
  return isIdxMarketOpen() ? CACHE_TTL_MARKET_OPEN_MS : CACHE_TTL_MARKET_CLOSED_MS;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const ttl = currentCacheTtl();
    const fresh = {};
    Object.entries(parsed).forEach(([ticker, entry]) => {
      if (entry.ts && now - entry.ts < ttl && entry.data && entry.data.ok) fresh[ticker] = entry.data;
    });
    return fresh;
  } catch (e) { return {}; }
}

function saveCacheEntry(ticker, data) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[ticker] = { ts: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch (e) { /* localStorage penuh/diblokir, abaikan */ }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

// ---- MA CALC ----
function sma(closes, period, endIndex) {
  if (endIndex - period + 1 < 0) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += closes[i];
  return sum / period;
}

function smaSeries(candles, period) {
  const out = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

// ---- RSI CALC (Wilder's smoothing, default period 14) ----
function rsiSeries(candles, period = 14) {
  const out = [];
  if (candles.length < period + 1) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  out.push({ time: candles[period].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  }
  return out;
}

// ---- DATA LAYER: Yahoo Finance via server-side proxy (Netlify function) ----
async function fetchStock(ticker) {
  const url = `/.netlify/functions/stock?symbol=${ticker}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json.status === "error") throw new Error(json.message || "API error");
    if (!json.values || json.values.length < 15) throw new Error("data historis kurang dari 15 hari");

    const candles = json.values
      .map(v => ({
        time: v.datetime,
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close)
      }))
      .reverse();

    const closes = candles.map(c => c.close);
    const n = closes.length - 1;

    const ma = {};
    MA_PERIODS.forEach(p => { ma[p] = smaSeries(candles, p); });
    const rsi = rsiSeries(candles, 14);

    const ma50Now = sma(closes, 50, n);
    const ma200Now = sma(closes, 200, n);
    const ma50Prev = sma(closes, 50, n - 1);
    const ma200Prev = sma(closes, 200, n - 1);

    return {
      ticker, ok: true, candles, ma, rsi,
      lastClose: closes[n], ma50: ma50Now, ma200: ma200Now, ma50Prev, ma200Prev
    };
  } catch (err) {
    return { ticker, ok: false, error: err.message };
  }
}

// ---- Load semua ticker (cache-first, fetch paralel utk yang belum ada) ----
// onEach(result) dipanggil tiap 1 saham selesai (dari cache atau fetch baru)
// onProgress(done, total, fromCache) dipanggil tiap update status
async function loadAllStocks(tickers, onEach, onProgress) {
  const stockData = {};
  const cached = loadCache();
  const toFetch = tickers.filter(t => !cached[t]);

  Object.entries(cached).forEach(([ticker, data]) => {
    stockData[ticker] = data;
    onEach && onEach(data);
  });

  let done = 0;
  if (onProgress) onProgress(done, toFetch.length, tickers.length - toFetch.length);

  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < toFetch.length) {
      const t = toFetch[cursor++];
      const r = await fetchStock(t);
      stockData[r.ticker] = r;
      saveCacheEntry(r.ticker, r);
      done++;
      onEach && onEach(r);
      if (onProgress) onProgress(done, toFetch.length, tickers.length - toFetch.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length || 1) }, worker));
  return stockData;
}

function fmtPrice(v) {
  return v == null ? "…" : Math.round(v).toLocaleString("id-ID");
}
