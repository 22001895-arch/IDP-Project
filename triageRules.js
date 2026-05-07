// backend/triageRules.js

// ============================================================
// 🏴 LEGACY: Hard-rule engine (kept for backward compat)
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
// 🚨 RED FLAG DETECTION ENGINE
// Rule structure per entry:
//   { id: "QuestionID", trigger: (val) => boolean, priority: "Critical"|"Urgent" }
//
// Message is generated dynamically as: "[QuestionID]: <answer>"
// so the doctor can see exactly what was answered.
// ============================================================
const RED_FLAG_RULES = {

  "Fever": [
    // Shortness of breath present
    {
      id: "resp_001",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Confusion / altered mental status
    {
      id: "neuro_003",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Neck stiffness / meningism signs
    {
      id: "neuro_004",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
  ],

  "Chest pain": [
    // Crushing / heaviness character
    {
      id: "chest_001",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Pain score > 5 (numeric slider scale)
    {
      id: "chest_009",
      trigger: (val) => parseInt(val, 10) > 5,
      priority: "Urgent",
    },
    // Pain score > 5 (alternate key used by some frontend versions)
    {
      id: "chest_009p",
      trigger: (val) => parseInt(val, 10) > 5,
      priority: "Urgent",
    },
    // Shortness of breath concurrent with chest pain
    {
      id: "resp_001",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Radiation / associated symptom flag
    {
      id: "chest_026",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Neurological symptom concurrent with chest pain
    {
      id: "neuro_005",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
  ],

  "Stomach/Abdominal pain": [
    // GI bleeding — fresh blood or coffee-ground appearance
    {
      id: "gi_015",
      trigger: (val) => val === "Fresh blood" || val === "Dark like coffee grounds",
      priority: "Critical",
    },
    // Abdominal rigidity / guarding
    {
      id: "gi_033",
      trigger: (val) => val === "Yes",
      priority: "Critical",
    },
    // Rebound tenderness
    {
      id: "gi_034",
      trigger: (val) => val === "Yes",
      priority: "Urgent",
    },
  ],

  "Shortness of breath": [],
  "Headache": [],
  "Dizziness": [],
  "Eye pain or redness": [],
  "Nausea/Vomiting": [],
  "Cough/Sore throat": [],
  "Diarrhoea": [],
  "Back pain": [],
  "Fainting/Blackout": [],
  "Limb pain (arm/leg pain)": [],
  "Feeling generally unwell": [],
  "Skin rashes": [],
  "Problem with passing urine": [],

};


// ============================================================
// 🔍 DETECTION FUNCTION
// Inputs:
//   complaints — string[] (e.g. ["Fever", "Chest Pain"])
//   details    — flat object map of { QuestionID: Answer }
//
// Returns: array of detected flag objects, or [] if none.
// ============================================================
const detectRedFlags = (complaints, details) => {
  const detectedFlags = [];

  if (!complaints || !details) return detectedFlags;

  for (const complaint of complaints) {
    const rules = RED_FLAG_RULES[complaint];
    if (!rules) continue; // No rules defined for this complaint yet

    for (const rule of rules) {
      const answer = details[rule.id];

      // Skip if this question was not answered (not present in payload)
      if (answer === undefined || answer === null || answer === "") continue;

      if (rule.trigger(answer)) {
        detectedFlags.push({
          complaint,
          triggeredByRuleId: rule.id,  // 🔑 The ID of the rule that triggered this red flag
          questionId: rule.id,         // (kept for backward compatibility)
          answer:     String(answer),
          msg:        `[${rule.id}]: ${answer}`,
          priority:   rule.priority,
        });
      }
    }
  }

  return detectedFlags;
};


module.exports = { checkHardRules, detectRedFlags };