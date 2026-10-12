export { DocumentEditor } from "./DocumentEditor";
export type {
  DocumentEditorHandle,
  DocumentEditorMode,
  DocumentEditorProps,
  DocumentEditorToolbarContext,
} from "./DocumentEditor";
export { MarkdownRenderer } from "./MarkdownRenderer";
export type { MarkdownRendererProps } from "./MarkdownRenderer";
export { RichTextEditor } from "./RichTextEditor";
export type {
  RichTextBlockType,
  RichTextEditorHandle,
  RichTextEditorProps,
} from "./RichTextEditor";
export {
  appendMarkdownBlock,
  countDocument,
  editorElementToMarkdown,
  markdownToEditorHtml,
} from "./markdown";
export type { DocumentCounts } from "./markdown";

export {
  DOCUMENT_EDITOR_DARK_THEME,
  DOCUMENT_EDITOR_LIGHT_THEME,
  applyDocumentEditorBrandColors,
  getDocumentEditorThemeStyle,
  useDocumentEditorResolvedTheme,
} from "./theme";
export type {
  DocumentEditorBrandColors,
  DocumentEditorResolvedTheme,
  DocumentEditorTheme,
  DocumentEditorThemeMode,
} from "./theme";

export { DocumentEditor as default } from "./DocumentEditor";

export { findDocumentMatches, getDocumentOutline } from "./parser";
export type { FindOptions, DocumentHeading } from "./parser";

export type { DocumentHistory } from "./history";

export type { TableAction } from "./table";
export type { DocumentImageUpload, UploadedDocumentImage } from "./imageUpload";

export type { FormatState, SelectionFormats, RichTextSelection } from "./selectionFormatting";
