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
  return <DocumentEditor value={binding.value} onChange={binding.onChange} />;
}
```

The adapter applies the smallest changed text range to `Y.Text`, while the editor preserves its active selection when remote Markdown arrives. Authentication, persistence, awareness, and network transport remain the host application's responsibility.

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

## Lower-level exports

Use `MarkdownRenderer` or `RichTextEditor` independently when an application already owns its toolbar and layout. Conversion helpers (`markdownToEditorHtml`, `editorElementToMarkdown`), `countDocument`, and `appendMarkdownBlock` are also exported.

The Markdown subset includes headings, emphasis, links, images, wiki links, tags, tasks, lists, quotes, fenced code, frontmatter, horizontal rules, and tables.

Rendered links accept only web, email, telephone, and relative URLs. Images accept web, relative, and base64-encoded raster image URLs; unsafe schemes are rendered without navigation or loading privileges.
