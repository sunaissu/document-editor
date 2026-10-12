import type { RichTextBlockType } from "./RichTextEditor";
import { Toolbar, ToolbarGroup, ToolbarIcon } from "./Toolbar";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { findDocumentMatches, getDocumentOutline, safeDocumentImage } from "./parser";
import { escapeMarkdownLabel, markdownDestination } from "./markdown";

export type DocumentPanel = "find" | "outline" | "table" | "image" | null;
export { ToolbarGroup } from "./Toolbar";
interface Props {
  value: string; readOnly: boolean; panel: DocumentPanel;
  onPanelChange: (panel: DocumentPanel) => void;
  onChange: (value: string) => void;
  onSelect: (start: number, end: number) => void;
  onInsert: (markdown: string) => void;
  children: ReactNode; toolbarStart?: ReactNode; listTools?: ReactNode; insertTools?: ReactNode; contextTools?: ReactNode; toolbarEnd?: ReactNode;
  imageUpload?: ReactNode;
  textStyle: RichTextBlockType;
  onTextStyleChange: (style: RichTextBlockType) => void;
}
const titles = { find: "Find & replace", outline: "Outline", table: "Insert table", image: "Insert image" };
const textStyles = [
  { value: "p", label: "Body text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "h5", label: "Heading 5" },
  { value: "h6", label: "Heading 6" },
] as const;

export function DocumentTools({ value, readOnly, panel, onPanelChange, onChange, onSelect, onInsert, children, toolbarStart, listTools, insertTools, contextTools, toolbarEnd, imageUpload, textStyle, onTextStyleChange }: Props) {
  const [query, setQuery] = useState(""), [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false), [wholeWord, setWholeWord] = useState(false);
  const [cursor, setCursor] = useState(0), [reviewedValue, setReviewedValue] = useState<string | null>(null);
  useEffect(() => { setReviewedValue(null); }, [value, panel, readOnly]);
  const [rows, setRows] = useState(2), [columns, setColumns] = useState(2);
  const [imageUrl, setImageUrl] = useState(""), [imageAlt, setImageAlt] = useState("");
  const panelOpener = useRef<HTMLButtonElement | null>(null), panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const visiblePanel = readOnly && (panel === "image" || panel === "table") ? null : panel;
  useEffect(() => { if (visiblePanel) (panelRef.current?.querySelector<HTMLElement>('input:not([hidden]):not([type="hidden"]), nav button') || panelRef.current?.querySelector<HTMLElement>("button"))?.focus(); }, [visiblePanel]);
  const close = () => { onPanelChange(null); if (panelOpener.current?.isConnected) panelOpener.current.focus(); };
  const matches = useMemo(() => findDocumentMatches(value, query, { matchCase, wholeWord }), [value, query, matchCase, wholeWord]);
  const outline = useMemo(() => panel === "outline" ? getDocumentOutline(value) : [], [value, panel]);
  const active = matches.length ? cursor % matches.length : 0;
  const select = (index: number) => { if (!matches.length) return; const next = (index + matches.length) % matches.length; setCursor(next); onSelect(matches[next], matches[next] + query.length); };
  const replace = (all: boolean) => {
    if (readOnly || !matches.length || (all && reviewedValue !== value)) return;
    const parts: string[] = []; let end = 0;
    for (const start of all ? matches : [matches[active]]) { parts.push(value.slice(end, start), replacement); end = start + query.length; }
    parts.push(value.slice(end)); onChange(parts.join("")); setReviewedValue(null);
  };
  const insertTable = () => {
    const header = Array.from({ length: columns }, (_, index) => "Column " + (index + 1));
    const table = [header, header.map(() => "---"), ...Array.from({ length: rows }, () => header.map(() => " "))];
    onInsert(table.map(row => "| " + row.join(" | ") + " |").join("\n")); onPanelChange(null);
  };
  const toggle = (name: Exclude<DocumentPanel, null>, label: string) => <button type="button" data-panel={name} title={label} aria-label={label} aria-expanded={visiblePanel === name} aria-controls={visiblePanel === name ? panelId : undefined} onClick={event => { panelOpener.current = event.currentTarget; onPanelChange(panel === name ? null : name); }}><ToolbarIcon name={label} /><span>{name === "find" ? "Find" : label}</span></button>;
  return <>
    <Toolbar utility={<><ToolbarGroup label="Navigate">{toggle("find", "Find & replace")}{toggle("outline", "Outline")}</ToolbarGroup>{toolbarEnd}</>} primary={!readOnly && <>{toolbarStart}<ToolbarGroup label="Text style">{textStyles.map(style => <button
      type="button" key={style.value} title={style.label} aria-label={style.label}
      aria-pressed={textStyle === style.value} onClick={() => onTextStyleChange(style.value)}
    ><ToolbarIcon name={style.label} /></button>)}</ToolbarGroup></>} secondary={<>
      {!readOnly && listTools}
      {!readOnly && <ToolbarGroup label="Insert">{insertTools}{toggle("table", "Table")}{toggle("image", "Image")}<button type="button" title="Divider" aria-label="Divider" onClick={() => onInsert("---")}><ToolbarIcon name="Divider" /><span>Divider</span></button></ToolbarGroup>}
      
      {contextTools}
    </>} />
    <div className="sunaissu-document-workspace">
      {children}
      {visiblePanel && <aside ref={panelRef} id={panelId} className="document-tool-panel" aria-label={titles[visiblePanel]} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
        <header><strong>{titles[visiblePanel]}</strong><button type="button" aria-label="Close panel" onClick={close}>×</button></header>
        <div className="document-tool-content">
          {visiblePanel === "find" && <>
            <label>Find<input value={query} onChange={event => { setQuery(event.target.value); setCursor(0); setReviewedValue(null); }} /></label>
            <div className="document-tool-options"><label><input type="checkbox" checked={matchCase} onChange={event => { setMatchCase(event.target.checked); setReviewedValue(null); }} />Match case</label><label><input type="checkbox" checked={wholeWord} onChange={event => { setWholeWord(event.target.checked); setReviewedValue(null); }} />Whole word</label></div>
            <div className="document-tool-row"><button type="button" disabled={!matches.length} onClick={() => select(active - 1)}>Previous</button><button type="button" disabled={!matches.length} onClick={() => select(active + 1)}>Next</button><output aria-live="polite">{matches.length ? active + 1 : 0} / {matches.length}</output></div>
            {!readOnly && <><hr /><label>Replace with<input value={replacement} onChange={event => { setReplacement(event.target.value); setReviewedValue(null); }} /></label><div className="document-tool-row"><button type="button" disabled={!matches.length} onClick={() => replace(false)}>Replace</button><button type="button" disabled={!matches.length} onClick={() => setReviewedValue(value)}>Review replace all</button></div>
            {reviewedValue === value && <div className="document-replace-confirm" role="status"><p>Replace {matches.length} matches with “{replacement || "(empty)"}”?</p><div className="document-tool-row"><button type="button" onClick={() => replace(true)}>Apply</button><button type="button" onClick={() => setReviewedValue(null)}>Cancel</button></div></div>}</>}
          </>}
          {visiblePanel === "outline" && <><small>{outline.length} headings</small><nav aria-label="Document outline" className="document-outline-list">{outline.length ? outline.map(heading => <button type="button" key={heading.start} style={{ paddingLeft: 10 + (heading.level - 1) * 12 }} onClick={() => onSelect(heading.start, heading.end)}><span>H{heading.level}</span>{heading.text}</button>) : <p>Add headings to navigate your document.</p>}</nav></>}
          {visiblePanel === "table" && <><p>Choose a size. You can add rows and columns later.</p><div className="document-tool-row"><label>Rows<input type="number" min={1} max={20} value={rows} onChange={event => setRows(Math.min(20, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} /></label><label>Columns<input type="number" min={1} max={10} value={columns} onChange={event => setColumns(Math.min(10, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} /></label></div><button type="button" onClick={insertTable}>Insert table</button></>}
          {visiblePanel === "image" && <>{imageUpload}<label>Image URL<input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://… or relative path" /></label><label>Image description<input value={imageAlt} onChange={event => setImageAlt(event.target.value)} /></label><button type="button" disabled={!imageUrl || safeDocumentImage(imageUrl) === "#"} onClick={() => { onInsert("![" + escapeMarkdownLabel(imageAlt) + "](" + markdownDestination(safeDocumentImage(imageUrl)) + ")"); setImageUrl(""); setImageAlt(""); onPanelChange(null); }}>Insert image</button></>}
        </div>
      </aside>}
    </div>
  </>;
}
