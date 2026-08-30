// Jam WIB: 04:01,09:01,10:01,12:01,15:01,16:01,21:01,22:01 -> UTC lihat refresh-market-1.mjs
import { refreshNews } from "./lib/news-core.mjs";
export default async () => { await refreshNews(); };
export const config = { schedule: "1 21,2,3,5,8,9,14,15 * * *" };
