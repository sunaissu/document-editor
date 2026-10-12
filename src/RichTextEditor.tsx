import { getSelectionFormats, type RichTextSelection } from "./selectionFormatting";
import { getVisualSlash } from "./slashCommands";
import { editTable, type TableAction } from "./table";
import type { DocumentHistory } from "./history";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { moveTextPosition } from "./textEdit";
import { safeDocumentLink } from "./parser";
import { editorElementToMarkdown, markdownToEditorHtml } from "./markdown";

export interface RichTextEditorHandle {
  applyCommand: (command: string, value?: string) => void;
  focus: () => void;
  getSelectedText: () => string;
  insertLink: (text: string, address: string) => void;
  insertText: (value: string) => void;
  insertBlock: (markdown: string) => void;
  /** Capture a block insertion point for an async host operation. False means it is stale. */
  captureBlockInsertion: () => (markdown: string) => boolean;
  replaceSlashCommand: (query: string, markdown: string) => boolean;
  insertInlineCode: () => void;
  editTable: (action: TableAction) => void;
}

export type RichTextBlockType = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface RichTextEditorProps {
  history?: DocumentHistory;
  content: string;
  onChange: (content: string, previous?: string) => void;
  onSelectionChange?: (selection: RichTextSelection | null) => void;
  onTableChange?: (active: boolean) => void;
  onFormatChange?: (formats: { bold: boolean; italic: boolean; strike: boolean }) => void;
  onBlockTypeChange?: (blockType: RichTextBlockType) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

interface SelectionOffsets {
  start: number;
  end: number;
  backward: boolean;
}

const getSelectionOffsets = (root: HTMLElement): SelectionOffsets | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(root);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(root);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length, backward: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset && !selection.isCollapsed };
};

