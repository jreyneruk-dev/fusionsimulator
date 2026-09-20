import Link from "next/link";
import { listDocs } from "@/lib/docs";

export const metadata = {
  title: "Documentation — Fusion Torus Simulator",
};

export default function DocsIndex() {
  const docs = listDocs();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-cyan-100">Documentation</h1>
      <p className="mb-8 text-sm text-slate-400">
        Everything behind the simulator: the physics equations, where their
        coefficients come from, and how the code is put together.
      </p>
      <div className="flex flex-col gap-3">
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/${d.slug}`}
            className="group rounded-lg border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-cyan-800 hover:bg-slate-900/70"
          >
            <div className="font-semibold text-cyan-200 group-hover:text-cyan-100">
              {d.title}
            </div>
            <div className="mt-1 text-sm text-slate-400">{d.description}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
