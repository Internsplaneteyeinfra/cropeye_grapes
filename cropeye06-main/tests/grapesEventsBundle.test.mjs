import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/utils/grapesEventsBundle.ts", import.meta.url),
  "utf8",
);
const stub = `
export function getGrapesMainBaseUrl(){ return "https://example.test/main"; }
export function getGrapesSefBaseUrl(){ return "https://example.test/sef"; }
`;
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText.replace(
  /from ["']\.\/serviceUrls["']/,
  `from "data:text/javascript;base64,${Buffer.from(stub).toString("base64")}"`,
);
const bundle = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const {
  averageAgroStatsForPlots,
  buildGrapesBundle,
  extractAgroStatsPlotRow,
  fetchFieldScoreAveragesForPlots,
  fetchGrapesSummary,
  fetchYieldAveragesForPlots,
  fieldScoreFromAnalyzePayload,
  findPlotInFarmerProfile,
  mergeManagerDashboardCardMetrics,
  metricsFromAgroStatsRow,
  metricsFromGrapesSummary,
} = bundle;

const AGRO_ROW = {
  area_acres: 1.58,
  soil: { area_acres: 1.5838 },
  biomass: { mean: 1.28, min: 1.0, max: 1.5, total: 2.02 },
  brix_sugar: { sugar_yield: { mean: 8.4, min: 8.4, max: 8.4 } },
  current_growth_stage: null,
};

const YIELD_BUNDLE = buildGrapesBundle(
  {
    expected_yield_ton_per_acre: 14.2,
    underground_biomass_tons: 5.35,
    total_biomass_tons: 44.55,
  },
  {},
  {},
);

test("maps agroStats row area and average biomass without inventing crop stage", () => {
  const metrics = metricsFromAgroStatsRow(AGRO_ROW);
  assert.equal(metrics.area, 1.58);
  assert.equal(metrics.biomass, 1.28);
  assert.equal(metrics.sugarYieldMean, 8.4);
  assert.equal(metrics.growthStage, null);
});

test("maps /grapes/summary keys and leaves missing fields unset", () => {
  const metrics = metricsFromGrapesSummary({
    total_field_area: 3.1,
    expected_yield_ton_per_acre: 12.5,
    avg_biomass: 4.2,
    cci: 0.41,
    stress: { total_days: 6, total_events: 2 },
    average_crop_stage: "Shoot Development",
  });
  assert.equal(metrics.area, 3.1);
  assert.equal(metrics.actualYield, 12.5);
  assert.equal(metrics.biomass, 4.2);
  assert.equal(metrics.cci, 0.41);
  assert.equal(metrics.stressTotalDays, 6);
  assert.equal(metrics.stressCount, 2);
  assert.equal(metrics.growthStage, "Shoot Development");
  assert.equal(metrics.fieldScore, null);
  assert.equal(metricsFromGrapesSummary(null).area, undefined);
});

test("findPlotInFarmerProfile matches nested farm fastapi_plot_id", () => {
  const plot = findPlotInFarmerProfile(
    {
      plots: [
        {
          id: "plot-uuid",
          farms: [{ fastapi_plot_id: "918_862", area_acres: 1.58 }],
        },
      ],
    },
    "918_862",
  );
  assert.equal(plot?.id, "plot-uuid");
});

test("extractAgroStatsPlotRow reads keyed agroStats payload", () => {
  const row = extractAgroStatsPlotRow(
    { "918_862": AGRO_ROW },
    "918_862",
    null,
  );
  assert.equal(row.area_acres, 1.58);
});

test("manager cards prefer yield-estimation over agroStats averages and keep agro area", () => {
  const metrics = mergeManagerDashboardCardMetrics({
    agroRow: AGRO_ROW,
    grapesBundle: YIELD_BUNDLE,
    profile: {
      plots: [{ id: "plot-uuid", farms: [{ fastapi_plot_id: "918_862" }] }],
    },
    plotId: "918_862",
    stressData: { total_events: 0, total_days: 0, events: [] },
    irrigationData: { total_events: 1 },
    grapesSummary: null,
    fieldScore: 69.22,
    cci: 0.343,
  });
  assert.equal(metrics.area, 1.58);
  assert.equal(metrics.sugarYieldMean, 14.2);
  assert.equal(metrics.actualYield, 14.2);
  assert.equal(metrics.biomass, 5.35);
  assert.equal(metrics.totalBiomass, 44.55);
  assert.equal(metrics.biomassMin, null);
  assert.equal(metrics.biomassMax, null);
  assert.equal(metrics.fieldScore, 69.22);
  assert.equal(metrics.cci, 0.343);
  assert.equal(metrics.stressTotalDays, 0);
});

test("summary payload wins when the /grapes/summary route exists", () => {
  const metrics = mergeManagerDashboardCardMetrics({
    agroRow: AGRO_ROW,
    grapesBundle: YIELD_BUNDLE,
    profile: null,
    plotId: "918_862",
    stressData: { total_events: 0, total_days: 0 },
    grapesSummary: { total_field_area: 2.0, expected_yield: 10, cci: 0.5 },
    fieldScore: 69.22,
    cci: 0.343,
  });
  assert.equal(metrics.area, 2.0);
  assert.equal(metrics.sugarYieldMean, 10);
  assert.equal(metrics.cci, 0.5);
  assert.equal(metrics.fieldScore, 69.22);
});

test("fetchGrapesSummary returns null on 404 and does not POST", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    return { ok: false, status: 404, json: async () => ({ detail: "Not Found" }) };
  };
  const result = await fetchGrapesSummary(
    "https://example.test/events",
    "918_862",
    fetchImpl,
    500,
  );
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/grapes\/summary/);
  assert.equal(calls[0].method, "GET");
});

