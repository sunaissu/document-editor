import { useEffect, useRef, useState } from "react";
import type { DocumentHistory } from "./history";

export function useEditorHistory(value: string, notify: (next: string, previous?: string) => void, external?: DocumentHistory) {
  const past = useRef<string[]>([]), future = useRef<string[]>([]), current = useRef(value);
  const [, refresh] = useState(0);
  useEffect(() => {
    if (value !== current.current) { past.current = []; future.current = []; current.current = value; if (!external) refresh(version => version + 1); }
  }, [value, external]);
  const push = (stack: string[], text: string) => {
    stack.push(text);
    let size = stack.reduce((sum, item) => sum + item.length, 0);
    while (stack.length > 100 || (stack.length && size > 2_000_000)) size -= stack.shift()!.length;
  };
  const change = (next: string, previous?: string) => {
    if (!external && next !== current.current) { push(past.current, current.current); future.current = []; }
    current.current = next;
    notify(next, previous);
    refresh(version => version + 1);
  };
  const travel = (from: string[], to: string[]) => {
    if (!from.length) return;
    const previous = current.current;
    push(to, previous); current.current = from.pop()!;
    notify(current.current, previous); refresh(version => version + 1);
  };
  return {
    onChange: external ? notify : change,
    history: external || { undo: () => travel(past.current, future.current), redo: () => travel(future.current, past.current), canUndo: () => past.current.length > 0, canRedo: () => future.current.length > 0 },
  };
}
