import { useEditorHistory } from "./useEditorHistory";
import { useDocumentImageUpload, type DocumentImageUpload } from "./imageUpload";
import type { TableAction } from "./table";
import type { DocumentHistory } from "./history";
import { DocumentTools, ToolbarGroup, type DocumentPanel } from "./DocumentTools";
import { ToolbarIcon } from "./Toolbar";
import { SelectionToolbar } from "./SelectionToolbar";
import type { RichTextSelection } from "./selectionFormatting";
import { SlashMenu } from "./SlashMenu";
import { getSourceSlash, type SlashCommand } from "./slashCommands";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { moveTextPosition } from "./textEdit";
import { safeDocumentLink } from "./parser";
import MarkdownRenderer from "./MarkdownRenderer";
import RichTextEditor, {
  type RichTextBlockType,
  type RichTextEditorHandle,
} from "./RichTextEditor";
import { appendMarkdownBlock, countDocument, escapeMarkdownLabel, markdownDestination } from "./markdown";
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
  /** Optional host upload; the host owns storage and returned image URLs. */
  onUploadImage?: DocumentImageUpload;
  history?: DocumentHistory;
  value: string;
  onChange: (value: string, previous?: string) => void;
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
      onChange: onValueChange,
      onUploadImage,
      readOnly = false,
      mode: controlledMode,
      defaultMode = "visual",
      onModeChange,
      placeholder = "Start writing your document…",
      className = "",
      history: externalHistory,
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
    const { onChange, history } = useEditorHistory(value, onValueChange, externalHistory);
    const [internalMode, setInternalMode] = useState<DocumentEditorMode>(
      readOnly ? "preview" : defaultMode,
    );
    const [panel, setPanel] = useState<DocumentPanel>(null);
    const [tableActive, setTableActive] = useState(false);
    const [selection, setSelection] = useState<RichTextSelection | null>(null);
    const formats = selection?.formats ?? { bold: false, italic: false, strike: false, code: false };
    const [blockType, setBlockType] = useState<RichTextBlockType>("p");
    const [linkDraft, setLinkDraft] = useState<LinkDraft>({
      open: false,
      text: "",
      address: "",
    });
    const linkDialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
      if (!linkDraft.open) return;
      const previousFocus = document.activeElement as HTMLElement | null;
      const dialog = linkDialogRef.current;
      dialog?.showModal();
      dialog?.querySelector<HTMLInputElement>("[data-link-address]")?.focus();
      return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus(); else richEditorRef.current?.focus(); };
    }, [linkDraft.open]);
    const sectionRef = useRef<HTMLElement>(null);
    const pendingSelection = useRef<[number, number] | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const sourceBase = useRef(value);
    const sourceComposing = useRef(false);
    const richEditorRef = useRef<RichTextEditorHandle>(null);
    const mode = readOnly ? "preview" : controlledMode ?? internalMode;
    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea || sourceComposing.current) return;
      if (textarea.value !== value) {
        const before = textarea.value, direction = textarea.selectionDirection;
        const start = moveTextPosition(textarea.selectionStart, before, value);
        const end = moveTextPosition(textarea.selectionEnd, before, value);
        textarea.value = value;
        textarea.setSelectionRange(start, end, direction);
      }
      sourceBase.current = value;
    }, [value, mode]);
    const emitSource = (next: string) => {
      const previous = sourceBase.current;
      sourceBase.current = next;
      onChange(next, previous);
    };
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
        if (readOnly || sourceComposing.current) return;
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
        if (readOnly || sourceComposing.current) return;
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
      (prefix: string, stripHeading = false) => {
        if (readOnly || sourceComposing.current) return;
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
          .map((line) => prefix + (stripHeading ? line.replace(/^ {0,3}#{1,6}\s+/, "") : line))
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
        if (readOnly || sourceComposing.current) return;
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
          if (!readOnly && !sourceComposing.current) onChange(appendMarkdownBlock(value, markdown));
        },
      }),
      [insertMarkdown, insertText, mode, onChange, readOnly, setMode, value],
    );

    const selectSourceRange = (start: number, end: number) => {
      if (sourceComposing.current) return;
      if (readOnly || mode === "preview") {
        const blocks = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>(".sunaissu-markdown-body [data-source-start]") ?? []);
        blocks.forEach(node => node.removeAttribute("data-navigation-match"));
        const target = blocks.filter(node => Number(node.dataset.sourceStart) <= start && Number(node.dataset.sourceEnd) >= end)
          .sort((a, b) => (Number(a.dataset.sourceEnd) - Number(a.dataset.sourceStart)) - (Number(b.dataset.sourceEnd) - Number(b.dataset.sourceStart)))[0];
        if (target) { target.dataset.navigationMatch = "true"; target.scrollIntoView({ block: "center" }); }
        return;
      }
      pendingSelection.current = [start, end];
      setMode("markdown");
      requestAnimationFrame(() => {
        if (textareaRef.current && pendingSelection.current) {
          textareaRef.current.focus(); textareaRef.current.setSelectionRange(...pendingSelection.current); pendingSelection.current = null;
        }
      });
    };
    useEffect(() => {
      if (textareaRef.current && pendingSelection.current) {
        textareaRef.current.focus(); textareaRef.current.setSelectionRange(...pendingSelection.current); pendingSelection.current = null;
      }
    }, [mode]);
    const insertBlock = (markdown: string) => {
      if (readOnly || sourceComposing.current) return;
      if (mode === "visual" && richEditorRef.current) { richEditorRef.current.insertBlock(markdown); return; }
      const position = textareaRef.current?.selectionEnd ?? value.length;
      const prefix = value.slice(0, position), suffix = value.slice(position);
      const next = appendMarkdownBlock(prefix, markdown) + (suffix ? "\n\n" + suffix : "");
      onChange(next, value);
    };

    const imageUpload = useDocumentImageUpload(onUploadImage, value, readOnly || mode === "preview", () => !sourceComposing.current, () => {
      if (mode === "visual") return richEditorRef.current?.captureBlockInsertion() ?? (() => false);
      const position = textareaRef.current?.selectionEnd ?? value.length;
      return markdown => {
        const prefix = value.slice(0, position), suffix = value.slice(position);
        onChange(appendMarkdownBlock(prefix, markdown) + (suffix ? "\n\n" + suffix : ""), value);
        return true;
      };
    });
    const imageInput = useRef<HTMLInputElement>(null);
    const uploadControls = onUploadImage ? <div className="document-image-upload">
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void imageUpload.request(file); }} />
      <button type="button" disabled={imageUpload.pending} onClick={() => imageInput.current?.click()}>Upload image</button>
      <small>PNG, JPEG, GIF or WebP. Up to 5 MiB and 16 million pixels. You can also paste or drop an image.</small>
    </div> : undefined;

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
      if (!address || safeDocumentLink(address) === "#") return;
      if (mode === "visual") {
        richEditorRef.current?.insertLink(linkDraft.text, address);
      } else {
        const label = escapeMarkdownLabel(linkDraft.text || address);
        insertText(`[${label}](${markdownDestination(safeDocumentLink(address))})`);
      }
      setLinkDraft({ open: false, text: "", address: "" });
    };

    const runSlashCommand = (command: SlashCommand, query: string) => {
      if (readOnly || sourceComposing.current) return;
      if (mode === "visual") {
        if (!richEditorRef.current?.replaceSlashCommand(query, command.markdown || "")) return;
      } else {
        const source = textareaRef.current;
        if (!source || source.selectionStart !== source.selectionEnd) return;
        const trigger = getSourceSlash(source.value, source.selectionStart);
        if (!trigger || trigger.query !== query) return;
        const inserted = command.markdown || "";
        const next = source.value.slice(0, trigger.start) + inserted + source.value.slice(trigger.end);
        source.value = next; source.setSelectionRange(trigger.start + inserted.length, trigger.start + inserted.length);
        emitSource(next);
      }
      if (command.action === "link") setLinkDraft({ open: true, text: "", address: "" });
      else if (command.action) setPanel(command.action);
    };

    const counts = useMemo(() => countDocument(value), [value]);
    const toolbarContext = { mode, setMode, readOnly };
    const sourceVisible = mode === "markdown" || mode === "split";
    const previewVisible = mode === "preview" || mode === "split";

    const viewTools = <><ToolbarGroup label="History"><button type="button" title="Undo" aria-label="Undo" disabled={readOnly || !history.canUndo()} onClick={history.undo}><ToolbarIcon name="Undo" /></button><button type="button" title="Redo" aria-label="Redo" disabled={readOnly || !history.canRedo()} onClick={history.redo}><ToolbarIcon name="Redo" /></button></ToolbarGroup>
