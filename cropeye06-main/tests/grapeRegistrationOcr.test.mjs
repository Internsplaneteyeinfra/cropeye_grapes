import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/utils/grapeRegistrationOcrMapping.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mapping = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const {
  countFilledRegistrationFields,
  getHarvestWorkflowStep,
  looksLikeLandRecord712,
  makeGrapeRegistrationOcrDraft,
  mapRegistrationOcrLines,
  parseGrapeRegistrationOcrDraft,
} = mapping;

test("maps registration form labels to OCR values and confidence", () => {
  const fields = mapRegistrationOcrLines([
    { text: "Full name of grape grower: Asha Patil", confidence: 94 },
    { text: "Correspondence address: Nashik, Maharashtra", confidence: 87 },
    { text: "Mobile number: 9876543210", confidence: 91 },
    { text: "Village: Dindori", confidence: 88 },
    { text: "Taluka: Dindori", confidence: 86 },
    { text: "District: Nashik", confidence: 89 },
    { text: "State: Maharashtra", confidence: 93 },
    { text: "Survey no: 124", confidence: 78 },
    { text: "Plot number: 12", confidence: 82 },
    { text: "Grape variety: Thompson Seedless", confidence: 73 },
    { text: "Age of plot: 3 to 13 years", confidence: 69 },
    {
      text: "Grape variety and area under variety (acres): Sonaka 2 acres",
      confidence: 61,
    },
    { text: "Father's / husband's name: Ramesh Patil", confidence: 77 },
  ]);

  assert.equal(fields.fullName.value, "Asha Patil");
  assert.equal(fields.mobile.value, "9876543210");
  assert.equal(fields.village.value, "Dindori");
  assert.equal(fields.gatNumber.value, "124");
  assert.equal(fields.plotNumber.value, "12");
  assert.equal(fields.variety.value, "Thompson Seedless");
  assert.equal(fields.variety.confidence, 73);
  assert.equal(fields.areaAcres.value, "2");
  assert.equal(fields.relativeName.value, "Ramesh Patil");
  assert.equal(fields.areaAcres.confidence, 61);
});

test("keeps absent values empty and applies reviewed manual corrections to the draft", () => {
  const fields = mapRegistrationOcrLines([
    { text: "Full name of grape grower: Asha Patil", confidence: 95 },
    { text: "Mobile number: 98765 43210", confidence: 41 },
  ]);
  fields.address = { value: "12 Farm Road", confidence: 100, manual: true };
  fields.mobile = { value: "9876543210", confidence: 100, manual: true };
  fields.pinCode = { value: "422005", confidence: 100, manual: true };

  const draft = makeGrapeRegistrationOcrDraft(fields, "Asha", "Patil");
  assert.deepEqual(draft.profile, {
    first_name: "Asha",
    last_name: "Patil",
    phone_number: "9876543210",
    address: "12 Farm Road",
    state: "",
    district: "",
    taluka: "",
  });
  assert.equal(draft.plot.pinCode, "422005");
  assert.equal(fields.plotAge.value, "");
  assert.deepEqual(parseGrapeRegistrationOcrDraft(draft), draft);
});

test("rejects malformed reviewed details instead of silently filling fields", () => {
  assert.equal(parseGrapeRegistrationOcrDraft({ profile: {}, plot: {} }), null);
});

test("requires an explicit harvest answer and routes the harvested branch to the record book", () => {
  assert.equal(getHarvestWorkflowStep(null), "confirm-harvest");
  assert.equal(getHarvestWorkflowStep(false), "registration");
  assert.equal(getHarvestWorkflowStep(true), "record-book");
});

test("maps 7/12 land-record English labels to grower and plot fields", () => {
  const fields = mapRegistrationOcrLines([
    { text: "7/12 Extract / Record of Rights", confidence: 90 },
    { text: "Occupant / Account holder: Asha Patil", confidence: 92 },
    { text: "Village / गाव : Dindori", confidence: 88 },
    { text: "Taluka / तालुका : Dindori", confidence: 86 },
    { text: "District / जिल्हा : Nashik", confidence: 89 },
    { text: "Survey No. / Gat No. : 124", confidence: 80 },
    { text: "Area : 0.80 Hectare", confidence: 75 },
  ]);

  assert.equal(fields.fullName.value, "Asha Patil");
  assert.equal(fields.village.value, "Dindori");
  assert.equal(fields.taluka.value, "Dindori");
  assert.equal(fields.district.value, "Nashik");
  assert.equal(fields.gatNumber.value, "124");
  assert.equal(fields.areaAcres.value, "1.98");
  assert.ok(countFilledRegistrationFields(fields) >= 6);
  assert.equal(looksLikeLandRecord712("farmer-7-12.pdf"), true);
  assert.equal(looksLikeLandRecord712("satbara-extract.pdf"), true);
  assert.equal(looksLikeLandRecord712("grape-registration-form.pdf"), false);
});

test("maps 7/12 Marathi labels and next-line values without treating the file as soil", () => {
  const fields = mapRegistrationOcrLines([
    { text: "सातबारा उतारा", confidence: 90 },
    { text: "खातेदार", confidence: 91 },
    { text: "आशा पाटील", confidence: 90 },
    { text: "गाव : दिंडोरी", confidence: 88 },
    { text: "तालुका : दिंडोरी", confidence: 86 },
    { text: "जिल्हा : नाशिक", confidence: 89 },
    { text: "गट नंबर : 45", confidence: 80 },
    { text: "क्षेत्र : 1.2 हेक्टर", confidence: 77 },
  ]);

  assert.equal(fields.fullName.value, "आशा पाटील");
  assert.equal(fields.village.value, "दिंडोरी");
  assert.equal(fields.taluka.value, "दिंडोरी");
  assert.equal(fields.district.value, "नाशिक");
  assert.equal(fields.gatNumber.value, "45");
  assert.equal(fields.areaAcres.value, "2.97");
  assert.equal(looksLikeLandRecord712("सातबारा उतारा खातेदार"), true);
});
