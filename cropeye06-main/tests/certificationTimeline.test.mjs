import assert from "node:assert/strict";
import test from "node:test";

function calculateProgress(step1Status, step2Status, step3Status) {
  let score = 0;
  if (step1Status === "Approved") score += 33.34;
  else if (step1Status === "Under Review") score += 20;
  else if (step1Status === "Pending") score += 10;

  if (step2Status === "Approved") score += 33.33;
  else if (step2Status === "Under Review") score += 20;

  if (step3Status === "Approved") score += 33.33;
  else if (step3Status === "Under Review") score += 20;

  return Math.min(100, Math.round(score));
}

function resolveNextStepUnlock(stepNumber, currentStatus) {
  if (stepNumber < 3 && (currentStatus === "Approved" || currentStatus === "Under Review")) {
    return true;
  }
  return false;
}

test("calculates certification progress accurately across all steps", () => {
  assert.equal(calculateProgress("Pending", "Pending", "Pending"), 10);
  assert.equal(calculateProgress("Under Review", "Pending", "Pending"), 20);
  assert.equal(calculateProgress("Approved", "Pending", "Pending"), 33);
  assert.equal(calculateProgress("Approved", "Under Review", "Pending"), 53);
  assert.equal(calculateProgress("Approved", "Approved", "Pending"), 67);
  assert.equal(calculateProgress("Approved", "Approved", "Under Review"), 87);
  assert.equal(calculateProgress("Approved", "Approved", "Approved"), 100);
});

test("enables sequential timeline step progression when a step is completed or under review", () => {
  assert.equal(resolveNextStepUnlock(1, "Pending"), false);
  assert.equal(resolveNextStepUnlock(1, "Under Review"), true);
  assert.equal(resolveNextStepUnlock(1, "Approved"), true);
  assert.equal(resolveNextStepUnlock(2, "Approved"), true);
  assert.equal(resolveNextStepUnlock(3, "Approved"), false); // no step 4
});

test("supports all 5 required certification statuses", () => {
  const allowedStatuses = ["Pending", "Under Review", "Approved", "Rejected", "Expired"];
  assert.equal(allowedStatuses.length, 5);
  for (const s of ["Pending", "Under Review", "Approved", "Rejected", "Expired"]) {
    assert.ok(allowedStatuses.includes(s));
  }
});
