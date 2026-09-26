/** Run one engine tick locally against live OKX data and the configured DB. */
import "./lib-env.ts";
import { productionTick } from "../src/lib/prod.ts";

const summary = await productionTick();
console.log(JSON.stringify(summary, null, 2));
const { closeDb } = await import("../src/lib/db.ts");
await closeDb();
