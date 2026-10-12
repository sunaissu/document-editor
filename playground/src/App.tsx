import { useMemo, useRef, useState } from "react";
import {
  DocumentEditor,
  countDocument,
  type DocumentEditorHandle,
  type DocumentEditorMode,
  type DocumentEditorThemeMode,
  type DocumentImageUpload,
} from "@sunaissu/document-editor";

const uploadPlaygroundImage: DocumentImageUpload = (file, { signal }) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  const abort = () => reader.abort();
  const cleanup = () => signal.removeEventListener("abort", abort);
  reader.onload = () => { cleanup(); resolve({ url: String(reader.result), alt: file.name.replace(/\.[^.]+$/, "") }); };
  reader.onerror = () => { cleanup(); reject(new Error("Could not read the image")); };
  reader.onabort = () => { cleanup(); reject(new Error("Upload cancelled")); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) { cleanup(); reject(new Error("Upload cancelled")); } else reader.readAsDataURL(file);
});

const SAMPLE_DOCUMENT = `# Project notes

This editor keeps **portable Markdown** as its source of truth while giving you a calm visual writing surface.

## A small checklist

- [x] Visual editing
- [x] Markdown source
- [x] Live preview
- [ ] Ship the next great idea

> A reusable editor should own editing behavior, not your persistence layer.

| View | Best for |
| --- | --- |
| Visual | Focused writing |
| Markdown | Precise source edits |
| Preview | Reading and review |
| Split | Source and output together |

Try an inline \`code sample\`, a [link](https://example.com), or a #portable-note tag.`;

const modes: DocumentEditorMode[] = ["visual", "markdown", "preview", "split"];

export default function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [value, setValue] = useState(SAMPLE_DOCUMENT);
  const [mode, setMode] = useState<DocumentEditorMode>("visual");
  const [readOnly, setReadOnly] = useState(false);
  const [theme, setTheme] = useState<DocumentEditorThemeMode>("system");
  const [primaryColor, setPrimaryColor] = useState("#7c5cff");
  const [secondaryColor, setSecondaryColor] = useState("#22a06b");
  const counts = useMemo(() => countDocument(value), [value]);

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <div>
          <span className="eyebrow">@sunaissu/document-editor</span>
          <h1>A place to put your thoughts.</h1>
          <p>
            Write, format, and organize your notes. Switch to Markdown whenever you need it.
          </p>
        </div>
        <div className="package-badge"><span />Local package playground</div>
      </header>

      <section className="playground-grid">
        <div className="editor-stage">
          <DocumentEditor
            ref={editorRef}
            value={value}
            onChange={setValue}
            onUploadImage={uploadPlaygroundImage}
            mode={mode}
            onModeChange={setMode}
            readOnly={readOnly}
            theme={theme}
            brandColors={{ primary: primaryColor, secondary: secondaryColor }}
            placeholder="Start a portable Markdown document…"
          />
        </div>

        <aside className="inspector">
          <div className="inspector-heading">
            <span>Playground controls</span>
            <small>Controlled component</small>
          </div>

          <div className="control-group">
            <label>Color theme</label>
            <div className="mode-grid three-columns">
              {(["system", "light", "dark"] as DocumentEditorThemeMode[]).map((candidate) => (
                <button
                  type="button"
                  key={candidate}
                  className={theme === candidate ? "is-active" : ""}
                  onClick={() => setTheme(candidate)}
                >
                  {candidate === "system" ? "auto" : candidate}
                </button>
              ))}
            </div>
            <div className="brand-color-grid">
              <label><span>Primary</span><input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></label>
              <label><span>Secondary</span><input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /></label>
            </div>
          </div>

          <div className="control-group">
            <label>Editor mode</label>
            <div className="mode-grid">
              {modes.map((candidate) => (
                <button
                  type="button"
                  key={candidate}
                  className={mode === candidate ? "is-active" : ""}
                  onClick={() => setMode(candidate)}
                  disabled={readOnly}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Host actions</label>
            <button type="button" className="wide-action" onClick={() => setReadOnly((current) => !current)}>
              {readOnly ? "Unlock editing" : "Preview as read-only"}
            </button>
            <button
              type="button"
              className="wide-action"
              disabled={readOnly}
              onClick={() => editorRef.current?.appendBlock(`**Inserted externally:** ${new Date().toLocaleTimeString()}`)}
            >
              Insert timestamp block
            </button>
            <button type="button" className="wide-action subtle" onClick={() => { setValue(SAMPLE_DOCUMENT); setMode("visual"); setReadOnly(false); }}>
              Reset sample
            </button>
          </div>

          <div className="metrics">
            <div><strong>{counts.words}</strong><span>Words</span></div>
            <div><strong>{counts.characters}</strong><span>Characters</span></div>
          </div>

          <div className="api-note">
            <code>ref.appendBlock(markdown)</code>
            <p>The host owns state and persistence; the package owns editing behavior.</p>
          </div>
        </aside>
      </section>

      <details className="source-drawer">
        <summary>Inspect portable Markdown <span>{value.length} characters</span></summary>
        <pre>{value}</pre>
      </details>
    </main>
  );
}
