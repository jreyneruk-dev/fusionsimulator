import fs from "node:fs";
import path from "node:path";
import { mdToHtml } from "@/lib/markdown";

/**
 * Docs loading for the /docs routes. Files are read at build time
 * (static generation); nothing touches the filesystem at request time.
 */

const DOCS_DIR = path.join(process.cwd(), "docs");

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
}

/** Front-matter-free: title from the first `# ` heading, description from the first paragraph. */
function metaFromSource(slug: string, src: string): DocMeta {
  const lines = src.split("\n");
  let title = slug;
  let description = "";
  for (const line of lines) {
    const h = line.match(/^#\s+(.+)$/);
    if (h && title === slug) {
      title = h[1].trim();
      continue;
    }
    if (title !== slug && line.trim() !== "" && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("```")) {
      description = line.replace(/[*_`>]/g, "").trim().slice(0, 160);
      break;
    }
  }
  return { slug, title, description };
}

export function listDocs(): DocMeta[] {
  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((f) => {
    const slug = f.replace(/\.md$/, "");
    return metaFromSource(slug, fs.readFileSync(path.join(DOCS_DIR, f), "utf8"));
  });
}

export function getDoc(slug: string): { meta: DocMeta; html: string } | null {
  // refuse path traversal
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  return { meta: metaFromSource(slug, src), html: mdToHtml(src) };
}
