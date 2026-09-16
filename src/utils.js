/**
 * Normalizes any variation of "북미JV" to "HSBMA" across all parts of the application.
 * Handles: "북미JV", "북미 JV", "북미-JV", "북미_JV", "북미 jv", standalone "북미", etc.
 */
export const normalizeJVName = s => {
  if (typeof s !== "string") return s || "";
  let res = s.replace(/북미[\s-_]*JV/gi, "HSBMA");
  res = res.replace(/\b북미\b/g, "HSBMA");
  res = res.replace(/북미(?=[\s-_]*(?:\d+L|Line|라인|ESS|배터리|공장))/gi, "HSBMA");
  if (res.trim() === "북미") res = "HSBMA";
  return res;
};