test("averages agroStats across officer plots: sum area, mean yield and biomass", () => {
  const metrics = averageAgroStatsForPlots(
    {
      "918_862": AGRO_ROW,
      "100_1": {
        area_acres: 2.42,
        biomass: { mean: 2.72, total: 4 },
        brix_sugar: { sugar_yield: { mean: 10 } },
        current_growth_stage: "Shoot Development",
      },
    },
    ["918_862", "100_1"],
  );
  assert.equal(metrics.area, 4);
  assert.equal(metrics.biomass, 2);
  assert.equal(metrics.sugarYieldMean, 9.2);
  assert.equal(metrics.growthStage, "Shoot Development");
});

test("averages yield-estimation payloads and skips failed plots", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 2) {
      return { ok: false, status: 500, text: async () => "err", json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({
        expected_yield_ton_per_acre: 14.2,
        underground_biomass_tons: 5.35,
        total_biomass_tons: 44.55,
      }),
    };
  };
  const metrics = await fetchYieldAveragesForPlots(
    "https://example.test/events",
    ["918_862", "bad"],
    fetchImpl,
    500,
  );
  assert.equal(metrics.sugarYieldMean, 14.2);
  assert.equal(metrics.biomass, 5.35);
  assert.equal(metrics.totalBiomass, 44.55);
});

test("reads field_score or overall_health from /analyze", () => {
  assert.equal(
    fieldScoreFromAnalyzePayload({
      plot_name: "918_862",
      field_score: 71.5,
      overall_health: 69.22,
    }),
    71.5,
  );
  assert.equal(
    fieldScoreFromAnalyzePayload({
      plot_name: "918_862",
      overall_health: 69.22,
    }),
    69.22,
  );
});

test("averages /analyze field scores across plots", async () => {
  const fetchImpl = async (url) => {
    const plot = String(url).includes("918_862") ? "918_862" : "100_1";
    return {
      ok: true,
      json: async () => ({
        plot_name: plot,
        overall_health: plot === "918_862" ? 69.22 : 80.78,
      }),
    };
  };
  const metrics = await fetchFieldScoreAveragesForPlots(
    ["918_862", "100_1"],
    500,
    fetchImpl,
  );
  assert.equal(metrics.fieldScore, 75);
});
