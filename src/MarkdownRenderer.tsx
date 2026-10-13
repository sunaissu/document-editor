import React, { useMemo } from "react";
import { parseDocumentMarkdown } from "./parser";

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  emptyTitle?: string;
  emptyHint?: string;
  openLinksInNewTab?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = "", emptyTitle = "Nothing to preview yet.", emptyHint = "Write in Markdown and your document will appear here.", openLinksInNewTab = true }) => {
  const html = useMemo(() => parseDocumentMarkdown(content, true, true).replace(/<a /g, openLinksInNewTab ? '<a target="_blank" rel="noopener noreferrer" ' : '<a '), [content, openLinksInNewTab]);
  if (!content.trim()) return <div className={`markdown-empty sunaissu-markdown-empty ${className}`}><span>{emptyTitle}</span><small>{emptyHint}</small></div>;
  return <div className={`markdown-body sunaissu-markdown-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
};
export default MarkdownRenderer;
