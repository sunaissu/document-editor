import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RichTextSelection } from "./selectionFormatting";

export function SelectionToolbar({ container, selection, onCommand, onCode, onLink }: {
  container: RefObject<HTMLElement>; selection: RichTextSelection | null;
  onCommand: (command: string) => void; onCode: () => void; onLink: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [dismissed, setDismissed] = useState(false);
  const selectionKey = selection && JSON.stringify([selection.selected, selection.rect, selection.formats]);
  useEffect(() => setDismissed(false), [selectionKey]);
  const visible = selection?.selected && !dismissed;
  useLayoutEffect(() => {
    if (!visible || !ref.current || !container.current) return;
    const root = container.current, bounds = root.getBoundingClientRect();
    const pane = root.querySelector(".sunaissu-document-write-pane")!.getBoundingClientRect();
    const toolbar = ref.current.getBoundingClientRect(), rect = selection.rect;
    const left = Math.max(8, Math.min((rect.left + rect.right - toolbar.width) / 2 - bounds.left, bounds.width - toolbar.width - 8));
    const minimum = Math.max(pane.top, 0) + 6;
    const above = rect.top - toolbar.height - 8;
    const top = Math.max(minimum, Math.min(above >= minimum ? above : rect.bottom + 8, Math.min(pane.bottom, window.innerHeight) - toolbar.height - 6)) - bounds.top;
    setPosition({ left, top });
  }, [visible, selection, container]);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const hide = () => setDismissed(true);
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current) {
        event.preventDefault();
        if (ref.current.contains(document.activeElement)) root.querySelector<HTMLElement>("[contenteditable=true]")?.focus();
        setDismissed(true);
      }
      if (event.altKey && event.key === "F10" && selection?.selected) {
        event.preventDefault(); setDismissed(false);
        requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>("button")?.focus());
      }
    };
    root.addEventListener("keydown", shortcut);
    root.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { root.removeEventListener("keydown", shortcut); root.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [container, selection]);
  if (!visible) return null;
  const actions = [
    { label: "Bold", glyph: <strong>B</strong>, state: selection.formats.bold, run: () => onCommand("bold") },
    { label: "Italic", glyph: <em>I</em>, state: selection.formats.italic, run: () => onCommand("italic") },
    { label: "Strikethrough", glyph: <s>S</s>, state: selection.formats.strike, run: () => onCommand("strikeThrough") },
    { label: "Inline code", glyph: <span className="document-code-icon">&lt;/&gt;</span>, state: selection.formats.code, run: onCode },
    { label: "Link", glyph: <span>Link</span>, state: undefined, run: onLink },
  ];
  return <div ref={ref} className="document-selection-toolbar" style={position} role="toolbar" aria-label="Selection formatting" onMouseDown={event => event.preventDefault()} onKeyDown={event => {
    const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  }}>
    {actions.map((action, index) => <button key={action.label} type="button" tabIndex={index === 0 ? 0 : -1} aria-label={action.label} aria-pressed={action.state} title={action.label + (action.state === "mixed" ? " — mixed selection" : "")} onClick={action.run}>{action.glyph}</button>)}
  </div>;
}
