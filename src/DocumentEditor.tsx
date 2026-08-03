import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import RichTextEditor, {
  type RichTextBlockType,
  type RichTextEditorHandle,
} from "./RichTextEditor";
import { appendMarkdownBlock, countDocument } from "./markdown";
import {
  DOCUMENT_EDITOR_DARK_THEME,
  DOCUMENT_EDITOR_LIGHT_THEME,
  applyDocumentEditorBrandColors,
  getDocumentEditorThemeStyle,
  useDocumentEditorResolvedTheme,
  type DocumentEditorTheme,
  type DocumentEditorBrandColors,
  type DocumentEditorThemeMode,
} from "./theme";

export type DocumentEditorMode = "visual" | "markdown" | "preview" | "split";

export interface DocumentEditorToolbarContext {
  mode: DocumentEditorMode;
  setMode: (mode: DocumentEditorMode) => void;
  readOnly: boolean;
}

export interface DocumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  mode?: DocumentEditorMode;
  defaultMode?: DocumentEditorMode;
  onModeChange?: (mode: DocumentEditorMode) => void;
  placeholder?: string;
  className?: string;
  showStatusBar?: boolean;
  showSplitMode?: boolean;
  renderToolbarEnd?: (context: DocumentEditorToolbarContext) => React.ReactNode;
  /** Light, dark, or the user's operating-system preference. */
  theme?: DocumentEditorThemeMode;
  /** Override semantic color tokens without replacing the active theme. */
  themeOverrides?: Partial<DocumentEditorTheme>;
  /** Primary drives links/active controls; secondary drives success and supporting accents. */
  brandColors?: DocumentEditorBrandColors;
  style?: React.CSSProperties;
}

export interface DocumentEditorHandle {
  focus: () => void;
  getMode: () => DocumentEditorMode;
  setMode: (mode: DocumentEditorMode) => void;
  insertText: (value: string) => void;
  insertMarkdown: (prefix: string, suffix?: string, placeholder?: string) => void;
  appendBlock: (markdown: string) => void;
}

