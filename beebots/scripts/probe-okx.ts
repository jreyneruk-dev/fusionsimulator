/** Live check of the OKX public client: no keys, chronological contract. */
import "./lib-env.ts";
import { tradableUniverse, fullRefresh } from "../src/lib/okx/aggregator.ts";

const coins = await tradableUniverse(1_000_000, 12);
console.log(`OKX EEA public API reachable. Top ${coins.length} liquid USDT perps:`);
console.log(coins.join(", "));

const data = await fullRefresh(["BTC", "ETH", "DOGE"]);
const f = (v: number | null, d = 2) => (v === null ? "null" : v.toFixed(d));
for (const id of ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "DOGE-USDT-SWAP"]) {
  const s = data.byInst[id];
  if (!s) {
    console.log(`${id.padEnd(16)} — no snapshot`);
    continue;
  }
  console.log(
    `${id.padEnd(16)} last ${String(s.last).padStart(10)}  spread ${s.spreadBps.toFixed(2).padStart(5)}bp  ` +
      `ensemble ${String(s.ensemble).padStart(3)}  rsi ${f(s.rsi, 0).padStart(5)}  pctB ${f(s.pctB, 3).padStart(7)}  ` +
      `atr% ${f(s.atrPct).padStart(5)}  r7d ${s.r7d === null ? "null" : (s.r7d * 100).toFixed(1) + "%"}  ` +
      `funding ${s.funding === null ? "null" : (s.funding * 100).toFixed(4) + "%"}  fundingZ ${f(s.fundingZ)}  ` +
      `volZ ${f(s.volZ)}  todayOpen ${s.todayOpen}  prevRange ${s.prevRange === null ? "null" : s.prevRange.toPrecision(4)}`,
  );
}
