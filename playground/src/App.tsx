import sunaissuMark from "../../assets/brand/sunaissu-dark.svg";
import bgMark from "../../assets/brand/bg-dark.svg";
import { useMemo, useRef, useState } from "react";
import {
  DocumentEditor,
  countDocument,
  getDocumentEditorScrollbarProps,
  type DocumentEditorHandle,
  type DocumentEditorMode,
  type DocumentEditorThemeMode,
  type DocumentImageUpload,
  type DocumentEditorScrollbarOptions,
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
const schemes = {
  ocean: { primary: "#2563eb", secondary: "#06b6d4" },
  forest: { primary: "#15803d", secondary: "#ca8a04" },
  plum: { primary: "#9333ea", secondary: "#db2777" },
};
type ColorScheme = "default" | keyof typeof schemes | "custom";

export default function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [value, setValue] = useState(SAMPLE_DOCUMENT);
  const [mode, setMode] = useState<DocumentEditorMode>("visual");
  const [readOnly, setReadOnly] = useState(false);
  const [theme, setTheme] = useState<DocumentEditorThemeMode>("system");
  const [primaryColor, setPrimaryColor] = useState("#7c5cff");
  const [secondaryColor, setSecondaryColor] = useState("#22a06b");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("default");
  const [scrollbarPreset, setScrollbarPreset] = useState<"native" | "custom" | "hidden">("native");
  const [thumbColor, setThumbColor] = useState("#7c5cff");
  const [trackColor, setTrackColor] = useState("#202631");
  const [transparentTrack, setTransparentTrack] = useState(true);
  const scrollbar: DocumentEditorScrollbarOptions | undefined = scrollbarPreset === "hidden"
    ? { width: "none" }
    : scrollbarPreset === "custom"
      ? { thumbColor, trackColor: transparentTrack ? "transparent" : trackColor }
      : undefined;
  const chooseScheme = (next: ColorScheme) => {
    setColorScheme(next);
    if (next !== "default" && next !== "custom") {
      setPrimaryColor(schemes[next].primary);
      setSecondaryColor(schemes[next].secondary);
    }
  };
  const counts = useMemo(() => countDocument(value), [value]);

  return (
    <div
      {...getDocumentEditorScrollbarProps(scrollbar)}
      className="playground-scroll sunaissu-document-editor-scrollbar"
      role="region"
      aria-label="Document editor playground"
      tabIndex={0}
    >
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
              brandColors={colorScheme === "default" ? undefined : { primary: primaryColor, secondary: secondaryColor }}
              scrollbar={scrollbar}
              placeholder="Start a portable Markdown document…"
            />
          </div>

          <aside {...getDocumentEditorScrollbarProps(scrollbar)} className="inspector sunaissu-document-editor-scrollbar">
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
                    aria-pressed={theme === candidate}
                    onClick={() => setTheme(candidate)}
                  >
                    {candidate === "system" ? "auto" : candidate}
                  </button>
                ))}
              </div>
              <label htmlFor="editor-color-scheme">Color scheme</label>
              <select id="editor-color-scheme" value={colorScheme} onChange={(event) => chooseScheme(event.target.value as ColorScheme)}>
                <option value="default">Default</option>
                <option value="ocean">Ocean</option>
                <option value="forest">Forest</option>
                <option value="plum">Plum</option>
                <option value="custom">Custom</option>
              </select>
              {colorScheme !== "default" && (
                <div className="brand-color-grid">
                  <label><span>Primary</span><input type="color" value={primaryColor} onChange={(event) => { setPrimaryColor(event.target.value); setColorScheme("custom"); }} /></label>
                  <label><span>Secondary</span><input type="color" value={secondaryColor} onChange={(event) => { setSecondaryColor(event.target.value); setColorScheme("custom"); }} /></label>
                </div>
              )}
            </div>

            <details className="scrollbar-settings">
              <summary>Scrollbar</summary>
              <div className="control-group">
                <label htmlFor="editor-scrollbar">Appearance</label>
                <select id="editor-scrollbar" value={scrollbarPreset} onChange={(event) => setScrollbarPreset(event.target.value as typeof scrollbarPreset)}>
                  <option value="native">Native</option>
                  <option value="custom">Custom colors</option>
                  <option value="hidden">Hidden</option>
                </select>
                {scrollbarPreset === "custom" && (
                  <>
                    <div className="brand-color-grid">
                      <label><span>Thumb</span><input aria-label="Scrollbar thumb color" type="color" value={thumbColor} onChange={(event) => setThumbColor(event.target.value)} /></label>
                      <label><span>Track</span><input aria-label="Scrollbar track color" type="color" value={trackColor} disabled={transparentTrack} onChange={(event) => setTrackColor(event.target.value)} /></label>
                    </div>
                    <label className="transparent-track"><input type="checkbox" checked={transparentTrack} onChange={(event) => setTransparentTrack(event.target.checked)} />Transparent track</label>
                  </>
                )}
              </div>
            </details>

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
          <pre {...getDocumentEditorScrollbarProps(scrollbar)}>{value}</pre>
        </details>
      <footer className="maker-credit"><span>Made by</span><img className="maker-wordmark" src={sunaissuMark} alt="Sunaissu" width="81" height="26" /><img className="maker-monogram" src={bgMark} alt="bg_" width="26" height="13" /></footer>
      </main>
    </div>
  );
}
