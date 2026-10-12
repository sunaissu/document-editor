import { useEffect, useRef, useState } from "react";
import { escapeMarkdownLabel, markdownDestination } from "./markdown";
import { safeDocumentImage } from "./parser";

export interface UploadedDocumentImage {
  url: string;
  alt?: string;
  /** Plain text inserted beneath the image. */
  caption?: string;
}

export type DocumentImageUpload = (file: File, options: { signal: AbortSignal }) => Promise<UploadedDocumentImage>;

export function validateDocumentImageFile(file: Pick<File, "size" | "type">): void {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, GIF, or WebP image");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Images must be nonempty and at most 5 MiB");
}

export function uploadedImageMarkdown(image: UploadedDocumentImage): string {
  if (!image || typeof image.url !== "string" || safeDocumentImage(image.url) === "#") throw new Error("The upload returned an unsupported image URL");
  const url = safeDocumentImage(image.url);
  if (image.alt !== undefined && typeof image.alt !== "string") throw new Error("The upload returned an invalid description");
  if (image.caption !== undefined && typeof image.caption !== "string") throw new Error("The upload returned an invalid caption");
  const caption = image.caption?.replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>~!#+=.\-])/g, "\\$1");
  return `![${escapeMarkdownLabel(image.alt || "")}](${markdownDestination(url)})` + (caption ? "\n\n" + caption : "");
}

function checkImageDimensions(file: File, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image(), url = URL.createObjectURL(file);
    const finish = (error?: Error) => {
      image.onload = null; image.onerror = null;
      signal.removeEventListener("abort", abort);
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve();
    };
    const abort = () => { image.src = ""; finish(new Error("Upload cancelled")); };
    image.onload = () => finish(!image.naturalWidth || image.naturalWidth * image.naturalHeight > 16_000_000 ? new Error("Images may contain at most 16 million pixels") : undefined);
    image.onerror = () => finish(new Error("This image could not be decoded"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else image.src = url;
  });
}

export function useDocumentImageUpload(upload: DocumentImageUpload | undefined, value: string, readOnly: boolean, canInsert: () => boolean, captureInsert: () => (markdown: string) => boolean) {
  const [pending, setPending] = useState(false), [status, setStatus] = useState("");
  const active = useRef<AbortController | null>(null);
  const latest = useRef({ value, readOnly, upload, canInsert });
  latest.current = { value, readOnly, upload, canInsert };
  useEffect(() => {
    if (active.current) {
      active.current.abort(); active.current = null; setPending(false);
      setStatus("Document or permissions changed. Select the image again to retry.");
    }
  }, [value, readOnly, upload]);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const cancel = () => { active.current?.abort(); active.current = null; setPending(false); setStatus("Upload cancelled"); };
  const request = async (file: File) => {
    if (!upload || readOnly || !canInsert()) return;
    active.current?.abort();
    const controller = new AbortController(), base = value;
    const insert = captureInsert();
    active.current = controller; setPending(true); setStatus("Uploading image…");
    try {
      validateDocumentImageFile(file);
      await checkImageDimensions(file, controller.signal);
      if (controller.signal.aborted) return;
      const result = await upload(file, { signal: controller.signal });
      if (controller.signal.aborted || active.current !== controller) return;
      if (latest.current.readOnly || latest.current.value !== base || !latest.current.canInsert()) throw new Error("Document changed. Select the image again to retry.");
      const markdown = uploadedImageMarkdown(result);
      if (!insert(markdown)) throw new Error("The insertion point changed. Select the image again to retry.");
      active.current = null; setStatus("Image inserted");
    } catch (error) {
      if (!controller.signal.aborted && active.current === controller) setStatus(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return { request, cancel, pending, status };
}
