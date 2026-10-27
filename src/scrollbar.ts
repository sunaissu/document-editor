import type { CSSProperties } from "react";

export interface DocumentEditorScrollbarOptions {
  /** CSS color for the draggable thumb. Omit both colors for browser styling. */
  thumbColor?: string;
  /** CSS color for the track. Defaults to transparent when a thumb color is set. */
  trackColor?: string;
  /** `none` hides scrollbars without disabling scrolling. */
  width?: "auto" | "thin" | "none";
}

/** Use with .sunaissu-document-editor-scrollbar on a host-owned scroll container. */
export function getDocumentEditorScrollbarStyle(options: DocumentEditorScrollbarOptions = {}): CSSProperties {
  const thumb = options.thumbColor?.trim();
  const track = options.trackColor?.trim();
  return {
    "--document-scrollbar-width": options.width ?? "auto",
    "--document-scrollbar-color": thumb || track
      ? `${thumb || "currentColor"} ${track || "transparent"}`
      : "auto",
    "--document-scrollbar-thumb": thumb || "currentColor",
    "--document-scrollbar-track": track || "transparent",
    "--document-scrollbar-size": options.width === "thin" ? "8px" : "12px",
  } as CSSProperties;
}

/** Apply these props to a host-owned scroll container, including browser fallbacks. */
export function getDocumentEditorScrollbarProps(options: DocumentEditorScrollbarOptions = {}) {
  const mode = options.width === "none"
    ? "hidden"
    : options.thumbColor?.trim() || options.trackColor?.trim()
      ? "custom"
      : "native";
  return {
    className: "sunaissu-document-editor-scrollbar",
    "data-document-editor-scrollbar": mode,
    style: getDocumentEditorScrollbarStyle(options),
  };
}
