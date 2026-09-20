import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fusion Torus Simulator",
  description:
    "Interactive tokamak plasma physics playground — 0-D power balance, Bosch-Hale reactivity, IPB98(y,2) confinement, stability limits, 3D torus.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-cyan-900/50 bg-[#070b14]/90 backdrop-blur sticky top-0 z-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg">🧲</span>
              <span className="font-semibold tracking-tight text-cyan-100">
                Fusion Torus Simulator
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-400">
              <Link href="/" className="hover:text-cyan-300 transition-colors">
                Simulator
              </Link>
              <Link href="/docs" className="hover:text-cyan-300 transition-colors">
                Docs
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline hover:text-cyan-300 transition-colors"
              >
                Research
              </a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
