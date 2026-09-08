/** Grapes-only eligibility (strict crop_type === "grapes"). */

export function isGrapesOwnerHierarchyEligible(
  role: string | null | undefined,
  cropType: string | null | undefined,
): boolean {
  const r = String(role || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const isOwner = r === "owner" || r === "admin";
  const crop = String(cropType || "").trim().toLowerCase();
  return isOwner && crop === "grapes";
}
