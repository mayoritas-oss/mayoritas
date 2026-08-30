// netlify/functions/stock.js
//
// Server-side proxy for Twelve Data. The API key lives ONLY here, as a
// Netlify environment variable — it never reaches the browser.
//
// Set it up once in the Netlify dashboard:
//   Site settings → Environment variables → Add variable
//     Key:   TWELVE_DATA_KEY
//     Value: 05f30c7b8a30496c9763a27c7f13a0fd   (or a fresh key — see note below)
//
// The frontend calls:  /.netlify/functions/stock?symbol=BBCA
// This function calls: https://api.twelvedata.com/time_series?symbol=BBCA&exchange=IDX&...

exports.handler = async (event) => {
  const symbol = event.queryStringParameters && event.queryStringParameters.symbol;

  if (!symbol) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "missing 'symbol' query param" })
    };
  }

  const apiKey = process.env.TWELVE_DATA_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "TWELVE_DATA_KEY not configured on server" })
    };
  }

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&exchange=IDX&interval=1day&outputsize=260&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        // Allow the browser to cache short-term too, on top of your own localStorage cache
        "Cache-Control": "public, max-age=300"
      },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "upstream fetch failed", detail: String(err) })
    };
  }
};
