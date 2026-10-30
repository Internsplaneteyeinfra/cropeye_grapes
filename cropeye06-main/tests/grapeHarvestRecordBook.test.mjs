import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const source = await readFile(
  new URL("../src/utils/grapeHarvestRecordBook.ts", import.meta.url),
  "utf8",
);
const pdfLibUrl = pathToFileURL(
  createRequire(import.meta.url).resolve("pdf-lib"),
).href;
const sourceWithResolvedPdfLib = source.replace(
  'from "pdf-lib";',
  `from "${pdfLibUrl}";`,
);
const compiled = ts.transpileModule(sourceWithResolvedPdfLib, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const { createGrapeHarvestRecordBookPdf } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("creates a 15-page record book with reviewed farmer, plot, and harvest entries", async () => {
  const template = await PDFDocument.create();
  for (let page = 0; page < 15; page += 1) template.addPage([595.28, 841.89]);
  const templateBytes = await template.save();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(templateBytes, { status: 200 });

  try {
    const output = await createGrapeHarvestRecordBookPdf(
      {
        profile: {
          first_name: "Asha",
          last_name: "Patil",
          phone_number: "9876543210",
          address: "Nashik farm road",
          state: "Maharashtra",
          district: "Nashik",
          taluka: "Dindori",
        },
        plot: {
          plotLocation: "Dindori vineyard",
          gatNumber: "124",
          plotNumber: "P-12",
          village: "Dindori",
          pinCode: "422005",
          variety: "Thompson Seedless",
          areaAcres: "",
          plotAge: "",
          irrigationDetails: "",
          pruningCycles: "",
        },
        supplemental: {
          relativeName: "Ramesh Patil",
          plotLocation: "Dindori vineyard",
          areaAcres: "",
          pruningCycles: "",
        },
      },
      {
        plannedHarvestDate: "",
        preHarvestInspectionDate: "",
        recordsReviewedBy: "",
        residueSampleId: "SAMPLE-42",
        residueSamplingDate: "",
        laboratoryName: "Nashik Lab",
        laboratoryReportNumber: "",
        laboratoryReportDate: "",
        testResult: "Pending",
        correctiveAction: "",
        harvestDate: "",
        harvestPlotNumber: "P-12",
        harvestLotId: "LOT-7",
        harvestVariety: "Thompson Seedless",
        harvestQuantityKg: "250",
        harvestSupervisor: "Asha Patil",
        totalHarvestedKg: "",
        rejectedQuantityKg: "",
        quantitySentForPackingKg: "",
        declarationDate: "",
      },
      "https://template.test/grape-farm-record-book.pdf",
    );

    const pdf = await getDocument({ data: output }).promise;
    assert.equal(pdf.numPages, 15);

    const pageText = async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.map((item) => item.str).join(" ");
    };
    assert.match(await pageText(2), /Asha Patil/);
    assert.match(await pageText(2), /Ramesh Patil/);
    assert.match(await pageText(3), /124/);
    assert.match(await pageText(11), /SAMPLE-42/);
    assert.match(await pageText(11), /Pending/);
    const harvestText = await pageText(12);
    assert.match(harvestText, /LOT-7/);
    assert.match(harvestText, /250/);
    assert.doesNotMatch(harvestText, /202\d/);
    await pdf.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports a missing template instead of returning an empty success PDF", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });

  try {
    await assert.rejects(
      createGrapeHarvestRecordBookPdf(
        {
          profile: {
            first_name: "",
            last_name: "",
            phone_number: "",
            address: "",
            state: "",
            district: "",
            taluka: "",
          },
          plot: {
            plotLocation: "",
            gatNumber: "",
            plotNumber: "",
            village: "",
            pinCode: "",
            variety: "",
            areaAcres: "",
            plotAge: "",
            irrigationDetails: "",
            pruningCycles: "",
          },
          supplemental: {
            relativeName: "",
            plotLocation: "",
            areaAcres: "",
            pruningCycles: "",
          },
        },
        {
          plannedHarvestDate: "",
          preHarvestInspectionDate: "",
          recordsReviewedBy: "",
          residueSampleId: "",
          residueSamplingDate: "",
          laboratoryName: "",
          laboratoryReportNumber: "",
          laboratoryReportDate: "",
          testResult: "",
          correctiveAction: "",
          harvestDate: "",
          harvestPlotNumber: "",
          harvestLotId: "",
          harvestVariety: "",
          harvestQuantityKg: "",
          harvestSupervisor: "",
          totalHarvestedKg: "",
          rejectedQuantityKg: "",
          quantitySentForPackingKg: "",
          declarationDate: "",
        },
        "https://template.test/missing.pdf",
      ),
      /HTTP 404/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
