// netlify/functions/refresh-market-1.mjs
// Netlify cron jalan di UTC. WIB = UTC+7.
// Jam WIB yang dituju: 04:01, 09:01, 10:01, 12:01, 15:01, 16:01, 21:01, 22:01
// -> UTC:                21:01(hari sebelumnya), 02:01, 03:01, 05:01, 08:01, 09:01, 14:01, 15:01
import { refreshMarket } from "./lib/market-core.mjs";

export default async () => { await refreshMarket(); };
export const config = { schedule: "1 21,2,3,5,8,9,14,15 * * *" };
