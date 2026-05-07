// backend/triageRules.js

// ============================================================
// 🏥 LEGACY: Hard-rule engine (kept for backward compat)
// COMPLAINT_RULES will be populated in a future iteration.
// ============================================================
const COMPLAINT_RULES = {
  // Red flag rules will be implemented here
};

const checkHardRules = (selectedComplaints, history) => {
  for (const complaint of selectedComplaints) {
    if (COMPLAINT_RULES[complaint]) {
      const result = COMPLAINT_RULES[complaint](selectedComplaints, history);
      if (result) return result;
    }
  }
  return null; // Let Gemini handle it if no hard rules match
};


// ============================================================
// 🚨 RED FLAG COMBINATION RULES
//
// Rules are checked globally against the full answers map,
// regardless of which chief complaint was selected.
//
// Each rule has:
//   id         – unique rule identifier
//   label      – human-readable description
//   priority   – "Critical" | "Urgent"
//   match(d)   – function that receives the flat {QuestionID: Answer}
//                map and returns true if the combination fires
//
// Combination logic follows the spreadsheet notation:
//   -->              required condition (must be true)
//   (+)              AND condition (all must be true)
//   (+) at least one OR  condition (at least one must be true)
// ============================================================
const RED_FLAG_COMBINATIONS = [

  // ── Rule 1 ─────────────────────────────────────────────────
  // prom_cardpain = Yes
  // (+) pain_01   = Central / Left side of chest
  // (+) pain_03   = Yes  (pain present now)
  {
    id: "combo_cardiac_central_now",
    label: "Cardiac chest pain – central/left location with current pain",
    priority: "Critical",
    match: (d) =>
      d["prom_cardpain"] === "Yes" &&
      (d["pain_01"] === "Central" || d["pain_01"] === "Left side of chest" || d["pain_01"] === "Central / Left side of chest") &&
      d["pain_03"] === "Yes",
  },

  // ── Rule 2 ─────────────────────────────────────────────────
  // prom_cardpain = Yes
  // (+) pain_01   = Central / Left side of chest
  {
    id: "combo_cardiac_central_location",
    label: "Cardiac chest pain – central/left location",
    priority: "Critical",
    match: (d) =>
      d["prom_cardpain"] === "Yes" &&
      (d["pain_01"] === "Central" || d["pain_01"] === "Left side of chest" || d["pain_01"] === "Central / Left side of chest"),
  },

  // ── Rule 3 ─────────────────────────────────────────────────
  // prom_cardpain = Yes
  // (+) at least one of:
  //       card_pain03B = Yes  (radiation to jaw)
  //       card_pain04B = Yes  (radiation to neck)
  //       card_pain05B = Yes  (radiation to arm)
  {
    id: "combo_cardiac_radiation",
    label: "Cardiac chest pain with radiation (jaw / neck / arm)",
    priority: "Critical",
    match: (d) =>
      d["prom_cardpain"] === "Yes" &&
      (
        d["card_pain03B"] === "Yes" ||
        d["card_pain04B"] === "Yes" ||
        d["card_pain05B"] === "Yes"
      ),
  },

  // ── Rule 4 ─────────────────────────────────────────────────
  // prom_cardpain = Yes
  // (+) prom_sob  = Yes
  {
    id: "combo_cardiac_with_sob",
    label: "Cardiac chest pain with shortness of breath",
    priority: "Critical",
    match: (d) =>
      d["prom_cardpain"] === "Yes" &&
      d["prom_sob"] === "Yes",
  },

  // ── Rule 5 ─────────────────────────────────────────────────
  // prom_sob    = Yes
  // (+) resp_sob09 = Yes  (wheeze)
  {
    id: "combo_sob_wheeze",
    label: "Shortness of breath with wheeze",
    priority: "Urgent",
    match: (d) =>
      d["prom_sob"] === "Yes" &&
      d["resp_sob09"] === "Yes",
  },

];


// ============================================================
// 🔍 DETECTION FUNCTION
// Inputs:
//   complaints – string[] (e.g. ["Fever", "Chest Pain"])  — kept
//                for API compatibility but no longer used to
//                filter which rules run.
//   details    – flat object map of { QuestionID: Answer }
//
// Returns: array of detected flag objects, or [] if none.
// ============================================================
const detectRedFlags = (complaints, details) => {
  const detectedFlags = [];

  if (!details) return detectedFlags;

  for (const rule of RED_FLAG_COMBINATIONS) {
    if (rule.match(details)) {
      detectedFlags.push({
        ruleId:   rule.id,
        label:    rule.label,
        priority: rule.priority,
        msg:      `[${rule.id}] ${rule.label}`,
      });
    }
  }

  return detectedFlags;
};


module.exports = { checkHardRules, detectRedFlags };
