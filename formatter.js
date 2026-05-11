// formatter.js

const labelMap = {
    // FEVER
    "fever_01": "Onset of fever", "fever_02": "Duration (days)", "fever_03": "Still feverish today", "fever_04": "Measured temp at home", "fever_041": "Highest reading", "fever_05": "Recent hospitalization", "fever_06": "Sick contacts", "fever_07": "Travel history", "fever_08": "Outdoor/Water exposure",
    // SOB (Shortness of Breath)
    "resp_sob01": "Onset", "resp_sob02": "Duration (days)", "resp_sob03": "Occurs at", "resp_sob04": "Limits activity", "resp_sob05": "Orthopnea (lying flat)", "resp_sob06": "PND (waking up at night)", "resp_sob07": "Triggers", "resp_sob08": "Pleuritic pain", "resp_sob09": "Wheezing",
    // COUGH
    "resp_cou01": "Duration (days)", "resp_cou02": "Productive of phlegm", "resp_cou021": "Phlegm color", "resp_cou022": "Increase in phlegm", "resp_cou023": "Change in phlegm color", "resp_cou03": "Hemoptysis (blood in cough)", "resp_cou04": "Runny nose", "resp_cou05": "Sore throat",
    // GIT (Vomiting/Diarrhoea/Pain)
    "git_vom01": "Nausea", "git_vom02": "Vomit appearance", "git_vom03": "Frequency", "git_vom04": "Duration (days)", "git_vom05": "Keep down fluids", "git_dia01": "Frequency", "git_dia02": "Duration (days)", "git_dia03": "Food triggers", "git_dia021": "Others unwell", "git_pain01": "Radiation to back", "git_pain02": "Radiation to chest", "git_pain03": "Acid reflux", "git_pain04": "Radiation to R shoulder", "git_pain05": "Worse with eating", "git_pain06": "Post-fatty food pain", "git_pain07": "Pain migration to RIF", "git_pain08": "Worse with cough/move", "git_01": "Constipation", "git_03": "Stool color", "git_04": "Blood in stool", "git_07": "Jaundice",
    // GU (Urinary)
    "gu_01": "Able to pass urine", "gu_02": "Dysuria (pain/burning)", "gu_03": "Urine frequency/amount", "gu_04": "Dark urine", "gu_06": "Hematuria (blood in urine)", "gu_07": "Flank pain", "gu_071": "Pain type", "gu_072": "Radiation to groin", "gu_08": "History of stones",
    // CARDIAC
    "card_pain01": "Activity at onset", "card_pain02A": "Radiation to back", "card_pain03A": "Radiation to jaw", "card_pain04A": "Radiation to neck", "card_pain05A": "Radiation to arms", "card_pain07A": "Improved with rest", "card_pain10A": "Associated nausea", "card_pain11A": "Associated sweating", "card_01": "Leg swelling", "card_014": "Leg redness/warmth", "card_03": "Palpitations/Irregular heart beat",
    // NEURO (Headache/Dizziness/Weakness)
    "neuro_head01": "Location", "neuro_head02": "Onset (days ago)", "neuro_head03": "Onset type", "neuro_head05": "Severity", "neuro_head061": "Different from usual", "neuro_head08": "Character", "neuro_head10": "Worse with strain", "neuro_head12": "Photophobia", "neuro_dizz01": "Dizziness type", "neuro_weak011": "Location of weakness", "neuro_weak012": "Unilateral weakness", "neuro_weak02": "Sudden onset", "neuro_weak06": "Speech difficulty", "neuro_weak08": "Facial droop",
    // INJURY / SKIN / EYE
    "inj_01": "Injury location", "inj_05": "Mechanism of injury", "skin_01": "Skin changes", "eye_01": "Eye symptoms", "eye_06": "Vision loss",
    // SYSTEMIC / HISTORY
    "sys_01": "Loss of appetite", "sys_02": "Weight loss", "sys_03": "Lethargy", "sys_05": "Night sweats",
    "prompt_como01": "Medical History", "prompt_como02": "Medical Devices", "como_10": "Recent Surgery",
    "med_gen01": "Regular Medications", "med_gen02": "Drug Allergies", "med_gen022": "Allergy Reaction"
};

function formatClinicalHistory(complaints, details) {
    if (!details || typeof details !== 'object') return "No detailed history available.";

    let report = "";

    // 1. HEADER: Presenting Complaint
    const mainComplaints = Array.isArray(complaints) ? complaints.join(", ") : (complaints || "Unspecified");
    report += `Presenting complaint: ${mainComplaints}\n\n`;

    // 2. BODY: Associated Symptoms & Details
    // We group by "Sections" for the Doctor's convenience
    report += `Clinical History:\n`;

    // Filter out "No", "None", and Technical logic IDs
    const entryItems = Object.entries(details).filter(([id, val]) => {
        const skipIds = ['id', 'age', 'gender', 'confirm_'];
        const isTechnical = skipIds.some(skip => id.includes(skip));
        const isNegative = (val === "No" || val === "None of these" || val === "Proceed");
        return !isTechnical && !isNegative;
    });

    if (entryItems.length === 0) {
        report += `- No significant positive symptoms reported.\n`;
    } else {
        entryItems.forEach(([id, val]) => {
            // Only show items that are NOT in the "Medical History" keys (we handle those below)
            const historyKeys = ["prompt_como01", "med_gen01", "med_gen02", "como_10", "prompt_como02"];
            if (!historyKeys.includes(id)) {
                const label = labelMap[id] || id; // Use map, fallback to ID if missing
                const cleanVal = Array.isArray(val) ? val.join(", ") : val;
                report += `- ${label}: ${cleanVal}\n`;
            }
        });
    }

    // 3. FOOTER: Past Medical History, Meds, Allergies
    report += `\nPast Medical & Social History:\n`;
    const histSection = [
        { key: "prompt_como01", label: "Medical History" },
        { key: "prompt_como02", label: "Medical Devices" },
        { key: "como_10", label: "Recent Surgery" },
        { key: "med_gen01", label: "Medications" },
        { key: "med_gen02", label: "Allergies" }
    ];

    histSection.forEach(item => {
        const val = details[item.key];
        if (val && val !== "No" && val !== "None of these") {
            const cleanVal = Array.isArray(val) ? val.join(", ") : val;
            report += `- ${item.label}: ${cleanVal}\n`;
        } else {
            report += `- ${item.label}: None reported\n`;
        }
    });

    return report;
}

module.exports = { formatClinicalHistory };