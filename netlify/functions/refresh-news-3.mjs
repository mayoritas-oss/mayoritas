// Jam WIB: 15:31, 20:31 -> UTC: 08:31, 13:31
import { refreshNews } from "./lib/news-core.mjs";
export default async () => { await refreshNews(); };
export const config = { schedule: "31 8,13 * * *" };
