import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";
import localPdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";

const CDN_PDF_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

type ProgressCallback = (message: string, progress: number) => void;

function configurePdfWorker(src: string) {
  if (GlobalWorkerOptions.workerSrc !== src) {
    GlobalWorkerOptions.workerSrc = src;
  }
}

export async function openPdfDocument(file: File) {
  const data = await file.arrayBuffer();
  configurePdfWorker(CDN_PDF_WORKER);
  try {
    return await getDocument({
      data: data.slice(0),
      isEvalSupported: false,
    }).promise;
  } catch {
    configurePdfWorker(localPdfWorkerUrl);
    return getDocument({
      data: data.slice(0),
      isEvalSupported: false,
    }).promise;
  }
}

export async function createBrowserOcrWorker(
  onProgress: ProgressCallback,
  readingLabel = "Reading form text",
) {
  return createWorker("eng", undefined, {
    // tesseract.js otherwise throws inside the worker message handler
    errorHandler: () => {},
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress(
          readingLabel,
          Math.round(Math.max(0, Math.min(1, message.progress)) * 100),
        );
      } else if (message.status.startsWith("loading")) {
        onProgress("Loading the browser OCR engine", 5);
      }
    },
  });
}

export function formatOcrError(err: unknown, kind: "form" | "soil"): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const n = raw.toLowerCase();
  if (
    /failed to fetch|networkerror|load tesseract|failed to load|importscripts|fake worker|dynamically imported|workerSrc|setting up fake worker/i.test(
      n,
    )
  ) {
    return kind === "soil"
      ? "Could not start the OCR engine. Refresh the page, check internet, and try again. A typed PDF often works without scanning."
      : "Could not start the OCR engine. Refresh the page, check internet, and try again. A typed PDF (GrapeNet or 7/12) often works without scanning.";
  }
  return (
    raw ||
    (kind === "soil"
      ? "Could not read this soil report. Try a clearer PDF or image."
      : "Could not read this form. Try a clearer PDF or image.")
  );
}
