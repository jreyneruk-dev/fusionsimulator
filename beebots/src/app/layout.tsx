import type { Metadata } from "next";
import "./globals.css";
import { HIVE } from "@/content/bees";

export const metadata: Metadata = {
  title: "The Hive — three AI trading bees",
  description: HIVE.subtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-hive px-4 py-2 text-center text-sm font-semibold text-comb">
          PAPER TRADING ONLY — real prices, simulated money. {HIVE.disclaimer}
        </div>
        {children}
        <footer className="wrap pb-10 pt-8 text-center text-xs text-wax">
          Port of{" "}
          <a className="underline" href="https://github.com/imikerussell/beebots">
            imikerussell/beebots
          </a>{" "}
          (MIT) to Vercel. Decisions by Jev (TypeSafe AI) via Vercel AI Gateway. Market data: OKX public
          API. Not financial advice.
        </footer>
      </body>
    </html>
  );
}
