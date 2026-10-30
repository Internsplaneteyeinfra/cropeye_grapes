import {
  countFilledRegistrationFields,
  looksLikeLandRecord712,
  mapRegistrationOcrLines,
} from "./grapeRegistrationOcrMapping";
import type { RegistrationOcrResult } from "./grapeRegistrationOcrMapping";
import { createBrowserOcrWorker, openPdfDocument } from "./ocrRuntime";

export const MAX_REGISTRATION_DOCUMENT_BYTES = 15 * 1024 * 1024;

export {
  GRAPE_REGISTRATION_OCR_DRAFT_KEY,
  makeGrapeRegistrationOcrDraft,
  parseGrapeRegistrationOcrDraft,
} from "./grapeRegistrationOcrMapping";
export type {
  GrapeRegistrationOcrDraft,
  RegistrationOcrField,
  RegistrationOcrFieldKey,
  RegistrationOcrResult,
} from "./grapeRegistrationOcrMapping";

type ProgressCallback = (message: string, progress: number) => void;

function getSupportedFileType(file: File): "pdf" | "image" | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  const supportedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/bmp",
  ];
  const supportedImageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "tif",
    "tiff",
    "bmp",
  ];
  if (
    supportedImageTypes.includes(file.type) ||
    supportedImageExtensions.includes(extension ?? "")
  ) {
    return "image";
  }
  return null;
}

async function renderImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxPixels = 40_000_000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image for reading.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function renderPdfPages(
  file: File,
  onProgress: ProgressCallback,
): Promise<HTMLCanvasElement[]> {
  const pdfDocument = await getDocument({
    data: await file.arrayBuffer(),
  const pdfDocument = await openPdfDocument(file);
  try {
    if (pdfDocument.numPages > 20) {
      throw new Error(
        "The PDF has more than 20 pages. Split it into smaller files and try again.",
      );
    }

    for (
      let pageNumber = 1;
      pageNumber <= pdfDocument.numPages;
      pageNumber += 1
    ) {
      onProgress(
        `Preparing PDF page ${pageNumber} of ${pdfDocument.numPages}`,
        0,
      );
      const page = await pdfDocument.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 2 });
      const scale = Math.min(
        1,
        3200 / initialViewport.width,
        3200 / initialViewport.height,
      );
      const viewport = page.getViewport({ scale: 2 * scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not prepare a PDF page for reading.");
      }
      await page.render({ canvasContext: context, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  } catch (error) {
    canvases.forEach((canvas) => {
      canvas.width = 0;
      canvas.height = 0;
    });
    throw error;
  } finally {
    await pdfDocument.destroy();
  }
}

export async function scanGrapeRegistrationForm(
  file: File,
async function extractPdfTextLines(
  file: File,
  onProgress: ProgressCallback,
): Promise<{ text: string; confidence: number }[]> {
  const pdfDocument = await openPdfDocument(file);
  const lines: { text: string; confidence: number }[] = [];
  try {
    const pageCount = Math.min(pdfDocument.numPages, 20);
    for (let i = 1; i <= pageCount; i += 1) {
      onProgress(
        `Reading document text page ${i} of ${pageCount}`,
        Math.round((i / pageCount) * 40),
      );
      const page = await pdfDocument.getPage(i);
      const content = await page.getTextContent();
      const rowMap = new Map<number, string[]>();
      for (const item of content.items) {
        if (!item || typeof item !== "object" || !("str" in item)) continue;
        const str = String((item as { str?: string }).str || "").trim();
        if (!str) continue;
        const transform = (item as { transform?: number[] }).transform;
        const y = transform && transform.length >= 6 ? Math.round(transform[5]) : 0;
        const bucket = rowMap.get(y) ?? [];
        bucket.push(str);
        rowMap.set(y, bucket);
      }
      [...rowMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, parts]) => {
          lines.push({ text: parts.join(" "), confidence: 92 });
        });
    }
    return lines;
  } finally {
    await pdfDocument.destroy();
  }
}

export async function scanGrapeRegistrationForm(
  file: File,
  onProgress: ProgressCallback,
): Promise<RegistrationOcrResult> {
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_REGISTRATION_DOCUMENT_BYTES) {
    throw new Error("The selected file is larger than 15 MB.");
  }

  const fileType = getSupportedFileType(file);
  if (!fileType) {
    throw new Error(
      "Choose a PDF or image file (JPG, PNG, WebP, TIFF, or BMP).",
    );
  }

  const landRecord = looksLikeLandRecord712(file.name);

  if (fileType === "pdf") {
    try {
      const textLines = await extractPdfTextLines(file, onProgress);
      const blob = textLines.map((line) => line.text).join("\n");
      const fromText = mapRegistrationOcrLines(textLines);
      const filled = countFilledRegistrationFields(fromText);
      const isLandRecord = landRecord || looksLikeLandRecord712(blob);
      if (filled >= (isLandRecord ? 2 : 3)) {
        onProgress("Preparing fields for review", 100);
        return fromText;
      }
    } catch {
      /* fall through to image OCR */
    }
  }

  const canvases =
    fileType === "pdf"
      ? await renderPdfPages(file, onProgress)
      : [await renderImage(file)];
  let worker: Awaited<ReturnType<typeof createBrowserOcrWorker>> | null = null;

  try {
    worker = await createBrowserOcrWorker(onProgress);
    for (let index = 0; index < canvases.length; index += 1) {
      onProgress(`Scanning page ${index + 1} of ${canvases.length}`, 0);
      const { data } = await worker.recognize(canvases[index]);
      const pageLines =
        data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.map((line) => ({
              text: line.text.trim(),
              confidence: line.confidence,
            })),
          ),
        ) ?? [];
      const fallbackLines = data.text
        .split(/\r?\n/)
        .map((text) => ({ text: text.trim(), confidence: data.confidence }));
      lines.push(...(pageLines.length > 0 ? pageLines : fallbackLines));
    }

    onProgress("Preparing fields for review", 100);
    return mapRegistrationOcrLines(lines);
  } finally {
    try {
      await worker?.terminate();
    } finally {
      canvases.forEach((canvas) => {
        canvas.width = 0;
        canvas.height = 0;
      });
    }
  }
}
