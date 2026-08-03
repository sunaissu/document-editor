import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { editorElementToMarkdown, markdownToEditorHtml } from "./markdown";

export interface RichTextEditorHandle {
  applyCommand: (command: string, value?: string) => void;
  focus: () => void;
  getSelectedText: () => string;
  insertLink: (text: string, address: string) => void;
  insertText: (value: string) => void;
}

export type RichTextBlockType = "p" | "h1" | "h2" | "h3";

export interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onBlockTypeChange?: (blockType: RichTextBlockType) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

interface SelectionOffsets {
  start: number;
  end: number;
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
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length };
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
  return range;
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      content,
      onChange,
      onBlockTypeChange,
      placeholder = "Start writing…",
      readOnly = false,
      className = "",
    },
    forwardedRef,
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedSelection = useRef<Range | null>(null);
    const lastEmittedContent = useRef(content);
    const initialHtml = useRef(markdownToEditorHtml(content));

    const emitChange = useCallback(() => {
      if (!editorRef.current) return;
      const nextContent = editorElementToMarkdown(editorRef.current);
      lastEmittedContent.current = nextContent;
      onChange(nextContent);
    }, [onChange]);

    const rememberSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;

      savedSelection.current = range.cloneRange();
      const selectionElement =
        range.commonAncestorContainer instanceof HTMLElement
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      const blockType = selectionElement?.closest("h1, h2, h3, p")?.tagName.toLowerCase();
      onBlockTypeChange?.(
        blockType === "h1" || blockType === "h2" || blockType === "h3" ? blockType : "p",
      );
    }, [onBlockTypeChange]);

    const restoreSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection) return;

      editor.focus();
      selection.removeAllRanges();
      if (
        savedSelection.current &&
        editor.contains(savedSelection.current.commonAncestorContainer)
      ) {
        selection.addRange(savedSelection.current);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || content === lastEmittedContent.current) return;
      const selectionOffsets = getSelectionOffsets(editor);
      editor.innerHTML = markdownToEditorHtml(content);
      lastEmittedContent.current = content;
      if (selectionOffsets && document.activeElement === editor) {
        savedSelection.current = restoreSelectionOffsets(editor, selectionOffsets).cloneRange();
      }
    }, [content]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        applyCommand(command: string, value?: string) {
          if (readOnly) return;
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
          if (readOnly || /^(javascript|data|vbscript):/i.test(address.trim())) return;
          restoreSelection();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          const anchor = document.createElement("a");
          anchor.setAttribute("href", address);
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
        insertText(value: string) {
          if (readOnly) return;
          restoreSelection();
          document.execCommand("insertText", false, value);
          rememberSelection();
          emitChange();
        },
      }),
      [emitChange, readOnly, rememberSelection, restoreSelection],
    );

    return (
      <div
        ref={editorRef}
        className={`rich-text-editor sunaissu-rich-text-editor ${className}`.trim()}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: initialHtml.current }}
        onInput={emitChange}
        onBlur={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (!target.classList.contains("rich-task-box") || readOnly) return;
          const item = target.closest<HTMLElement>("li[data-task]");
          if (!item) return;
          const checked = item.dataset.task === "checked";
          item.dataset.task = checked ? "open" : "checked";
          target.textContent = checked ? "" : "✓";
          emitChange();
        }}
        onPaste={(event) => {
          if (readOnly) return;
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          event.preventDefault();
          document.execCommand("insertText", false, "  ");
          emitChange();
        }}
        role="textbox"
        aria-label="Visual document editor"
        aria-multiline="true"
        spellCheck
      />
    );
  },
);

RichTextEditor.displayName = "RichTextEditor";

export default RichTextEditor;
