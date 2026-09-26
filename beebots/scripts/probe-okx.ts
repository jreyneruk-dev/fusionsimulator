/** Live check of the OKX public client: top liquid crypto perps, no keys. */
import "./lib-env.ts";
import { tradableUniverse } from "../src/lib/okx/aggregator.ts";

const coins = await tradableUniverse(1_000_000, 12);
console.log(`OKX EEA public API reachable. Top ${coins.length} liquid USDT perps:`);
console.log(coins.join(", "));
