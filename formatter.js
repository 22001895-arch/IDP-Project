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

    // --- SOB ---
    "resp_sob01": "Onset", "resp_sob02": "Duration (days)", "resp_sob03": "Occurs at", 
    "resp_sob04": "Limits activity", "resp_sob05": "Orthopnea (lying flat)", "resp_sob06": "PND (waking night)", 
    "resp_sob07": "Triggers", "resp_sob08": "Pleuritic pain", "resp_sob09": "Wheezing",

    // --- COUGH ---
    "resp_cou01": "Duration (days)", "resp_cou02": "Productive of phlegm", "resp_cou021": "Phlegm color", 
    "resp_cou022": "Increase in phlegm", "resp_cou023": "Change in phlegm color", "resp_cou03": "Hemoptysis", 
    "resp_cou04": "Runny nose", "resp_cou05": "Sore throat",

    // --- GIT / GU / CARDIAC / NEURO / ETC ---
    "git_vom01": "Nausea", "git_vom03": "Frequency", "git_vom04": "Duration", "git_pain01": "Pain to back",
    "gu_01": "Able to pass urine", "gu_02": "Dysuria", "card_pain01": "Activity at onset",
    "neuro_head01": "Location", "neuro_head05": "Severity", "sys_01": "Loss of appetite",
    "prompt_como01": "Medical History", "prompt_como02": "Medical Devices", "como_10": "Recent Surgery",
    "med_gen01": "Regular Medications", "med_gen02": "Drug Allergies"
};

function formatClinicalHistory(complaints, details) {
    if (!details || typeof details !== 'object') return "No detailed history available.";

    let report = "";
    const mainComplaints = Array.isArray(complaints) ? complaints.join(", ") : (complaints || "Unspecified");
    report += `PRESENTING COMPLAINT: ${mainComplaints}\n`;
    report += `===========================================\n\n`;

    // Define Sections and their associated key prefixes
    const sections = [
        { name: "FEVER", keys: ["fever", "prom_fever", "confirm_fever"] },
        { name: "RESPIRATORY (SOB)", keys: ["resp_sob", "confirm_sob"] },
        { name: "COUGH", keys: ["resp_cou", "prom_cough"] },
        { name: "GASTROINTESTINAL", keys: ["git_", "prom_vomiting", "prom_diarrhoea", "prom_abdopain"] },
        { name: "URINARY (GU)", keys: ["gu_", "prom_gu"] },
        { name: "CARDIAC", keys: ["card_", "prom_cardpain"] },
        { name: "NEUROLOGICAL", keys: ["neuro_", "prom_headache"] },
        { name: "SYSTEMIC / SKIN / INJURY", keys: ["sys_", "skin_", "inj_", "eye_", "prom_skin"] },
        { name: "PAST MEDICAL HISTORY", keys: ["prompt_como", "como_", "med_gen"] }
    ];

    const usedKeys = new Set(['id', 'triggeredRedFlagRuleIds']);

    sections.forEach(section => {
        // Find keys that belong to this section
        const sectionData = Object.entries(details).filter(([id]) => {
            return section.keys.some(prefix => id.includes(prefix)) && !usedKeys.has(id);
        });

        if (sectionData.length > 0) {
            report += `[ ${section.name} ]\n`;
            sectionData.forEach(([id, val]) => {
                const label = labelMap[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const cleanVal = Array.isArray(val) ? val.join(", ") : val;
                report += `${label}: ${cleanVal}\n`;
                usedKeys.add(id); // Mark as used so it doesn't repeat
            });
            report += `\n`;
        }
    });

    // Catch-all for any missed keys
    const remainingData = Object.entries(details).filter(([id]) => !usedKeys.has(id));
    if (remainingData.length > 0) {
        report += `[ ADDITIONAL INFO ]\n`;
        remainingData.forEach(([id, val]) => {
            const label = labelMap[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            report += `${label}: ${val}\n`;
        });
    }

    return report;
}

module.exports = { formatClinicalHistory };