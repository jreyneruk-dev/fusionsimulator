/**
 * The hive roster. Strategies are the MIT-licensed ones from
 * imikerussell/beebots; the names, taglines and portraits are our own.
 */

import type { Style } from "@/lib/types";

export interface BeeSeed {
  beeId: string;
  name: string;
  style: Style;
  tagline: string;
  /** null = the style's default universe */
  coins: string[] | null;
}

export const BEE_SEEDS: BeeSeed[] = [
  {
    beeId: "waggle",
    name: "Waggle",
    style: "breakout",
    tagline: "One clean breakout a day, then rides it to the UTC close.",
    coins: null,
  },
  {
    beeId: "hover",
    name: "Hover",
    style: "trend",
    tagline: "Patient ensemble trend-follower. Never flat, rarely wrong for long.",
    coins: null,
  },
  {
    beeId: "sting",
    name: "Sting",
    style: "momentum",
    tagline: "Chases the strongest 7-day mover and adds to winners.",
    coins: null,
  },
];

export const HIVE = {
  title: "The Hive",
  subtitle: "Three AI bees, one decision model, real OKX prices, paper money.",
  disclaimer:
    "PAPER TRADING ONLY — real prices, simulated money, nothing real moves. Not financial advice.",
};
