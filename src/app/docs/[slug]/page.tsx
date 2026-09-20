import Link from "next/link";
import { notFound } from "next/navigation";
import { listDocs, getDoc } from "@/lib/docs";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listDocs().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const doc = getDoc(slug);
  return { title: doc ? `${doc.meta.title} — Docs` : "Docs" };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const others = listDocs();
  const idx = others.findIndex((d) => d.slug === slug);
  const prev = idx > 0 ? others[idx - 1] : null;
  const next = idx >= 0 && idx < others.length - 1 ? others[idx + 1] : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/docs"
        className="mb-6 inline-block text-xs text-slate-500 transition-colors hover:text-cyan-300"
      >
        ← All documentation
      </Link>
      <article
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
      <nav className="mt-10 flex justify-between border-t border-slate-800 pt-4 text-sm">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="text-cyan-300 hover:text-cyan-100">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/docs/${next.slug}`} className="text-cyan-300 hover:text-cyan-100">
            {next.title} →
          </Link>
        )}
      </nav>
    </main>
  );
}
