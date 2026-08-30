// netlify/functions/refresh-market-2.mjs
// Jam WIB: 06:00, 18:00 -> UTC: 23:00(hari sebelumnya), 11:00
import { refreshMarket } from "./lib/market-core.mjs";

export default async () => { await refreshMarket(); };
export const config = { schedule: "0 23,11 * * *" };
