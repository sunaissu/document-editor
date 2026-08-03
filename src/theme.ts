import { useSyncExternalStore, type CSSProperties } from "react";

export type DocumentEditorThemeMode = "light" | "dark" | "system";
export type DocumentEditorResolvedTheme = Exclude<DocumentEditorThemeMode, "system">;

/** Simple brand colors layered on top of the selected light/dark theme. */
export interface DocumentEditorBrandColors {
  primary?: string;
  secondary?: string;
}

export interface DocumentEditorTheme {
  background: string;
  surface: string;
  surfaceRaised: string;
  preview: string;
  codeBlock: string;
  statusBar: string;
  border: string;
  borderStrong: string;
  text: string;
  previewText: string;
  heading: string;
  muted: string;
  faint: string;
  placeholder: string;
  accent: string;
  accentSoft: string;
  success: string;
  quote: string;
  code: string;
  codeText: string;
  tag: string;
}

export const DOCUMENT_EDITOR_LIGHT_THEME: DocumentEditorTheme = {
  background: "#ffffff",
  surface: "#f8fafc",
  surfaceRaised: "#eef2f7",
  preview: "#fbfcfe",
  codeBlock: "#f4f6f9",
  statusBar: "#f8fafc",
  border: "#dce3eb",
  borderStrong: "#b9c5d2",
  text: "#202a35",
  previewText: "#344150",
  heading: "#111820",
  muted: "#5f6d7b",
  faint: "#85919e",
  placeholder: "#9ba6b2",
  accent: "#087ca7",
  accentSoft: "rgba(8, 124, 167, 0.08)",
  success: "#0f9f76",
  quote: "#5c6977",
  code: "#a14f09",
  codeText: "#334155",
  tag: "#23765c",
};

export const DOCUMENT_EDITOR_DARK_THEME: DocumentEditorTheme = {
  background: "#0b0d11",
  surface: "#0e1116",
  surfaceRaised: "#151920",
  preview: "#0d1014",
  codeBlock: "#090b0e",
  statusBar: "#0c0f13",
  border: "#252b34",
  borderStrong: "#3a4350",
  text: "#d9e0e8",
  previewText: "#cbd3dd",
  heading: "#edf2f7",
  muted: "#7f8996",
  faint: "#56606e",
  placeholder: "#4b5460",
  accent: "#7dd3fc",
  accentSoft: "rgba(125, 211, 252, 0.08)",
  success: "#73e2bd",
  quote: "#aeb8c5",
  code: "#f0bc84",
  codeText: "#cbd5e1",
  tag: "#a9dfcc",
};

function colorMix(color: string, amount: number): string {
  return `color-mix(in srgb, ${color} ${amount}%, transparent)`;
}

/** Converts two brand colors into the editor's semantic theme tokens. */
export function applyDocumentEditorBrandColors(
  theme: DocumentEditorTheme,
  brandColors?: DocumentEditorBrandColors,
): DocumentEditorTheme {
  if (!brandColors?.primary && !brandColors?.secondary) return theme;
  const nextTheme = { ...theme };

  if (brandColors.primary) {
    nextTheme.accent = brandColors.primary;
    nextTheme.accentSoft = colorMix(brandColors.primary, 10);
  }

  if (brandColors.secondary) {
    nextTheme.success = brandColors.secondary;
    nextTheme.tag = brandColors.secondary;
  }

  return nextTheme;
}

function getSystemTheme(): DocumentEditorResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeSystemTheme(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function useDocumentEditorResolvedTheme(
  mode: DocumentEditorThemeMode,
): DocumentEditorResolvedTheme {
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    (): DocumentEditorResolvedTheme => "light",
  );

  return mode === "system" ? systemTheme : mode;
}

export function getDocumentEditorThemeStyle(theme: DocumentEditorTheme): CSSProperties {
  return {
    "--document-bg": theme.background,
    "--document-surface": theme.surface,
    "--document-surface-raised": theme.surfaceRaised,
    "--document-preview": theme.preview,
    "--document-code-block": theme.codeBlock,
    "--document-statusbar": theme.statusBar,
    "--document-border": theme.border,
    "--document-border-strong": theme.borderStrong,
    "--document-text": theme.text,
    "--document-preview-text": theme.previewText,
    "--document-heading": theme.heading,
    "--document-muted": theme.muted,
    "--document-faint": theme.faint,
    "--document-placeholder": theme.placeholder,
    "--document-accent": theme.accent,
    "--document-accent-soft": theme.accentSoft,
    "--document-success": theme.success,
    "--document-quote": theme.quote,
    "--document-code": theme.code,
    "--document-code-text": theme.codeText,
    "--document-tag": theme.tag,
  } as CSSProperties;
}
