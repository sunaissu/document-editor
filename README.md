# @sunaissu/document-editor

A controlled React document editor that stores portable Markdown while offering visual, Markdown source, preview, and split views.

## Install

```bash
npm install @sunaissu/document-editor
```

For local development before publishing:

```bash
npm install ../document-editor
```

## Playground

The Vite playground imports directly from `src`, so package changes appear immediately:

```bash
npm install
npm --prefix playground install
npm run playground
```

Use `npm run playground:build` for a production playground build.

Import the package stylesheet once from your application entry point:

```ts
import "@sunaissu/document-editor/styles.css";
```

## Complete editor

```tsx
import { useRef, useState } from "react";
import {
  DocumentEditor,
  type DocumentEditorHandle,
} from "@sunaissu/document-editor";

export function Notes() {
  const [markdown, setMarkdown] = useState("# Hello");
  const editor = useRef<DocumentEditorHandle>(null);

  return (
    <DocumentEditor
      ref={editor}
      value={markdown}
      onChange={setMarkdown}
      defaultMode="visual"
    />
  );
}
```

`DocumentEditor` is controlled, so persistence remains the host application's responsibility. The ref exposes `focus`, `setMode`, `insertText`, `insertMarkdown`, and `appendBlock` for composing external tools such as the calculator package.

## Real-time collaboration

Install Yjs and connect the optional adapter to a provider such as Hocuspocus or `y-websocket`:

```tsx
import * as Y from "yjs";
import { DocumentEditor } from "@sunaissu/document-editor";
import { useYjsDocument } from "@sunaissu/document-editor/yjs";

const document = new Y.Doc();

export function CollaborativeDocument() {
  const binding = useYjsDocument(document, { initialValue: "# Shared note" });
  return <DocumentEditor value={binding.value} onChange={binding.onChange} history={binding.history} />;
}
```

The adapter rebases a local changed range against observed peer edits in `Y.Text`. Visual and source editors defer remote DOM changes during composition and adjust local selection offsets when content changes. Pass `binding.history` for undo/redo that tracks only this editor’s transactions. Authentication, persistence, awareness, and network transport remain the host application's responsibility.

## Themes and brand colors

The editor supports `light`, `dark`, and `system` (automatic) modes. Two brand colors adapt it to the host application without replacing either theme:

```tsx
<DocumentEditor
  value={markdown}
  onChange={setMarkdown}
  theme="system"
  brandColors={{ primary: "#8b5cf6", secondary: "#16a34a" }}
/>
```

Primary is used for links and active controls; secondary is used for success states, tags, and supporting accents. `themeOverrides` remains available for advanced token-level changes.

For full presets, start from the exported `DOCUMENT_EDITOR_LIGHT_THEME` or `DOCUMENT_EDITOR_DARK_THEME`, or use `applyDocumentEditorBrandColors`. The corresponding `--document-*` CSS variables can also be overridden in a host stylesheet.

## Image uploads

Pass a stable `onUploadImage` callback to enable file selection in the Image panel and image paste/drop in the writing pane. The host owns storage and returns a URL with optional description and caption:

```tsx
import type { DocumentImageUpload } from "@sunaissu/document-editor";

// Define outside the component, or memoize with useCallback.
const uploadImage: DocumentImageUpload = async (file, { signal }) => {
  const body = new FormData();
  body.append("image", file);
  const response = await fetch("/api/images", { method: "POST", body, signal });
  if (!response.ok) throw new Error("Image upload failed");
  const result = await response.json();
  return { url: result.url, alt: file.name, caption: result.caption };
};

<DocumentEditor value={markdown} onChange={setMarkdown} onUploadImage={uploadImage} />
```

Files must be nonempty PNG, JPEG, GIF, or WebP, at most 5 MiB and 16 million decoded pixels. Returned URLs must be web/relative URLs or bounded base64 raster data URLs. The first image in a paste/drop is used. The server must enforce its own upload limits and authorization.

Uploads show pending, failure and cancellation states. The editor aborts on cancellation, document changes, permission changes, callback replacement or unmount, and ignores late results even if the host ignores the signal. Insertion uses the captured position and is undoable. Descriptions and captions are escaped as literal text; captions are ordinary paragraphs beneath images, with no dedicated caption editor or percentage-progress API yet.

The playground embeds images as data URLs for a local demonstration. Production hosts should return stored media URLs; Markdown containing data URLs grows with each image.

## Lower-level exports

Use `MarkdownRenderer` or `RichTextEditor` independently when an application already owns its toolbar and layout. Conversion helpers (`markdownToEditorHtml`, `editorElementToMarkdown`), `countDocument`, and `appendMarkdownBlock` are also exported.

The Markdown subset includes headings, emphasis, links, images, wiki links, tasks, nested lists, quotes, fenced code, frontmatter, horizontal rules, and tables. Visual mode normalizes Markdown; it does not promise byte-for-byte preservation of unsupported extensions or source formatting. Use source mode when that preservation matters.

