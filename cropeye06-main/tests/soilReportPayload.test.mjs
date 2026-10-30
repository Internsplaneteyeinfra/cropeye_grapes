import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/utils/soilReportPayload.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const soilReport = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("extracts a farm ID without mistaking a plot ID for a farm ID", () => {
  assert.equal(
    soilReport.registeredFarmId({
      ids: { farms: [{ farm_id: 42 }], plots: [{ plot_id: 73 }] },
    }),
    42,
  );
  assert.equal(
    soilReport.registeredFarmId({
      data: { ids: { farm: { id: "51" } } },
    }),
    51,
  );
  assert.equal(
    soilReport.registeredFarmId({
      ids: { farm_id: 62, plot_id: 73 },
    }),
    62,
  );
  assert.equal(
    soilReport.registeredFarmId({ ids: { plots: [{ plot_id: 73 }] } }),
    null,
  );
});

test("creates an endpoint payload from only populated soil values", () => {
  assert.deepEqual(
    soilReport.createSoilReportPayload(42, {
      nitrogen: "12.5",
      phosphorus: "",
      soil_ph: 6.8,
    }),
    { farm: 42, nitrogen: 12.5, soil_ph: 6.8 },
  );
  assert.equal(soilReport.createSoilReportPayload(42, {}), null);
});

test("rejects invalid IDs and malformed soil values", () => {
  assert.throws(() => soilReport.createSoilReportPayload(0, { nitrogen: "2" }));
  assert.throws(() =>
    soilReport.createSoilReportPayload(42, { nitrogen: "12ppm" }),
  );
});
