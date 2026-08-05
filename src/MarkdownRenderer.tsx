import React from "react";

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  emptyTitle?: string;
  emptyHint?: string;
  openLinksInNewTab?: boolean;
}

const inlinePattern =
  /(!?\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|#[\p{L}\p{N}_/-]+)/gu;

function safeHref(value: string, image = false): string {
  const trimmed = value.trim();
  if (!trimmed) return "#";
  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
  if (image && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const protocol = new URL(trimmed).protocol.toLowerCase();
    const allowed = image
      ? new Set(["http:", "https:"])
      : new Set(["http:", "https:", "mailto:", "tel:"]);
    return allowed.has(protocol) ? trimmed : "#";
  } catch {
    return "#";
  }
}

function renderInline(
  text: string,
  keyPrefix: string,
  openLinksInNewTab: boolean,
): React.ReactNode[] {
  return text
    .split(inlinePattern)
    .filter(Boolean)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (image) {
        return (
          <img
            key={key}
            className="markdown-image"
            src={safeHref(image[2], true)}
            alt={image[1]}
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        );
      }

      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return (
          <a
            key={key}
            href={safeHref(link[2])}
            target={openLinksInNewTab ? "_blank" : undefined}
            rel={openLinksInNewTab ? "noopener noreferrer" : undefined}
          >
            {link[1]}
          </a>
        );
      }

      if (part.startsWith("[[") && part.endsWith("]]")) {
        const [destination, alias] = part.slice(2, -2).split("|");
        return (
          <span key={key} className="wikilink" title={`Wiki link: ${destination}`}>
            {alias || destination}
          </span>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))
      ) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("~~") && part.endsWith("~~")) {
        return <del key={key}>{part.slice(2, -2)}</del>;
      }
      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      ) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("#") && part.length > 1) {
        return <span key={key} className="markdown-tag">{part}</span>;
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

const isBlockStart = (line: string, nextLine?: string) =>
  /^\s*(```|#{1,6}\s|>|[-*+]\s|\d+\.\s|---+$|___+$|\*\*\*+$)/.test(line) ||
  (line.includes("|") && Boolean(nextLine?.match(/^\s*\|?\s*:?-+/)));

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  emptyTitle = "Nothing to preview yet.",
  emptyHint = "Write in Markdown and your document will appear here.",
  openLinksInNewTab = true,
}) => {
  if (!content.trim()) {
    return (
      <div className={`markdown-empty sunaissu-markdown-empty ${className}`.trim()}>
        <span>{emptyTitle}</span>
        <small>{emptyHint}</small>
      </div>
    );
  }

  const inline = (value: string, key: string) =>
    renderInline(value, key, openLinksInNewTab);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (index === 0 && line.trim() === "---") {
      const values: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "---") {
        values.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <div className="markdown-code-block markdown-frontmatter" key={`frontmatter-${index}`}>
          <span className="markdown-code-language">Frontmatter</span>
          <pre><code>{values.join("\n")}</code></pre>
        </div>,
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
        <div className="markdown-code-block" key={`code-${index}`}>
          {language && <span className="markdown-code-language">{language}</span>}
          <pre><code>{code.join("\n")}</code></pre>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const headingTag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        React.createElement(
          headingTag,
          { key: `heading-${index}` },
          inline(heading[2], `heading-${index}`),
        ),
      );
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {quote.map((value, quoteIndex) => (
            <React.Fragment key={quoteIndex}>
              {inline(value, `quote-${index}-${quoteIndex}`)}
              {quoteIndex < quote.length - 1 && <br />}
            </React.Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])\]\s*(.*)$/);
            return (
              <li key={itemIndex} className={task ? "markdown-task" : undefined}>
                {task && <input type="checkbox" checked={task[1].toLowerCase() === "x"} readOnly />}
                {inline(task ? task[2] : item, `ul-${index}-${itemIndex}`)}
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-+/.test(lines[index + 1])
    ) {
      const parseRow = (value: string) =>
        value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = parseRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((header, cellIndex) => <th key={cellIndex}>{inline(header, `th-${index}-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell, `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index], lines[index + 1])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {paragraph.map((paragraphLine, paragraphIndex) => (
          <React.Fragment key={paragraphIndex}>
            {inline(paragraphLine, `paragraph-${index}-${paragraphIndex}`)}
            {paragraphIndex < paragraph.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return (
    <article className={`markdown-body sunaissu-markdown-body ${className}`.trim()}>
      {blocks}
    </article>
  );
};

export default MarkdownRenderer;
