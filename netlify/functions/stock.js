// netlify/functions/stock.js
//
// Free, no-API-key data source: Yahoo Finance's public chart endpoint.
// It's unofficial (Yahoo doesn't publish this as a supported API), but it
// still works as of 2026 and needs no signup, no key, no payment.
//
// The frontend calls:  /.netlify/functions/stock?symbol=BBCA
// This function calls: https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK

exports.handler = async (event) => {
  const symbol = event.queryStringParameters && event.queryStringParameters.symbol;

  if (!symbol) {
    return {
      statusCode: 400,
      body: JSON.stringify({ status: "error", message: "missing 'symbol' query param" })
    };
  }

  const yahooSymbol = `${symbol}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=2y&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo blocks requests with no browser-like User-Agent
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ status: "error", message: `Yahoo HTTP ${res.status}` })
      };
    }

    const json = await res.json();
    const result = json.chart && json.chart.result && json.chart.result[0];

    if (!result || !result.timestamp) {
      const msg = (json.chart && json.chart.error && json.chart.error.description) || "no data returned";
      return {
        statusCode: 404,
        body: JSON.stringify({ status: "error", message: msg })
      };
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    // Build ascending list, drop any bar with missing close (halts/gaps),
    // then reverse to descending (newest first) to match the shape the
    // frontend already expects.
    const values = timestamps
      .map((t, i) => ({
        datetime: new Date(t * 1000).toISOString().slice(0, 10),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i]
      }))
      .filter(v => v.close !== null && v.close !== undefined)
      .reverse();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      },
      body: JSON.stringify({ status: "ok", values })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ status: "error", message: String(err) })
    };
  }
};
