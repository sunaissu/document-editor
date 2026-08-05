const inlinePattern =
  /(!?\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "#";
  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmed)) return escapeHtml(trimmed);
  try {
    const protocol = new URL(trimmed).protocol.toLowerCase();
    if (!["http:", "https:", "mailto:", "tel:"].includes(protocol)) return "#";
    return escapeHtml(trimmed);
  } catch {
    return "#";
  }
}

function markdownInlineToHtml(value: string): string {
  return value
    .split(inlinePattern)
    .filter(Boolean)
    .map((part) => {
      const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (image) {
        return `<span class="rich-embedded-image" data-markdown-image="${escapeHtml(
          part,
        )}" contenteditable="false">Image: ${escapeHtml(image[1] || image[2])}</span>`;
      }

      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) return `<a href="${safeLink(link[2])}">${escapeHtml(link[1])}</a>`;

      if (part.startsWith("[[") && part.endsWith("]]")) {
        const [destination, alias] = part.slice(2, -2).split("|");
        return `<span class="rich-wikilink" data-wikilink="${escapeHtml(
          destination,
        )}">${escapeHtml(alias || destination)}</span>`;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))
      ) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("~~") && part.endsWith("~~")) {
        return `<s>${escapeHtml(part.slice(2, -2))}</s>`;
      }
      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      ) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

const startsBlock = (line: string, nextLine?: string) =>
  /^\s*(```|#{1,6}\s|>|[-*+]\s|\d+\.\s|---+$|___+$|\*\*\*+$)/.test(line) ||
  (line.includes("|") && Boolean(nextLine?.match(/^\s*\|?\s*:?-+/)));

const parseTableRow = (value: string) =>
  value
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

/** Convert portable Markdown into the small HTML subset used by RichTextEditor. */
export function markdownToEditorHtml(markdown: string): string {
  if (!markdown.trim()) return "";

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (index === 0 && line.trim() === "---") {
      const frontmatter: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "---") {
        frontmatter.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        `<pre data-raw-block="frontmatter">${escapeHtml(frontmatter.join("\n"))}</pre>`,
      );
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        `<pre data-language="${escapeHtml(language)}"><code>${escapeHtml(
          code.join("\n"),
        )}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(markdownInlineToHtml).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*+]\s+/, "");
        const task = item.match(/^\[([ xX])\]\s*(.*)$/);
        items.push(
          task
            ? `<li data-task="${task[1].toLowerCase() === "x" ? "checked" : "open"}"><span class="rich-task-box" contenteditable="false">${task[1].toLowerCase() === "x" ? "✓" : ""}</span>${markdownInlineToHtml(task[2])}</li>`
            : `<li>${markdownInlineToHtml(item)}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(
          `<li>${markdownInlineToHtml(lines[index].replace(/^\s*\d+\.\s+/, ""))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-+/.test(lines[index + 1])
    ) {
      const headers = parseTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        `<table><thead><tr>${headers
          .map((cell) => `<th>${markdownInlineToHtml(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${markdownInlineToHtml(cell)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index], lines[index + 1])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(markdownInlineToHtml).join("<br>")}</p>`);
  }

  return blocks.join("");
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";

  const children = () => Array.from(node.childNodes).map(inlineNodeToMarkdown).join("");
  const tag = node.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `_${children()}_`;
  if (tag === "s" || tag === "strike" || tag === "del") return `~~${children()}~~`;
  if (tag === "code") return node.parentElement?.tagName === "PRE" ? children() : `\`${children()}\``;
  if (tag === "a") return `[${children()}](${node.getAttribute("href") || "#"})`;
  if (node.dataset.wikilink) {
    const label = children();
    return `[[${node.dataset.wikilink}${label !== node.dataset.wikilink ? `|${label}` : ""}]]`;
  }
  if (node.dataset.markdownImage) return node.dataset.markdownImage;
  if (node.classList.contains("rich-task-box")) return "";
  return children();
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return "";
  const values = rows.map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) =>
      Array.from(cell.childNodes).map(inlineNodeToMarkdown).join("").trim(),
    ),
  );
  return [values[0], values[0].map(() => "---"), ...values.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function blockNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  const inline = () => Array.from(node.childNodes).map(inlineNodeToMarkdown).join("").trimEnd();

  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline()}`;
  if (tag === "p" || tag === "div") return inline();
  if (tag === "blockquote") return inline().split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "hr") return "---";
  if (tag === "pre") {
    if (node.dataset.rawBlock === "frontmatter") return `---\n${node.textContent || ""}\n---`;
    return `\`\`\`${node.dataset.language || ""}\n${node.textContent || ""}\n\`\`\``;
  }
  if (tag === "table") return tableToMarkdown(node);
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return Array.from(node.children)
      .filter((child) => child.tagName === "LI")
      .map((child, index) => {
        const item = child as HTMLElement;
        const content = Array.from(item.childNodes)
          .filter(
            (childNode) =>
              !(childNode instanceof HTMLElement) || !["UL", "OL"].includes(childNode.tagName),
          )
          .map(inlineNodeToMarkdown)
          .join("")
          .trim();
        const task = item.dataset.task;
        return `${ordered ? `${index + 1}.` : "-"} ${task ? `[${task === "checked" ? "x" : " "}] ` : ""}${content}`;
      })
      .join("\n");
  }
  return inline();
}

/** Convert the RichTextEditor DOM back to portable Markdown. */
export function editorElementToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map(blockNodeToMarkdown)
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface DocumentCounts {
  words: number;
  characters: number;
}

export function countDocument(value: string): DocumentCounts {
  return {
    words: value.trim() ? value.trim().split(/\s+/).length : 0,
    characters: value.length,
  };
}

export function appendMarkdownBlock(value: string, block: string): string {
  const spacer = value && !value.endsWith("\n") ? "\n\n" : "";
  return `${value}${spacer}${block}`;
}
