// Jam WIB: 06:00, 18:00 -> UTC: 23:00, 11:00
import { refreshNews } from "./lib/news-core.mjs";
export default async () => { await refreshNews(); };
export const config = { schedule: "0 23,11 * * *" };
