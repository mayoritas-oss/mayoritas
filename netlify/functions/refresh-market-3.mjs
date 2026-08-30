// netlify/functions/refresh-market-3.mjs
// Jam WIB: 15:31, 20:31 -> UTC: 08:31, 13:31
import { refreshMarket } from "./lib/market-core.mjs";

export default async () => { await refreshMarket(); };
export const config = { schedule: "31 8,13 * * *" };