<ToolbarGroup label="View"><div className="sunaissu-document-view-tools">
            {!readOnly && (
              <div className="sunaissu-view-segment" aria-label="Editor view">
                <button type="button" aria-pressed={mode === "visual"} className={mode === "visual" ? "is-active" : ""} onClick={() => setMode("visual")}>Visual</button>
                <button type="button" aria-pressed={mode === "markdown"} className={mode === "markdown" ? "is-active" : ""} onClick={() => setMode("markdown")}>Markdown</button>
                <button type="button" aria-pressed={mode === "preview"} className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>Preview</button>
                {showSplitMode && <button type="button" aria-pressed={mode === "split"} className={mode === "split" ? "is-active" : ""} onClick={() => setMode("split")}>Split</button>}
              </div>
            )}
            {renderToolbarEnd?.(toolbarContext)}
          </div></ToolbarGroup></>;

    const primaryTools = <><ToolbarGroup label="Text"><button title="Bold" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("bold", () => insertMarkdown("**", "**", "bold text"))} aria-label="Bold" aria-pressed={mode === "visual" ? formats.bold : undefined}><ToolbarIcon name="Bold" /></button>
<button title="Italic" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("italic", () => insertMarkdown("_", "_", "italic text"))} aria-label="Italic" aria-pressed={mode === "visual" ? formats.italic : undefined}><ToolbarIcon name="Italic" /></button>
<button title="Strikethrough" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("strikeThrough", () => insertMarkdown("~~", "~~", "text"))} aria-label="Strikethrough" aria-pressed={mode === "visual" ? formats.strike : undefined}><ToolbarIcon name="Strikethrough" /></button>
<button title="Inline code" type="button" disabled={readOnly || mode === "preview"} onClick={() => mode === "visual" ? richEditorRef.current?.insertInlineCode() : insertMarkdown("`", "`", "code")} aria-label="Inline code" aria-pressed={mode === "visual" ? formats.code : undefined}><ToolbarIcon name="Inline code" /></button>
</ToolbarGroup>
 </>;
    const listTools = <ToolbarGroup label="Lists"><button title="Bullet list" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("insertUnorderedList", () => prefixSelectedLines("- "))} aria-label="Bullet list"><ToolbarIcon name="Bullet list" /></button>
