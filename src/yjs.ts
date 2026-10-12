import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { DocumentHistory } from './history';
import { applyTextEdit, trackText } from './yjsText';

export const YJS_DOCUMENT_TEXT_KEY = 'document-content';

export interface YjsDocumentOptions {
  initialValue?: string;
  textKey?: string;
}

export interface YjsDocumentBinding {
  value: string;
  onChange: (value: string, previous?: string) => void;
  text: Y.Text;
  localOrigin: object;
  history: DocumentHistory;
}

/**
 * Connects a controlled Markdown editor to a Y.Text CRDT.
 * Transport, persistence, authentication and awareness are supplied by the host.
 */
export function useYjsDocument(
  document: Y.Doc,
  options: YjsDocumentOptions = {},
): YjsDocumentBinding {
  const textKey = options.textKey ?? YJS_DOCUMENT_TEXT_KEY;
  const text = useMemo(() => { const value = document.getText(textKey); trackText(value); return value; }, [document, textKey]);
  const localOrigin = useMemo(() => ({ source: 'document-editor' }), [document]);
  const subscribe = useCallback((notify: () => void) => {
    const observer = () => notify();
    text.observe(observer);
    return () => text.unobserve(observer);
  }, [text]);
  const getSnapshot = useCallback(() => text.toString(), [text]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const initialized = useRef(new WeakSet<Y.Text>());
  const base = useRef(value);
  base.current = value;
  useEffect(() => {
    if (initialized.current.has(text)) return;
    initialized.current.add(text);
    if (text.length === 0 && options.initialValue) {
      document.transact(() => text.insert(0, options.initialValue as string), localOrigin);
    }
  }, [document, localOrigin, options.initialValue, text]);

  const onChange = useCallback((nextValue: string, previous = base.current) => {
    document.transact(() => applyTextEdit(text, previous, nextValue), localOrigin);
    base.current = nextValue;
  }, [document, localOrigin, text]);

  const managerRef = useRef<Y.UndoManager | null>(null);
  useEffect(() => {
    const manager = new Y.UndoManager(text, { trackedOrigins: new Set([localOrigin]) });
    managerRef.current = manager;
    return () => { managerRef.current = null; manager.destroy(); };
  }, [text, localOrigin]);
  const history = useMemo<DocumentHistory>(() => ({
    undo: () => { managerRef.current?.undo(); },
    redo: () => { managerRef.current?.redo(); },
    canUndo: () => Boolean(managerRef.current?.undoStack.length),
    canRedo: () => Boolean(managerRef.current?.redoStack.length),
  }), []);
  return { value, onChange, text, localOrigin, history };
}
