/**
 * Minimal zero-dependency markdown → HTML renderer for the /docs pages.
 * Supports the subset used by docs/*.md: headings, fenced code, tables,
 * lists (incl. task boxes), blockquotes, hr, and inline styling.
 * Escapes HTML first, so docs cannot inject markup.
 */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Inline markdown: code spans first (protecting their content), then emphasis/links. */
function inline(src: string): string {
  // protect code spans
  const codes: string[] = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:\/\/|\/|#)/.test(url) ? url : "#";
    return `<a href="${safe}"${safe.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}>${text}</a>`;
  });
  s = s.replace(/(?<!\w)(~{2})([^~]+)\1(?!\w)/g, "<del>$2</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

const HR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const H = /^( {0,3})(#{1,6})\s+(.*)$/;
const BQ = /^ {0,3}>\s?(.*)$/;
const UL = /^ {0,3}[-*]\s+(.*)$/;
const OL = /^ {0,3}\d+[.)]\s+(.*)$/;
const TABLE_SEP = /^ {0,3}\|?\s*:?-{2,}[\s:|:-]*\|?\s*$/;
const FENCE = /^ {0,3}(```|~~~)\s*(\S*)\s*$/;

function renderTable(rows: string[]): string {
  const cells = (r: string) =>
    r
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const align = rows.length > 1 ? cells(rows[1]) : [];
  const alignOf = (i: number) => {
    const a = align[i] ?? "";
    if (a.startsWith(":") && a.endsWith(":")) return "center";
    if (a.endsWith(":")) return "right";
    return "left";
  };
  const th = head.map((c, i) => `<th align="${alignOf(i)}">${inline(c)}</th>`).join("");
  const body = rows
    .slice(2)
    .map((r) => {
      const tds = cells(r).map((c, i) => `<td align="${alignOf(i)}">${inline(c)}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Render markdown source to an HTML fragment. */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker}`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      out.push(
        `<pre data-lang="${esc(lang)}"><code>${esc(body.join("\n"))}</code></pre>`
      );
      continue;
    }

    // table: header + separator
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }

    const h = line.match(H);
    if (h) {
      const lvl = h[2].length;
      out.push(`<h${lvl}>${inline(h[3].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    const bq = line.match(BQ);
    if (bq) {
      const body: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BQ);
        if (!m) break;
        body.push(m[1]);
        i++;
      }
      out.push(`<blockquote>${mdToHtml(body.join("\n"))}</blockquote>`);
      continue;
    }

    const ul = line.match(UL);
    if (ul) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(UL);
        if (!m) break;
        let item = m[1];
        // task list checkboxes
        const task = item.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          item = `<span class="task" data-done="${checked}"></span>${task[2]}`;
        }
        items.push(`<li>${inline(item)}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const ol = line.match(OL);
    if (ol) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(OL);
        if (!m) break;
        items.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph: gather until blank line or new block
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !FENCE.test(lines[i]) &&
      !H.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !BQ.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !lines[i].trim().startsWith("|")
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) out.push(`<p>${para.map((p) => inline(p)).join("<br>")}</p>`);
    else i++; // safety: never stall
  }
  return out.join("\n");
}