const restoreSelectionOffsets = (root: HTMLElement, offsets: SelectionOffsets) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let consumed = 0;
  let startSet = false;
  let endSet = false;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!startSet && offsets.start <= consumed + length) {
      range.setStart(node, Math.max(0, offsets.start - consumed));
      startSet = true;
    }
    if (!endSet && offsets.end <= consumed + length) {
      range.setEnd(node, Math.max(0, offsets.end - consumed));
      endSet = true;
      break;
    }
    consumed += length;
    node = walker.nextNode();
  }

  if (!startSet || !endSet) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (offsets.backward) selection?.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  return range;
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      history,
      content,
      onChange,
      onBlockTypeChange, onTableChange, onFormatChange, onSelectionChange,
      placeholder = "Start writing…",
      readOnly = false,
      className = "",
    },
    forwardedRef,
  ) => {
    const [composing, setComposing] = useState(false);
    const editorRef = useRef<HTMLDivElement>(null);
    const savedSelection = useRef<Range | null>(null);
    const lastEmittedContent = useRef(content);
    const [initialMarkup] = useState(() => ({ __html: markdownToEditorHtml(content) }));

    const emitChange = useCallback(() => {
      if (!editorRef.current || readOnly || composing) return;
      const nextContent = editorElementToMarkdown(editorRef.current);
      const previous = lastEmittedContent.current;
      lastEmittedContent.current = nextContent;
      onChange(nextContent, previous);
    }, [onChange, readOnly, composing]);

    const rememberSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) { onSelectionChange?.(null); return; }
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) { onSelectionChange?.(null); return; }

      savedSelection.current = range.cloneRange();
      if (onSelectionChange) {
        const rect = range.getBoundingClientRect();
        const active = document.activeElement;
        onSelectionChange({ selected: !composing && !range.collapsed && Boolean(active === editor || active?.closest(".document-selection-toolbar")), formats: getSelectionFormats(editor, range), rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } });
      }
      const selectionElement =
        range.commonAncestorContainer instanceof HTMLElement
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      onTableChange?.(Boolean(selectionElement?.closest("td, th")));
      onFormatChange?.({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), strike: document.queryCommandState("strikeThrough") });
      const blockType = selectionElement?.closest("h1, h2, h3, h4, h5, h6, p")?.tagName.toLowerCase();
      onBlockTypeChange?.(
        blockType && /^h[1-6]$/.test(blockType) ? blockType as RichTextBlockType : "p",
      );
    }, [composing, onBlockTypeChange, onTableChange, onFormatChange, onSelectionChange]);

    useEffect(() => {
      let frame = 0;
      const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(rememberSelection); };
      update();
      document.addEventListener("selectionchange", update);
      document.addEventListener("focusin", update);
      return () => { cancelAnimationFrame(frame); document.removeEventListener("selectionchange", update); document.removeEventListener("focusin", update); };
    }, [rememberSelection]);

    const restoreSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection) return;

      const saved = savedSelection.current?.cloneRange();
      editor.focus();
      selection.removeAllRanges();
      if (
        saved &&
        editor.contains(saved.commonAncestorContainer)
      ) {
        selection.addRange(saved);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || composing || content === lastEmittedContent.current) return;
      const selectionOffsets = getSelectionOffsets(editor);
      const before = editor.textContent || "";
      editor.innerHTML = markdownToEditorHtml(content);
      if (selectionOffsets) {
        const after = editor.textContent || "";
        selectionOffsets.start = moveTextPosition(selectionOffsets.start, before, after);
        selectionOffsets.end = moveTextPosition(selectionOffsets.end, before, after);
      }
      lastEmittedContent.current = content;
      if (selectionOffsets && document.activeElement === editor) {
        savedSelection.current = restoreSelectionOffsets(editor, selectionOffsets).cloneRange();
      }
    }, [content, composing]);

    const insertBlock = useCallback((markdown: string): boolean => {
          if (readOnly || composing || !editorRef.current) return false;
          restoreSelection();
          const editor = editorRef.current, range = window.getSelection()?.getRangeAt(0);
          let anchor: Node | null = range?.endContainer || null;
          while (anchor && anchor.parentNode !== editor && anchor !== editor) anchor = anchor.parentNode;
          const template = document.createElement("template");
          template.innerHTML = markdownToEditorHtml(markdown);
          const first = template.content.firstElementChild as HTMLElement | null;
          editor.insertBefore(template.content, anchor && anchor !== editor ? anchor.nextSibling : null);
          if (first) {
            const target = first.querySelector("td, th") || first;
            const selection = document.createRange(); selection.selectNodeContents(target); selection.collapse(true);
            window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(selection);
          }
          rememberSelection(); emitChange(); return true;

    }, [readOnly, composing, restoreSelection, rememberSelection, emitChange]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        applyCommand(command: string, value?: string) {
          if (readOnly || composing || !["bold", "italic", "strikeThrough", "insertOrderedList", "insertUnorderedList", "formatBlock", "removeFormat", "undo", "redo"].includes(command)) return;
          if (command === "formatBlock" && !/^(p|h[1-6]|pre|blockquote)$/.test(value || "")) return;
          restoreSelection();
          document.execCommand(command, false, value);
          rememberSelection();
          emitChange();
        },
        focus() {
          editorRef.current?.focus();
        },
        getSelectedText() {
          return savedSelection.current?.toString() || "";
        },
        insertLink(text: string, address: string) {
          if (readOnly || composing || safeDocumentLink(address) === "#") return;
          restoreSelection();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          const anchor = document.createElement("a");
          anchor.setAttribute("href", safeDocumentLink(address));
          anchor.textContent = text.trim() || range.toString() || address;
          range.deleteContents();
          range.insertNode(anchor);
          range.setStartAfter(anchor);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          savedSelection.current = range.cloneRange();
          emitChange();
        },
        insertInlineCode() {
          if (readOnly || composing) return;
          restoreSelection();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          const start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer as HTMLElement;
          const end = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer as HTMLElement;
          const existing = start?.closest("code");
          if (!range.collapsed && existing && existing === end?.closest("code") && !existing.closest("pre")) {
            const before = range.cloneRange(); before.selectNodeContents(existing); before.setEnd(range.startContainer, range.startOffset);
            const after = range.cloneRange(); after.selectNodeContents(existing); after.setStart(range.endContainer, range.endOffset);
            const fragment = document.createDocumentFragment(), text = document.createTextNode(range.toString());
            if (before.toString()) { const code = document.createElement("code"); code.textContent = before.toString(); fragment.appendChild(code); }
            fragment.appendChild(text);
            if (after.toString()) { const code = document.createElement("code"); code.textContent = after.toString(); fragment.appendChild(code); }
            existing.replaceWith(fragment); range.selectNodeContents(text); selection.removeAllRanges(); selection.addRange(range);
            rememberSelection(); emitChange(); return;
          }
          const code = document.createElement("code");
          code.textContent = range.toString() || "code";
          range.deleteContents(); range.insertNode(code); range.selectNodeContents(code);
          selection.removeAllRanges(); selection.addRange(range);
          rememberSelection(); emitChange();
        },
        replaceSlashCommand(query: string, markdown: string) {
          const editor = editorRef.current;
          if (!editor || readOnly || composing) return false;
          const trigger = getVisualSlash(editor);
          if (!trigger || trigger.query !== query) return false;
          const template = document.createElement("template");
          template.innerHTML = markdownToEditorHtml(markdown) || "<p><br></p>";
          if (template.content.lastElementChild?.tagName === "HR") template.content.appendChild(document.createElement("p")).appendChild(document.createElement("br"));
          const first = template.content.firstElementChild as HTMLElement;
          const target = first.tagName === "HR" ? template.content.lastElementChild! : first.querySelector("th, td, li, p, code") || first;
          if (trigger.block === editor) editor.replaceChildren(template.content);
          else trigger.block.replaceWith(template.content);
          const range = document.createRange(); range.selectNodeContents(target);
          const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
          rememberSelection(); emitChange(); return true;
        },
        insertBlock,
        captureBlockInsertion() {
          const editor = editorRef.current, range = savedSelection.current?.cloneRange(), html = editor?.innerHTML;
          return (markdown: string) => {
            if (!editor || editorRef.current !== editor || editor.innerHTML !== html) return false;
            savedSelection.current = range || null;
            return insertBlock(markdown);
          };
        },
        editTable(action: TableAction) {
          if (readOnly || composing) return;
          restoreSelection();
          const node = window.getSelection()?.anchorNode;
          const cell = (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLTableCellElement>("td, th");
          if (!cell || !editorRef.current?.contains(cell)) return;
          const target = editTable(cell, action);
          if (target) { const range = document.createRange(); range.selectNodeContents(target); range.collapse(true); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
          rememberSelection(); emitChange();
        },
        insertText(value: string) {
          if (readOnly || composing) return;
          restoreSelection();
          document.execCommand("insertText", false, value);
          rememberSelection();
          emitChange();
        },
      }),
      [emitChange, readOnly, composing, rememberSelection, restoreSelection, insertBlock],
    );

    return (
      <div
        ref={editorRef}
        className={`rich-text-editor sunaissu-rich-text-editor ${className}`.trim()}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={initialMarkup}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => {
          setComposing(false);
          if (editorRef.current && !readOnly) {
            const next = editorElementToMarkdown(editorRef.current);
            const previous = lastEmittedContent.current;
            lastEmittedContent.current = next;
            onChange(next, previous);
          }
        }}
        onInput={emitChange}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (!target.classList.contains("rich-task-box") || readOnly || composing) return;
          const item = target.closest<HTMLElement>("li[data-task]");
          if (!item) return;
          const checked = item.dataset.task === "checked";
          item.dataset.task = checked ? "open" : "checked";
          target.textContent = checked ? "" : "✓";
          target.setAttribute("aria-checked", String(!checked));
          emitChange();
        }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          if (readOnly || composing) return;
          restoreSelection();
          document.execCommand("insertText", false, event.dataTransfer.getData("text/plain"));
          emitChange();
        }}
        onPaste={(event) => {
          event.preventDefault();
          if (readOnly || composing) return;
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        onKeyDown={(event) => {
          if (readOnly || event.nativeEvent.isComposing) return;
          if (history && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); return; }
          if ((event.key === " " || event.key === "Enter") && (event.target as HTMLElement).classList.contains("rich-task-box")) { event.preventDefault(); (event.target as HTMLElement).click(); }
        }}
        role="textbox"
        aria-label="Visual document editor"
        aria-multiline="true"
        aria-readonly={readOnly}
        spellCheck
      />
    );
  },
);

RichTextEditor.displayName = "RichTextEditor";

export default RichTextEditor;