<button title="Numbered list" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("insertOrderedList", () => prefixSelectedLines("1. "))} aria-label="Numbered list"><ToolbarIcon name="Numbered list" /></button><button type="button" title="Task list" aria-label="Task list" disabled={readOnly || mode === "preview"} onClick={() => insertBlock("- [ ] Task")}><ToolbarIcon name="Task list" /></button></ToolbarGroup>;
    const insertTools = <><button title="Quote" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("formatBlock", () => prefixSelectedLines("> "), "blockquote")} aria-label="Quote"><ToolbarIcon name="Quote" /><span>Quote</span></button>
<button title="Code block" type="button" disabled={readOnly || mode === "preview"} onClick={() => applyVisualOrMarkdown("formatBlock", () => insertMarkdown("\n\n```\n", "\n```\n", "code"), "pre")} aria-label="Code block"><ToolbarIcon name="Code block" /><span>Code</span></button>
<button title="Link" type="button" disabled={readOnly || mode === "preview"} onClick={openLinkEditor} aria-label="Link"><ToolbarIcon name="Link" /><span>Link</span></button></>;
    const contextTools = <>{mode === "visual" && tableActive && !readOnly && <ToolbarGroup label="Table">
          {([['row-above','Row above'],['row-below','Row below'],['delete-row','Delete row'],['column-before','Column before'],['column-after','Column after'],['delete-column','Delete column'],['align-left','Align left'],['align-center','Align center'],['align-right','Align right'],['delete-table','Delete table']] as [TableAction,string][]).map(([action,label]) => <button type="button" key={action} onClick={() => richEditorRef.current?.editTable(action)}>{label}</button>)}
        </ToolbarGroup>}</>;

    return (
      <section ref={sectionRef}
        onCompositionStartCapture={() => { sourceComposing.current = true; }}
        onCompositionEndCapture={() => { sourceComposing.current = false; }}
        onPasteCapture={event => {
          if (!onUploadImage || readOnly || mode === "preview" || sourceComposing.current) return;
          if (!(event.target instanceof Element) || !event.target.closest(".sunaissu-document-canvas")) return;
          const file = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/"));
          if (file) { event.preventDefault(); event.stopPropagation(); void imageUpload.request(file); }
        }}
        onDragOverCapture={event => { if (onUploadImage && !readOnly && mode !== "preview" && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDropCapture={event => {
          if (!onUploadImage || readOnly || mode === "preview" || sourceComposing.current) return;
          if (!(event.target instanceof Element) || !event.target.closest(".sunaissu-document-canvas")) return;
          const file = Array.from(event.dataTransfer.files).find(file => file.type.startsWith("image/"));
          if (file) { event.preventDefault(); event.stopPropagation(); void imageUpload.request(file); }
        }}
        className={`sunaissu-document-editor mode-${mode} ${className}`.trim()}
        data-theme={resolvedTheme}
        data-theme-mode={theme}
        style={{ ...getDocumentEditorThemeStyle(themeTokens), ...style }}
      >
        <DocumentTools textStyle={blockType} onTextStyleChange={style => {
          if (readOnly || mode === "preview" || sourceComposing.current) return;
          setBlockType(style);
          if (mode === "visual") richEditorRef.current?.applyCommand("formatBlock", style);
          else prefixSelectedLines(style === "p" ? "" : "#".repeat(Number(style[1])) + " ", true);
        }} imageUpload={uploadControls} toolbarStart={primaryTools} listTools={listTools} insertTools={insertTools} contextTools={contextTools} toolbarEnd={viewTools} value={value} panel={panel} onPanelChange={setPanel} readOnly={readOnly || mode === "preview"} onChange={onChange} onSelect={selectSourceRange} onInsert={insertBlock}>

        <div className="sunaissu-document-canvas">
          {mode === "visual" && !readOnly && (
            <div className="sunaissu-document-write-pane">
              <RichTextEditor
                ref={richEditorRef}
                content={value}
                onChange={onChange}
                history={history}
                onTableChange={setTableActive}
                onSelectionChange={setSelection}
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
                defaultValue={value}
                onChange={(event) => { if (!sourceComposing.current) emitSource(event.target.value); }}
                onCompositionStart={() => { sourceComposing.current = true; }}
                onCompositionEnd={(event) => { sourceComposing.current = false; emitSource(event.currentTarget.value); }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (history && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); return; }
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
                    event.preventDefault();
                    insertMarkdown("**", "**", "bold text");
                  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
                    event.preventDefault();
                    insertMarkdown("_", "_", "italic text");
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

        </DocumentTools>
        {imageUpload.status && <div className="document-upload-status" role="status">{imageUpload.status}{imageUpload.pending && <button type="button" onClick={imageUpload.cancel}>Cancel upload</button>}</div>}
        {mode === "visual" && !readOnly && !linkDraft.open && <SelectionToolbar container={sectionRef} selection={selection} onCommand={command => richEditorRef.current?.applyCommand(command)} onCode={() => richEditorRef.current?.insertInlineCode()} onLink={openLinkEditor} />}
        <SlashMenu container={sectionRef} enabled={!readOnly && mode !== "preview"} mode={mode} onCommand={runSlashCommand} />

        {showStatusBar && (
          <footer className="sunaissu-document-statusbar">
            <div><span>{counts.words} {counts.words === 1 ? "word" : "words"}</span><span>{counts.characters} characters</span></div>
            <div><span className="sunaissu-portable-dot" />Stored as portable Markdown</div>
          </footer>
        )}

        {linkDraft.open && (
          <dialog ref={linkDialogRef} className="sunaissu-link-dialog-backdrop" aria-label="Insert link" onCancel={() => setLinkDraft({ open: false, text: "", address: "" })} onMouseDown={(event) => { if (event.target === event.currentTarget) setLinkDraft({ open: false, text: "", address: "" }); }}>
            <form className="sunaissu-link-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); applyLink(); }}>
              <strong>Insert link</strong>
              <label><span>Text</span><input value={linkDraft.text} onChange={(event) => setLinkDraft((draft) => ({ ...draft, text: event.target.value }))} /></label>
              <label><span>Address</span><input data-link-address value={linkDraft.address} onChange={(event) => setLinkDraft((draft) => ({ ...draft, address: event.target.value }))} placeholder="https://example.com" /></label>
              <div><button type="button" onClick={() => setLinkDraft({ open: false, text: "", address: "" })}>Cancel</button><button type="submit" disabled={!linkDraft.address.trim() || safeDocumentLink(linkDraft.address) === "#"}>Insert</button></div>
            </form>
          </dialog>
        )}
      </section>
    );
  },
);

DocumentEditor.displayName = "DocumentEditor";

export default DocumentEditor;
