import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import * as Y from 'yjs';

export const YJS_DOCUMENT_TEXT_KEY = 'document-content';

export interface YjsDocumentOptions {
  initialValue?: string;
  textKey?: string;
}

export interface YjsDocumentBinding {
  value: string;
  onChange: (value: string) => void;
}

const replaceChangedRange = (text: Y.Text, nextValue: string) => {
  const currentValue = text.toString();
  if (currentValue === nextValue) return;

  let prefixLength = 0;
  const maxPrefix = Math.min(currentValue.length, nextValue.length);
  while (
    prefixLength < maxPrefix &&
    currentValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffix = Math.min(
    currentValue.length - prefixLength,
    nextValue.length - prefixLength,
  );
  while (
    suffixLength < maxSuffix &&
    currentValue[currentValue.length - 1 - suffixLength] ===
      nextValue[nextValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const deleteLength = currentValue.length - prefixLength - suffixLength;
  const insertion = nextValue.slice(prefixLength, nextValue.length - suffixLength);
  if (deleteLength) text.delete(prefixLength, deleteLength);
  if (insertion) text.insert(prefixLength, insertion);
};

/**
 * Connects a controlled Markdown editor to a Y.Text CRDT.
 * Transport, persistence, authentication and awareness are supplied by the host.
 */
export function useYjsDocument(
  document: Y.Doc,
  options: YjsDocumentOptions = {},
): YjsDocumentBinding {
  const textKey = options.textKey ?? YJS_DOCUMENT_TEXT_KEY;
  const text = useMemo(() => document.getText(textKey), [document, textKey]);
  const localOrigin = useMemo(() => ({ source: 'document-editor' }), [document]);
  const subscribe = useCallback((notify: () => void) => {
    const observer = () => notify();
    text.observe(observer);
    return () => text.unobserve(observer);
  }, [text]);
  const getSnapshot = useCallback(() => text.toString(), [text]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (text.length === 0 && options.initialValue) {
      document.transact(() => text.insert(0, options.initialValue as string), localOrigin);
    }
  }, [document, localOrigin, options.initialValue, text]);

  const onChange = useCallback((nextValue: string) => {
    document.transact(() => replaceChangedRange(text, nextValue), localOrigin);
  }, [document, localOrigin, text]);

  return { value, onChange };
}