interface LinkDraft {
  open: boolean;
  text: string;
  address: string;
}

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(
  (
    {
      value,
      onChange,
      readOnly = false,
      mode: controlledMode,
      defaultMode = "visual",
      onModeChange,
      placeholder = "Start writing your document…",
      className = "",
      showStatusBar = true,
      showSplitMode = true,
      renderToolbarEnd,
      theme = "system",
      themeOverrides,
      brandColors,
      style,
    },
    forwardedRef,
  ) => {
    const [internalMode, setInternalMode] = useState<DocumentEditorMode>(
      readOnly ? "preview" : defaultMode,
    );
    const [blockType, setBlockType] = useState<RichTextBlockType>("p");
    const [linkDraft, setLinkDraft] = useState<LinkDraft>({
      open: false,
      text: "",
      address: "",
    });
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const richEditorRef = useRef<RichTextEditorHandle>(null);
    const mode = readOnly ? "preview" : controlledMode ?? internalMode;
    const resolvedTheme = useDocumentEditorResolvedTheme(theme);
    const themeTokens = useMemo(
      () => ({
        ...applyDocumentEditorBrandColors(
          resolvedTheme === "dark" ? DOCUMENT_EDITOR_DARK_THEME : DOCUMENT_EDITOR_LIGHT_THEME,
          brandColors,
        ),
        ...themeOverrides,
      }),
      [brandColors, resolvedTheme, themeOverrides],
    );

    const setMode = useCallback(
      (nextMode: DocumentEditorMode) => {
        if (readOnly) return;
        if (controlledMode === undefined) setInternalMode(nextMode);
        onModeChange?.(nextMode);
      },
      [controlledMode, onModeChange, readOnly],
    );

    useEffect(() => {
      if (readOnly && controlledMode === undefined) setInternalMode("preview");
    }, [controlledMode, readOnly]);

    const insertMarkdown = useCallback(
      (prefix: string, suffix = "", fallback = "text") => {
        if (readOnly) return;
        const textarea = textareaRef.current;
        if (!textarea) {
          onChange(appendMarkdownBlock(value, `${prefix}${fallback}${suffix}`));
          return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selection = value.slice(start, end) || fallback;
        onChange(`${value.slice(0, start)}${prefix}${selection}${suffix}${value.slice(end)}`);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(start + prefix.length, start + prefix.length + selection.length);
        });
      },
      [onChange, readOnly, value],
    );

    const prefixSelectedLines = useCallback(
      (prefix: string) => {
        if (readOnly) return;
        const textarea = textareaRef.current;
        if (!textarea) {
          onChange(appendMarkdownBlock(value, `${prefix}text`));
          return;
        }
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;
        const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
        const nextBreak = value.indexOf("\n", selectionEnd);
        const lineEnd = nextBreak === -1 ? value.length : nextBreak;
        const replacement = value
          .slice(lineStart, lineEnd)
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n");
        onChange(`${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(lineStart, lineStart + replacement.length);
        });
      },
      [onChange, readOnly, value],
    );

    const applyVisualOrMarkdown = (
      command: string,
      markdownAction: () => void,
      commandValue?: string,
    ) => {
      if (mode === "visual") {
        richEditorRef.current?.applyCommand(command, commandValue);
      } else {
        markdownAction();
      }
    };

    const insertText = useCallback(
      (text: string) => {
        if (readOnly) return;
        if (mode === "visual" && richEditorRef.current) {
          richEditorRef.current.insertText(text);
          return;
        }
        const textarea = textareaRef.current;
        if (textarea && (mode === "markdown" || mode === "split")) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          onChange(`${value.slice(0, start)}${text}${value.slice(end)}`);
          requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
          });
          return;
        }
        onChange(appendMarkdownBlock(value, text));
      },
      [mode, onChange, readOnly, value],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        focus() {
          if (mode === "visual") richEditorRef.current?.focus();
          else textareaRef.current?.focus();
        },
        getMode: () => mode,
        setMode,
        insertText,
        insertMarkdown,
        appendBlock(markdown: string) {
          if (!readOnly) onChange(appendMarkdownBlock(value, markdown));
        },
      }),
      [insertMarkdown, insertText, mode, onChange, readOnly, setMode, value],
    );

    const openLinkEditor = () => {
      const selectedText =
        mode === "visual"
          ? richEditorRef.current?.getSelectedText() || ""
          : textareaRef.current
            ? value.slice(textareaRef.current.selectionStart, textareaRef.current.selectionEnd)
            : "";
      setLinkDraft({ open: true, text: selectedText, address: "" });
    };

    const applyLink = () => {
      const address = linkDraft.address.trim();
      if (!address || /^(javascript|data|vbscript):/i.test(address)) return;
      if (mode === "visual") {
        richEditorRef.current?.insertLink(linkDraft.text, address);
      } else {
        const label = (linkDraft.text || address).replace(/\]/g, "\\]");
        insertText(`[${label}](${address.replace(/\)/g, "%29")})`);
      }
      setLinkDraft({ open: false, text: "", address: "" });
    };

    const counts = useMemo(() => countDocument(value), [value]);
    const toolbarContext = { mode, setMode, readOnly };
    const sourceVisible = mode === "markdown" || mode === "split";
    const previewVisible = mode === "preview" || mode === "split";

    return (
      <section
        className={`sunaissu-document-editor mode-${mode} ${className}`.trim()}
        data-theme={resolvedTheme}
        data-theme-mode={theme}
        style={{ ...getDocumentEditorThemeStyle(themeTokens), ...style }}
      >
        <header className="sunaissu-document-toolbar">
          <div className="sunaissu-format-tools" aria-label="Text formatting">
            {mode === "visual" && !readOnly && (
              <select
                value={blockType}
                onChange={(event) => {
                  const nextBlock = event.target.value as RichTextBlockType;
                  setBlockType(nextBlock);
                  richEditorRef.current?.applyCommand("formatBlock", nextBlock);
                }}
                aria-label="Paragraph style"
              >
                <option value="p">Normal text</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>
            )}
            <button type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("bold", () => insertMarkdown("**", "**", "bold text"))} aria-label="Bold"><strong>B</strong></button>
            <button type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("italic", () => insertMarkdown("_", "_", "italic text"))} aria-label="Italic"><em>I</em></button>
            <button type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("insertUnorderedList", () => prefixSelectedLines("- "))} aria-label="Bullet list">• List</button>
            <button type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("formatBlock", () => prefixSelectedLines("> "), "blockquote")} aria-label="Quote">“</button>
            <button type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("formatBlock", () => insertMarkdown("`", "`", "code"), "pre")} aria-label="Code">&lt;/&gt;</button>
            <button type="button" disabled={readOnly || mode === "preview"} onClick={openLinkEditor} aria-label="Link">Link</button>
          </div>

          <div className="sunaissu-document-view-tools">
            {!readOnly && (
              <div className="sunaissu-view-segment" aria-label="Editor view">
                <button type="button" className={mode === "visual" ? "is-active" : ""} onClick={() => setMode("visual")}>Visual</button>
                <button type="button" className={mode === "markdown" ? "is-active" : ""} onClick={() => setMode("markdown")}>Markdown</button>
                <button type="button" className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>Preview</button>
                {showSplitMode && <button type="button" className={mode === "split" ? "is-active" : ""} onClick={() => setMode("split")}>Split</button>}
              </div>
            )}
            {renderToolbarEnd?.(toolbarContext)}
          </div>
        </header>

        <div className="sunaissu-document-canvas">
          {mode === "visual" && !readOnly && (
            <div className="sunaissu-document-write-pane">
              <RichTextEditor
                ref={richEditorRef}
                content={value}
                onChange={onChange}
                onBlockTypeChange={setBlockType}
                placeholder={placeholder}
              />
            </div>
          )}
          {sourceVisible && !readOnly && (
            <div className="sunaissu-document-write-pane">
              <textarea
                ref={textareaRef}
                className="markdown-source sunaissu-markdown-source"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
                    event.preventDefault();
                    insertMarkdown("**", "**", "bold text");
                  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
                    event.preventDefault();
                    insertMarkdown("_", "_", "italic text");
                  } else if (event.key === "Tab") {
                    event.preventDefault();
                    insertMarkdown("  ", "", "");
                  }
                }}
                spellCheck
                placeholder={placeholder}
                aria-label="Markdown source"
              />
            </div>
          )}
          {previewVisible && (
            <div className="sunaissu-document-preview-pane">
              <MarkdownRenderer content={value} />
            </div>
          )}
        </div>

        {showStatusBar && (
          <footer className="sunaissu-document-statusbar">
            <div><span>{counts.words} {counts.words === 1 ? "word" : "words"}</span><span>{counts.characters} characters</span></div>
            <div><span className="sunaissu-portable-dot" />Stored as portable Markdown</div>
          </footer>
        )}

        {linkDraft.open && (
          <div className="sunaissu-link-dialog-backdrop" role="presentation" onMouseDown={() => setLinkDraft({ open: false, text: "", address: "" })}>
            <form className="sunaissu-link-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); applyLink(); }}>
              <strong>Insert link</strong>
              <label><span>Text</span><input value={linkDraft.text} onChange={(event) => setLinkDraft((draft) => ({ ...draft, text: event.target.value }))} /></label>
              <label><span>Address</span><input autoFocus value={linkDraft.address} onChange={(event) => setLinkDraft((draft) => ({ ...draft, address: event.target.value }))} placeholder="https://example.com" /></label>
              <div><button type="button" onClick={() => setLinkDraft({ open: false, text: "", address: "" })}>Cancel</button><button type="submit" disabled={!linkDraft.address.trim()}>Insert</button></div>
            </form>
          </div>
        )}
      </section>
    );
  },
);

DocumentEditor.displayName = "DocumentEditor";

export default DocumentEditor;