Rendered links accept only web, email, telephone, and relative URLs. Images accept web, relative, and base64-encoded raster image URLs; unsafe schemes are rendered without navigation or loading privileges.

## Editing tools

Find and replace supports case and whole-word matching, navigation to source ranges, and confirmation before replacing all matches. The outline lists headings and jumps to source while editing. In preview and read-only mode, search and outline navigation scroll to and outline the matching rendered block. Source positions distinguish duplicate headings and formatted labels. Formatting, list, insertion, navigation and view buttons stay visible in a compact toolbar. Buttons have accessible names and hover labels; table-editing actions appear when a table cell is selected. Find & Replace, Outline, and insertion forms share one side panel with a close button and Escape support; opening them does not expand the toolbar. In visual mode, blocks are inserted after the selected block. Select a table cell to add or remove rows and columns, align a column, or delete the table. Table headers and the final column are protected; growth is limited to 200 body rows and 50 columns. Task checkboxes support click and keyboard toggling. Host image uploads are available through `onUploadImage`, described above.

The toolbar also exposes six heading levels, bold, italic, strikethrough, numbered and bulleted lists, quotes, inline code, and code blocks. Selecting text in visual mode opens a nearby toolbar for bold, italic, strikethrough, inline code, and links. Active marks use an accent underline; mixed selections use a dashed indicator and `aria-pressed="mixed"`. Alt+F10 focuses this toolbar; Left/Right, Home/End, and Escape navigate or leave it. The same formatting buttons work at a caret or in Markdown. Text style uses direct paragraph and H1–H6 icon buttons with the same sizing, hover and active treatment as the other toolbar groups. Tooltips and accessible names identify each style; choosing one applies it at the saved editing position and returns focus to the editor. Labeled Text, Text style, Lists and Insert groups share a horizontal strip. At narrow widths, scroll the strip or Tab through its controls; an overflow hint appears only when needed. History, Find, Outline and the view switcher stay in a separate row. Preview and read-only views hide formatting actions. The side panel covers the writing area on narrow screens until closed. The selection toolbar uses larger button targets for touch pointers. Local undo/redo covers text and table operations; each stack is limited to 100 snapshots and two million characters. Replacing the controlled value externally clears local history. Supply collaborative history when using Yjs.

Type `/` on an otherwise empty line in visual or Markdown mode to open 31 searchable commands. Use Up/Down and Enter to choose, or click a result; Escape keeps the typed text. Commands include six headings, text formatting, three list types, quotes, code blocks (plain, JavaScript, Python, JSON), tables, links, images, dividers, notes, warnings, meeting notes, decisions, pros/cons, summaries, Find, and Outline. Templates insert ordinary editable Markdown. Commands do not activate in code fences, inside inline code, during composition, or in read-only mode.

The link dialog supports keyboard focus, Escape, and focus return. Visual serialization preserves URLs containing unmatched parentheses, link/image titles and literal image-description punctuation. Source insertion through the ref and mode changes are ignored during active composition; retry them after composition ends. Both visual editing and preview use the same Markdown parser with raw HTML disabled. Paste and drop accept plain text, and the lower-level command API allows only supported formatting commands. A print stylesheet hides editing controls.

`onChange(next, previous?)` includes the input's base when available. Forward both arguments when wrapping a collaborative binding. The binding also exposes `text` and `localOrigin` for host integration. Initialize persisted shared content on the server after loading it, before connecting editors.

See [the implementation review](./implementation-review.txt) for checks and [the feature backlog](./feature-backlog.txt) for all 29 feature contracts, dependencies and acceptance checks. OPEN and PARTIAL items remain unfinished.

## Development checks

Run `npm test`, `npm run playground:build`, and `npm pack --dry-run --json` before release. The GitHub Actions workflow is configured to test the package on Node 18, 22 and 24, build the playground on Node 22/24, and audit both dependency trees. Browser checks remain a separate local step documented in the implementation review. The workflow has not been run on GitHub as part of this local review.

## Review safeguards

Markdown images use the same URL policy as the image panel and upload results: HTTP(S), relative URLs, or PNG/JPEG/GIF/WebP base64 data URLs up to 8 MiB of URL text. Data payloads must have valid base64 syntax; actual decoding remains the browser's job. Raw HTML remains disabled. Remote images can make browser network requests, so hosts that need stricter destination rules should validate stored Markdown before rendering it.

A replace-all confirmation belongs to the exact document value being reviewed. External edits, including peer changes, invalidate it. Review again before applying the replacement. Closing the panel or switching to read-only also clears the confirmation.

The visual editor and Markdown preview fill their available pane width, with 20–32px edge padding and no fixed reading-column cap. Markdown source uses the same edge spacing. Text-style changes run directly from the toolbar and preserve the writing width.

Visual editing keeps the initial sanitized HTML object stable across React renders. Later remote content is applied through the selection-preserving update effect; focus, toolbar, and host layout renders do not restore old DOM content. This also prevents duplicate text when a React 19 host uses multiple editor panes.
