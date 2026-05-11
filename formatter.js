// formatter.js

const labelMap = {
    // --- BRANCHING & TRIGGER PERMISSIONS ---
    "prom_fever": "Fever Reported", "confirm_fever": "Fever Confirmation",
    "prom_cardpain": "Chest Pain Reported", "prom_abdopain": "Abdominal Pain Reported",
    "confirm_sob": "Shortness of Breath Reported", "prom_cough": "Cough Reported",
    "prom_vomiting": "Vomiting Reported", "prom_diarrhoea": "Diarrhoea Reported",
    "prom_gu": "Urinary Symptoms Reported", "prom_headache": "Headache Reported",
    "prom_skin": "Skin Symptoms Reported",

    // --- FEVER ---
    "fever_01": "Onset", "fever_02": "Duration (days)", "fever_03": "Still feverish today", 
    "fever_04": "Measured temp at home", "fever_041": "Highest reading", "fever_05": "Recent hospitalization", 
    "fever_06": "Sick contacts", "fever_07": "Travel history", "fever_08": "Outdoor/Water exposure",

    // --- SOB (Respiratory) ---
    "resp_sob01": "Onset", "resp_sob02": "Duration (days)", "resp_sob03": "Occurs at", 
    "resp_sob04": "Limits activity", "resp_sob05": "Orthopnea (lying flat)", "resp_sob06": "PND (waking night)", 
    "resp_sob07": "Triggers", "resp_sob08": "Pleuritic pain", "resp_sob09": "Wheezing",

    // --- COUGH ---
    "resp_cou01": "Duration (days)", "resp_cou02": "Productive of phlegm", "resp_cou021": "Phlegm color", 
    "resp_cou022": "Increase in phlegm", "resp_cou023": "Change in phlegm color", "resp_cou03": "Hemoptysis", 
    "resp_cou04": "Runny nose", "resp_cou05": "Sore throat",

    // --- GASTROINTESTINAL (GIT) ---
    "git_vom01": "Nausea", "git_vom02": "Vomit appearance", "git_vom03": "Frequency", "git_vom04": "Duration", 
    "git_vom05": "Keep down fluids", "git_dia01": "Frequency", "git_dia02": "Duration (days)", 
    "git_dia03": "Food triggers", "git_dia021": "Others unwell", "git_pain01": "Radiation to back", 
    "git_pain02": "Radiation to chest", "git_pain03": "Acid reflux", "git_pain04": "Radiation to R shoulder", 
    "git_pain05": "Worse with eating", "git_pain06": "Post-fatty food pain", "git_pain07": "Pain migration to RIF", 
    "git_pain08": "Worse with cough/move", "git_01": "Constipation", "git_03": "Stool color", 
    "git_04": "Blood in stool", "git_07": "Jaundice",

    // --- URINARY (GU) ---
    "gu_01": "Able to pass urine", "gu_02": "Dysuria", "gu_03": "Urine frequency/amount", 
    "gu_04": "Dark urine", "gu_06": "Hematuria", "gu_07": "Flank pain", "gu_071": "Pain type", 
    "gu_072": "Radiation to groin", "gu_08": "History of stones",

    // --- CARDIAC ---
    "card_pain01": "Activity at onset", "card_pain02A": "Radiation to back", "card_pain03A": "Radiation to jaw", 
    "card_pain04A": "Radiation to neck", "card_pain05A": "Radiation to arms", "card_pain07A": "Improved with rest", 
    "card_pain10A": "Associated nausea", "card_pain11A": "Associated sweating", "card_01": "Leg swelling", 
    "card_014": "Leg redness/warmth", "card_03": "Palpitations",

    // --- NEUROLOGICAL ---
    "neuro_head01": "Location", "neuro_head02": "Onset (days ago)", "neuro_head03": "Onset type", 
    "neuro_head05": "Severity", "neuro_head061": "Different from usual", "neuro_head08": "Character", 
    "neuro_head10": "Worse with strain", "neuro_head12": "Photophobia", "neuro_dizz01": "Dizziness type", 
    "neuro_weak011": "Location of weakness", "neuro_weak012": "Unilateral weakness", 
    "neuro_weak02": "Sudden onset", "neuro_weak06": "Speech difficulty", "neuro_weak08": "Facial droop",

    // --- SYSTEMIC / SKIN / INJURY ---
    "sys_01": "Loss of appetite", "sys_02": "Weight loss", "sys_03": "Lethargy", "sys_05": "Night sweats",
    "skin_01": "Skin changes/Rash", "inj_01": "Injury location", "inj_05": "Mechanism of injury", 
    "eye_01": "Eye symptoms", "eye_06": "Vision loss",

    // --- HISTORY ---
    "prompt_como01": "Medical History", "prompt_como02": "Medical Devices", "como_10": "Recent Surgery",
    "med_gen01": "Regular Medications", "med_gen02": "Drug Allergies", "med_gen022": "Allergy Reaction"
};

function formatClinicalHistory(complaints, details) {
    if (!details || typeof details !== 'object') return "No detailed history available.";

    let report = "";
    const mainComplaints = Array.isArray(complaints) ? complaints.join(", ") : (complaints || "Unspecified");
    report += `PRESENTING COMPLAINT: ${mainComplaints}\n`;
    report += `===========================================\n\n`;

    const sections = [
        { name: "FEVER SECTION", keys: ["fever", "prom_fever", "confirm_fever"] },
        { name: "SHORTNESS OF BREATH", keys: ["resp_sob", "confirm_sob"] },
        { name: "COUGH", keys: ["resp_cou", "prom_cough"] },
        { name: "GASTROINTESTINAL", keys: ["git_", "prom_vomiting", "prom_diarrhoea", "prom_abdopain"] },
        { name: "URINARY (GU)", keys: ["gu_", "prom_gu"] },
        { name: "CARDIAC / CHEST PAIN", keys: ["card_", "prom_cardpain"] },
        { name: "NEUROLOGICAL", keys: ["neuro_", "prom_headache"] },
        { name: "SYSTEMIC / SKIN / INJURY", keys: ["sys_", "skin_", "inj_", "eye_", "prom_skin"] },
        { name: "PAST MEDICAL HISTORY & MEDS", keys: ["prompt_como", "como_", "med_gen"] }
    ];

    const usedKeys = new Set(['id', 'triggeredRedFlagRuleIds']);

    sections.forEach(section => {
        const sectionData = Object.entries(details).filter(([id]) => {
            return section.keys.some(prefix => id.includes(prefix)) && !usedKeys.has(id);
        });

        if (sectionData.length > 0) {
            report += `[ ${section.name} ]\n`;
            sectionData.forEach(([id, val]) => {
                const label = labelMap[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const cleanVal = Array.isArray(val) ? val.join(", ") : val;
                report += `${label}: ${cleanVal}\n`;
                usedKeys.add(id);
            });
            report += `\n`;
        }
    });

    const remainingData = Object.entries(details).filter(([id]) => !usedKeys.has(id));
    if (remainingData.length > 0) {
        report += `[ ADDITIONAL DETAILS ]\n`;
        remainingData.forEach(([id, val]) => {
            const label = labelMap[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            report += `${label}: ${val}\n`;
        });
    }

    return report;
}

module.exports = { formatClinicalHistory };