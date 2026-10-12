export { parseDocumentMarkdown as markdownToEditorHtml } from "./parser";

/** Escape literal labels without turning their punctuation into Markdown. */
export function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>~!])/g, "\\$1");
}

/** Angle-delimited destinations also support unbalanced parentheses. */
export function markdownDestination(value: string): string {
  return "<" + value.replace(/[<>\\\s]/g, character => encodeURIComponent(character)) + ">";
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.previousSibling instanceof HTMLElement && node.previousSibling.tagName === "BR" ? (node.textContent || "").replace(/^\n/, "") : node.textContent || "";
    return text.replace(/([\\`*_[\]<>~#+=!-])/g, "\\$1").replace(/^(\s*\d+)\./gm, "$1\\.");
  }
  if (!(node instanceof HTMLElement)) return "";

  const children = () => Array.from(node.childNodes).map(inlineNodeToMarkdown).join("");
  const tag = node.tagName.toLowerCase();

  if (tag === "br") return "  \n";
  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `_${children()}_`;
  if (tag === "s" || tag === "strike" || tag === "del") return `~~${children()}~~`;
  if (tag === "code") {
    const text = node.textContent || "";
    const fence = "`".repeat((text.match(/`+/g) || []).reduce((longest, match) => Math.max(longest, match.length + 1), 1));
    const pad = /^[ `]|[ `]$/.test(text) ? " " : "";
    return fence + pad + text + pad + fence;
  }
  const title = node.getAttribute("title");
  const titleSuffix = title ? ' "' + title.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ") + '"' : "";
  if (tag === "img") return '![' + escapeMarkdownLabel(node.getAttribute("alt") || "") + '](' + markdownDestination(node.getAttribute("src") || "") + titleSuffix + ')';
  if (tag === "a") return `[${children()}](${markdownDestination(node.getAttribute("href") || "#")}${titleSuffix})`;
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
      Array.from(cell.childNodes).map(inlineNodeToMarkdown).join("").trim().replace(/\|/g, "\\|"),
    ),
  );
  const alignment = Array.from(rows[0].children).map(cell => {
    const align = (cell as HTMLElement).style.textAlign;
    return align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---";
  });
  return [values[0], alignment, ...values.slice(1)]
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
  if (tag === "blockquote") return Array.from(node.childNodes).map(blockNodeToMarkdown).filter(value => value.trim()).join("\n\n").split("\n").map(line => line ? `> ${line}` : ">").join("\n");
  if (tag === "hr") return "---";
  if (tag === "pre") {
    if (node.dataset.rawBlock === "frontmatter") return `---\n${node.textContent || ""}\n---`;
    const text = (node.textContent || "").replace(/\n$/, "");
    const fence = "`".repeat((text.match(/`+/g) || []).reduce((longest, match) => Math.max(longest, match.length + 1), 3));
    return `${fence}${node.dataset.language || ""}\n${text}\n${fence}`;
  }
  if (tag === "table") return tableToMarkdown(node);
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return Array.from(node.children)
      .filter((child) => child.tagName === "LI")
      .map((child, index) => {
        const item = child as HTMLElement;
        let content = "", buffer = "";
        const flush = () => { if (buffer.trim()) content += (content ? "\n\n" : "") + buffer.trim(); buffer = ""; };
        for (const child of Array.from(item.childNodes)) {
          if (child instanceof HTMLElement && /^(P|DIV|PRE|BLOCKQUOTE|UL|OL|TABLE|HR)$/.test(child.tagName)) {
            flush();
            content += (content ? (/^(UL|OL)$/.test(child.tagName) ? "\n" : "\n\n") : "") + blockNodeToMarkdown(child);
          } else buffer += inlineNodeToMarkdown(child);
        }
        flush();
        const marker = ordered ? `${Number(node.getAttribute("start") || 1) + index}. ` : "- ";
        const task = item.dataset.task;
        return marker + (task ? `[${task === "checked" ? "x" : " "}] ` : "") + content.replace(/\n/g, "\n" + " ".repeat(marker.length));
      })
      .join(Array.from(node.children).some(item => Array.from(item.children).some(child => child.tagName === "P")) ? "\n\n" : "\n");
  }
  return inline();
}

/** Convert the RichTextEditor DOM back to portable Markdown. */
export function editorElementToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map(blockNodeToMarkdown)
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
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
  const spacer = value ? (value.endsWith("\n\n") ? "" : value.endsWith("\n") ? "\n" : "\n\n") : "";
  return `${value}${spacer}${block}`;
}
