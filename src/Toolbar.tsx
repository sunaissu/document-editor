import { useEffect, useRef, useState, type ReactNode } from "react";

const icons: Record<string, string> = {
  "Body text": "M13 4H9a5 5 0 0 0 0 10h4M13 4v16M18 4v16M11 4h10",
  Undo: "M9 5 4 10l5 5M4 10h9a5 5 0 0 1 0 10",
  Redo: "m15 5 5 5-5 5m5-5h-9a5 5 0 0 0 0 10",
  Text: "m3 18 5-12 5 12M5 14h6m5-2c4-2 5 0 5 2v4m0-4c-7-1-6 6 0 3",
  Lists: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  Insert: "M12 5v14M5 12h14",
  Navigate: "M8 5h12M8 12h12M8 19h8M3 5h.01M3 12h.01M3 19h.01",
  View: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  Table: "M4 4h16v16H4zM4 10h16M10 4v16",
  Bold: "M6 4h7a4 4 0 0 1 0 8H6V4Zm0 8h8a4 4 0 0 1 0 8H6v-8Z",
  Italic: "M10 4h10M4 20h10M15 4 9 20",
  Strikethrough: "M18 6c-2-3-11-3-11 2 0 2 2 3 5 4m-6 5c2 4 12 4 12-1 0-2-2-3-5-4M3 12h18",
  "Inline code": "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  "Bullet list": "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  "Numbered list": "M10 6h10M10 12h10M10 18h10M3 4h2v5M3 9h4M3 15c0-3 4-3 4 0l-4 5h4",
  "Task list": "M10 6h10M10 12h10M10 18h10m-7-7 2 2 3-4M3 5h3M3 18h3",
  Quote: "M4 6h6v7H4V6Zm0 7v5l6-5M14 6h6v7h-6V6Zm0 7v5l6-5",
  "Code block": "M3 4h18v16H3V4Zm4 5 3 3-3 3m6 0h4",
  Link: "m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  Image: "M3 4h18v16H3V4Zm0 12 6-6 6 7 3-3 3 3M16 8h.01",
  Divider: "M3 12h18",
  "Find & replace": "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  Outline: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
};
const headingNumbers: Record<string, string> = {
  "1": "m15 12 2-1v8m-2 0h4",
  "2": "M15 13c0-3 5-3 5 0 0 2-5 4-5 6h5",
  "3": "M15 11h5l-3 4c4-1 4 6-2 4",
  "4": "m18 11-3 5h6m-2-5v9",
  "5": "M20 11h-5v4c7-2 7 6 0 4",
  "6": "M20 11c-7-2-7 11-1 8 4-3-2-6-4-3",
};
export function ToolbarIcon({ name }: { name: string }) {
  const heading = /^Heading ([1-6])$/.exec(name);
  if (heading) return <svg className="document-toolbar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={"M3 5v14M11 5v14M3 12h8"} /><path d={headingNumbers[heading[1]]} /></svg>;
  return <svg className="document-toolbar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg>;
}

export function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div data-toolbar-group={label} className="document-toolbar-inline" role="group" aria-label={label}>
    <span className="document-toolbar-group-label" aria-hidden="true">{label}</span>
    <div className="document-toolbar-group-controls">{children}</div>
  </div>;
}

export function Toolbar({ primary, secondary, utility }: { primary: ReactNode; secondary: ReactNode; utility?: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null), actions = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const update = () => setOverflow(Boolean(scroll.current && scroll.current.scrollWidth > scroll.current.clientWidth + 1));
    update();
    const observer = new ResizeObserver(update);
    if (scroll.current) observer.observe(scroll.current);
    if (actions.current) observer.observe(actions.current);
    return () => observer.disconnect();
  }, []);
  return <div className="sunaissu-document-toolbar sunaissu-document-tools" aria-label="Document tools">
    <div className="document-toolbar-utility">{utility}</div>
    <div ref={scroll} className="document-toolbar-scroll" aria-label="Formatting and insertion tools" tabIndex={0}>
      <div ref={actions} className="document-toolbar-actions">{primary}{secondary}</div>
    </div>
    <span hidden={!overflow} className="document-toolbar-scroll-hint" aria-hidden="true">Scroll across for more tools →</span>
  </div>;
}
