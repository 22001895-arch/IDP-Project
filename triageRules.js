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
      (d["pain_card_01"] === "Central" || d["pain_card_01"] === "Left side of chest" || d["pain_card_01"] === "Central / Left side of chest") &&
      d["pain_card_03"] === "Yes",
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

  // ── Rule 6 ─────────────────────────────────────────────────
  // neuro_weak07 = Yes  (balance loss)
  {
    id: "combo_neuro_balance_loss",
    label: "Neurological – sudden loss of balance",
    priority: "Critical",
    match: (d) =>
      d["neuro_weak07"] === "Yes",
  },

  // ── Rule 7 ─────────────────────────────────────────────────
  // neuro_weak012 = Right side | Left side  (unilateral weakness)
  {
    id: "combo_neuro_unilateral_weakness",
    label: "Neurological – unilateral limb weakness (right or left side)",
    priority: "Critical",
    match: (d) =>
      d["neuro_weak012"] === "Right side" ||
      d["neuro_weak012"] === "Left side",
  },

  // ── Rule 8 ─────────────────────────────────────────────────
  // neuro_weak06 = Yes  (speech difficulty)
  // (+) neuro_weak08 = Yes  (facial droop)
  {
    id: "combo_neuro_speech_facial_droop",
    label: "Neurological – speech difficulty with facial droop",
    priority: "Critical",
    match: (d) =>
      d["neuro_weak06"] === "Yes" &&
      d["neuro_weak08"] === "Yes",
  },

  // ── Rule 9 ─────────────────────────────────────────────────
  // neuro_sync04 = Yes  (sudden syncope)
  {
    id: "combo_neuro_sudden_syncope",
    label: "Neurological – sudden syncope",
    priority: "Critical",
    match: (d) =>
      d["neuro_sync04"] === "Yes",
  },

  // ── Rule 10 ────────────────────────────────────────────────
  // neuro_sync07 = Yes  (chest pain during presyncope)
  {
    id: "combo_neuro_presyncope_chest_pain",
    label: "Neurological – presyncope with chest pain",
    priority: "Critical",
    match: (d) =>
      d["neuro_sync07"] === "Yes",
  },

  // ── Rule 11 ────────────────────────────────────────────────
  // confirm_headache = Selected  OR  prom_headache = Yes
  // (+) at least one of:
  //       neuro_02 = Yes  (confusion)
  //       neuro_01 = Yes  (neck stiffness)
  {
    id: "combo_headache_confusion_or_neck",
    label: "Headache with confusion or neck stiffness",
    priority: "Critical",
    match: (d) =>
      (d["confirm_headache"] === "Selected" || d["prom_headache"] === "Yes") &&
      (d["neuro_02"] === "Yes" || d["neuro_01"] === "Yes"),
  },

  // ── Rule 12 ────────────────────────────────────────────────
  // neuro_02 = Yes  (confusion)
  // (+) neuro_01 = Yes  (neck stiffness)
  {
    id: "combo_confusion_neck_stiffness",
    label: "Confusion with neck stiffness",
    priority: "Critical",
    match: (d) =>
      d["neuro_02"] === "Yes" &&
      d["neuro_01"] === "Yes",
  },

  // ── Rule 13 ────────────────────────────────────────────────
  // confirm_fever = Selected  OR  prom_fever = Yes
  // (+) at least one of:
  //       git_vom03  >= 3  (vomiting ≥3 times)
  //       git_dia01  >= 3  (diarrhoea ≥3 times)
  //       prom_abdopain     = Yes
  //       confirm_abdopain  = Selected
  //       bleed_01   = Nosebleed | Mouth or gums
  {
    id: "combo_fever_with_gi_or_bleed",
    label: "Fever with vomiting/diarrhoea (≥3), abdominal pain, or oral/nasal bleeding",
    priority: "Urgent",
    match: (d) => {
      const hasFever =
        d["confirm_fever"] === "Selected" || d["prom_fever"] === "Yes";
      if (!hasFever) return false;

      const vomitCount = parseInt(d["git_vom03"], 10);
      const diarrCount = parseInt(d["git_dia01"], 10);

      return (
        (!isNaN(vomitCount) && vomitCount >= 3) ||
        (!isNaN(diarrCount) && diarrCount >= 3) ||
        d["prom_abdopain"] === "Yes" ||
        d["confirm_abdopain"] === "Selected" ||
        d["bleed_01"] === "Nosebleed" ||
        d["bleed_01"] === "Mouth or gums"
      );
    },
  },

  // ── Rule 14 ────────────────────────────────────────────────
  // eye_05 = Yes  (eye injury)
  // (+) at least one of:
  //       eye_07 = Yes  (pain on eye movement)
  //       eye_06 = Yes  (complete loss of vision)
  {
    id: "combo_eye_injury_with_pain_or_vision_loss",
    label: "Eye injury with pain on movement or complete vision loss",
    priority: "Critical",
    match: (d) =>
      d["eye_05"] === "Yes" &&
      (d["eye_07"] === "Yes" || d["eye_06"] === "Yes"),
  },

  // ── Rule 15 ────────────────────────────────────────────────
  // eye_01 = Pain | Blurred or loss of vision
  // (+) eye_10 = Yes  (halos)
  {
    id: "combo_eye_pain_vision_with_halos",
    label: "Eye pain or blurred/loss of vision with halos",
    priority: "Urgent",
    match: (d) =>
      (d["eye_01"] === "Pain" || d["eye_01"] === "Blurred or loss of vision") &&
      d["eye_10"] === "Yes",
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
