import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../src/utils/soilAnalysisOcr.ts");
const source = readFileSync(srcPath, "utf8");

// Strip browser-only imports for Node unit test of the mapper
const stripped = source
  .replace(/import[\s\S]*?from ["']pdfjs-dist["'];?\n/, "")
  .replace(/import[\s\S]*?from ["']pdfjs-dist\/build\/pdf\.worker[^"']+["'];?\n/, "")
  .replace(/import[\s\S]*?from ["']tesseract\.js["'];?\n/, "")
  .replace(/GlobalWorkerOptions\.workerSrc\s*=\s*pdfWorkerUrl;\n?/, "");

const { code } = transformSync(stripped, {
  loader: "ts",
  format: "cjs",
  target: "node18",
});

const require = createRequire(import.meta.url);
const modulePath = path.join(__dirname, ".soilAnalysisOcr.tmp.cjs");
import { writeFileSync, unlinkSync } from "node:fs";
writeFileSync(modulePath, code);
const mod = require(modulePath);
unlinkSync(modulePath);

const { mapSoilAnalysisOcrLines, soilDetailsFromOcr, mergeSoilDetailsFromOcr } = mod;

function lines(...texts) {
  return texts.map((text) => ({ text, confidence: 88 }));
}

{
  const result = mapSoilAnalysisOcrLines(
    lines(
      "Soil Health Card",
      "Name of the Farmer : Ramesh Patil",
      "Mobile Number : 9876543210",
      "Village : Dindori",
      "Survey No : 123/4",
      "Available Nitrogen (N) : 245 kg/ha",
      "Available Phosphorus (P) : 18.5 kg/ha",
      "Available Potassium (K) : 210 kg/ha",
      "pH : 7.2",
      "Organic Carbon : 0.65 %",
      "CEC : 12.4",
      "Iron (Fe) : 4.8 ppm",
      "Bulk Density : 1.35",
    ),
  );
  const soil = soilDetailsFromOcr(result);
  assert.equal(soil.nitrogen, "245");
  assert.equal(soil.phosphorus, "18.5");
  assert.equal(soil.potassium, "210");
  assert.equal(soil.soil_ph, "7.2");
  assert.equal(soil.organic_carbon, "0.65");
  assert.equal(soil.soil_organic_carbon, "0.65");
  assert.equal(soil.cec, "12.4");
  assert.equal(soil.fe, "4.8");
  assert.equal(soil.bulk_density, "1.35");
  assert.equal(result.farmerName.value, "Ramesh Patil");
  assert.equal(result.mobile.value, "9876543210");
  assert.equal(result.village.value, "Dindori");
  assert.equal(result.gatNumber.value, "123/4");
}

{
  // Value on next line (table layout)
  const result = mapSoilAnalysisOcrLines(
    lines("Available Nitrogen", "312", "Available Phosphorus", "22", "pH", "6.8"),
  );
  assert.equal(result.nitrogen.value, "312");
  assert.equal(result.phosphorus.value, "22");
  assert.equal(result.soil_ph.value, "6.8");
}

{
  const merged = mergeSoilDetailsFromOcr(
    { nitrogen: "10", phosphorus: "", potassium: "5", soil_ph: "", cec: "", organic_carbon: "", bulk_density: "", fe: "", soil_organic_carbon: "" },
    { nitrogen: "", phosphorus: "20", potassium: "", soil_ph: "7", cec: "", organic_carbon: "", bulk_density: "", fe: "", soil_organic_carbon: "" },
  );
  assert.equal(merged.nitrogen, "10"); // keep existing when OCR empty
  assert.equal(merged.phosphorus, "20");
  assert.equal(merged.soil_ph, "7");
  assert.equal(merged.potassium, "5");
}

console.log("soilAnalysisOcr.test.mjs: ok");
