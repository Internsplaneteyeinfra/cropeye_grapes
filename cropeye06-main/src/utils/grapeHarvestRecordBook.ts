import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { GrapeRegistrationOcrDraft } from "./grapeRegistrationOcrMapping";

export type HarvestRecordBookFields = {
  plannedHarvestDate: string;
  preHarvestInspectionDate: string;
  recordsReviewedBy: string;
  residueSampleId: string;
  residueSamplingDate: string;
  laboratoryName: string;
  laboratoryReportNumber: string;
  laboratoryReportDate: string;
  testResult: string;
  correctiveAction: string;
  harvestDate: string;
  harvestPlotNumber: string;
  harvestLotId: string;
  harvestVariety: string;
  harvestQuantityKg: string;
  harvestSupervisor: string;
  totalHarvestedKg: string;
  rejectedQuantityKg: string;
  quantitySentForPackingKg: string;
  declarationDate: string;
};

function drawField(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return;

  try {
    font.encodeText(text);
  } catch {
    throw new Error(
      "The record-book PDF supports Latin characters only. Please use Latin characters for the PDF fields, or complete those entries by hand.",
    );
  }

  const preferredSize = 8;
  const minimumSize = 5;
  const size = Math.min(
    preferredSize,
    (maxWidth / font.widthOfTextAtSize(text, preferredSize)) * preferredSize,
  );
  if (size < minimumSize) {
    throw new Error(
      "One of the record-book entries is too long to fit on its printed line. Shorten that entry before creating the PDF.",
    );
  }
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.08, 0.2, 0.14),
  });
}

function drawRows(
  page: PDFPage,
  font: PDFFont,
  rows: Array<[string, number, number, number]>,
): void {
  rows.forEach(([value, x, y, maxWidth]) => {
    drawField(page, font, value, x, y, maxWidth);
  });
}

export async function createGrapeHarvestRecordBookPdf(
  registration: GrapeRegistrationOcrDraft,
  fields: HarvestRecordBookFields,
  templateUrl = new URL(
    "grape-farm-record-book.pdf",
    document.baseURI,
  ).toString(),
): Promise<Uint8Array> {
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(
      `Could not load the harvest record-book template (HTTP ${response.status}).`,
    );
  }

  const document = await PDFDocument.load(await response.arrayBuffer());
  if (document.getPageCount() < 15) {
    throw new Error("The harvest record-book template is incomplete.");
  }

  const font = await document.embedFont(StandardFonts.Helvetica);
  const fullName = [registration.profile.first_name, registration.profile.last_name]
    .filter(Boolean)
    .join(" ");
  const villageTaluka = [registration.plot.village, registration.profile.taluka]
    .filter(Boolean)
    .join(", ");
  const plotId = fields.harvestPlotNumber || registration.plot.plotNumber || registration.plot.gatNumber;
  const variety = fields.harvestVariety || registration.plot.variety;

  drawRows(document.getPage(0), font, [
    [fullName, 220, 502, 300],
    [villageTaluka, 220, 476, 300],
    [plotId, 220, 450, 300],
    [variety, 220, 398, 300],
  ]);

  drawRows(document.getPage(1), font, [
    [fullName, 46, 741, 490],
    [registration.supplemental.relativeName, 46, 715, 490],
    [registration.profile.phone_number, 46, 689, 490],
    [registration.profile.address, 46, 637, 490],
    [registration.plot.village, 46, 611, 490],
    [registration.profile.taluka, 46, 585, 490],
    [registration.profile.district, 46, 559, 490],
    [registration.profile.state, 46, 533, 490],
    [registration.plot.pinCode, 46, 507, 490],
  ]);

  drawRows(document.getPage(2), font, [
    [registration.plot.gatNumber, 46, 741, 490],
    [registration.plot.plotLocation, 46, 716, 490],
    [registration.plot.variety, 46, 616, 490],
    [registration.plot.irrigationDetails, 46, 541, 490],
  ]);

  drawRows(document.getPage(10), font, [
    [fields.plannedHarvestDate, 46, 740, 490],
    [fields.preHarvestInspectionDate, 46, 713, 490],
    [fields.recordsReviewedBy, 46, 686, 490],
    [fields.residueSampleId, 46, 659, 490],
    [fields.residueSamplingDate, 46, 632, 490],
    [fields.laboratoryName, 46, 605, 490],
    [fields.laboratoryReportNumber, 46, 578, 490],
    [fields.laboratoryReportDate, 46, 551, 490],
    [fields.testResult, 46, 524, 490],
    [fields.correctiveAction, 46, 497, 490],
  ]);

  drawRows(document.getPage(11), font, [
    [fields.harvestDate, 49, 733, 62],
    [plotId, 117, 733, 68],
    [fields.harvestLotId, 191, 733, 108],
    [variety, 306, 733, 78],
    [fields.harvestQuantityKg, 391, 733, 70],
    [fields.harvestSupervisor, 469, 733, 80],
    [fields.totalHarvestedKg, 220, 389, 260],
    [fields.rejectedQuantityKg, 220, 363, 260],
    [fields.quantitySentForPackingKg, 220, 337, 260],
  ]);

  drawRows(document.getPage(14), font, [
    [fullName, 46, 680, 490],
    [fields.declarationDate, 46, 612, 490],
  ]);

  return document.save();
}
