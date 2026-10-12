import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { filterSlashCommands, getSourceSlash, getVisualSlash, type SlashCommand } from "./slashCommands";

interface Props {
  container: RefObject<HTMLElement>; enabled: boolean; mode: string;
  onCommand: (command: SlashCommand, query: string) => void;
}
export function SlashMenu({ container, enabled, mode, onCommand }: Props) {
  const [menu, setMenu] = useState<{ query: string; left: number; top: number; height: number; input: HTMLElement } | null>(null);
  const [active, setActive] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null), id = useId();
  const commands = useMemo(() => filterSlashCommands(menu?.query || ""), [menu?.query]);
  const choose = (command: SlashCommand) => { if (menu) { onCommand(command, menu.query); setMenu(null); } };
  useEffect(() => { setMenu(null); }, [mode, enabled]);
  useEffect(() => {
    const root = container.current;
    if (!root || !enabled) return;
    const update = (event: Event) => {
      if ((event as InputEvent).isComposing) { setMenu(null); return; }
      const input = event.target as HTMLElement;
      let query: string | undefined, rect: DOMRect | undefined;
      if (input.matches(".sunaissu-markdown-source")) {
        const source = input as HTMLTextAreaElement;
        if (source.selectionStart === source.selectionEnd) query = getSourceSlash(source.value, source.selectionStart)?.query;
        const bounds = input.getBoundingClientRect();
        rect = new DOMRect(bounds.left + 20, bounds.top + 20, 0, 20);
      } else if (input.matches(".sunaissu-rich-text-editor")) {
        const trigger = getVisualSlash(input);
        query = trigger?.query;
        rect = trigger?.range.getBoundingClientRect();
      }
      if (query === undefined || !rect) { setMenu(null); return; }
      const bounds = root.getBoundingClientRect(), width = Math.min(320, bounds.width - 24);
      const height = Math.min(300, bounds.height - 24);
      const below = rect.bottom - bounds.top + 8;
      const top = below + height <= bounds.height - 12 ? below : Math.max(12, rect.top - bounds.top - height - 8);
      setMenu({ query, left: Math.max(12, Math.min(rect.left - bounds.left, bounds.width - width - 12)), top, height, input });
      setActive(0);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!menu || event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenu(null); }
      else if (event.key === "Tab") setMenu(null);
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopPropagation();
        setActive(index => commands.length ? (index + (event.key === "ArrowDown" ? 1 : commands.length - 1)) % commands.length : 0);
      } else if (event.key === "Enter" && commands[active]) {
        event.preventDefault(); event.stopPropagation(); choose(commands[active]);
      } else if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) setMenu(null);
    };
    const dismiss = (event?: Event) => { if (!event || !menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const blur = (event: FocusEvent) => { if (!menuRef.current?.contains(event.relatedTarget as Node)) dismiss(); };
    const resize = () => setMenu(null);
    window.addEventListener("resize", resize);
    root.addEventListener("input", update);
    root.addEventListener("keydown", keydown, true);
    root.addEventListener("compositionstart", dismiss);
    root.addEventListener("focusout", blur);
    root.addEventListener("pointerdown", dismiss);
    root.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", resize);
      root.removeEventListener("input", update); root.removeEventListener("keydown", keydown, true);
      root.removeEventListener("compositionstart", dismiss); root.removeEventListener("focusout", blur);
      root.removeEventListener("pointerdown", dismiss); root.removeEventListener("scroll", dismiss, true);
    };
  }, [container, enabled, menu, active, commands, onCommand]);
  useEffect(() => {
    if (!menu) return;
    menu.input.setAttribute("aria-controls", id);
    menu.input.setAttribute("aria-autocomplete", "list");
    if (commands[active]) menu.input.setAttribute("aria-activedescendant", id + "-" + commands[active].id);
    menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    return () => { menu.input.removeAttribute("aria-controls"); menu.input.removeAttribute("aria-autocomplete"); menu.input.removeAttribute("aria-activedescendant"); };
  }, [menu, active, id, commands]);
  if (!menu) return null;
  return <div ref={menuRef} className="document-slash-menu" style={{ left: menu.left, top: menu.top, maxHeight: menu.height }} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.preventDefault()}>
    <header><strong>Commands</strong><span>{menu.query ? "/" + menu.query : "Type to filter"}</span></header>
    <div role="listbox" id={id} aria-label="Slash commands" className="document-slash-results">
      {commands.map((command, index) => <button type="button" role="option" aria-selected={index === active} id={id + "-" + command.id} key={command.id} tabIndex={-1} onClick={() => choose(command)}><span className="document-command-icon" aria-hidden="true">{command.id.startsWith("h") ? command.id.toUpperCase() : command.group === "Lists" ? "≡" : command.group === "Templates" ? "▤" : "/"}</span><span><strong>{command.label}</strong><small>{command.detail}</small></span><span className="document-command-category">{command.group}</span></button>)}
      {!commands.length && <p role="status">No matching commands. Keep typing or press Escape.</p>}
    </div>
    <footer>↑ ↓ Navigate <span>Enter Select · Esc Close</span></footer>
  </div>;
}
