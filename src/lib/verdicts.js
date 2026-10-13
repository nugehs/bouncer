export const STATUS_FILTERS = ["all", "fail", "unknown"];

/** "fail" -> fails only; "unknown" -> fails + unknowns (everything not passing); "all" -> everything. */
export function statusMatches(status, filter = "all") {
  if (filter === "fail") return status === "fail";
  if (filter === "unknown") return status !== "pass";
  return true;
}

export function assertStatusFilter(filter) {
  if (!STATUS_FILTERS.includes(filter)) throw new Error(`Invalid status filter "${filter}". Use one of: ${STATUS_FILTERS.join(", ")}.`);
  return filter;
}

export const UNKNOWN_REASONS = {
  "surface-not-located": "surface not located in this repo",
  "unreadable-only": "only binary/unreadable files matched (e.g. PDF) — content not verified",
  "precondition-not-met": "rule does not apply: its precondition was not found",
  "language-not-present": "no files in the languages this rule targets",
};

export const reasonText = (r) => UNKNOWN_REASONS[r] || "can't determine";
