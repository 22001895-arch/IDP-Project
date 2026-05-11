// formatter.js

const labelMap = {
    // --- BRANCHING & TRIGGER PERMISSIONS ---
    "prom_fever": "Fever Reported", "confirm_fever": "Fever Confirmation Status",
    "prom_sob": "Shortness of Breath Reported", "confirm_sob": "SOB Confirmation Status",
    "prom_cough": "Cough Reported", "confirm_cough": "Cough Confirmation Status",
    "prom_vomiting": "Vomiting Reported", "confirm_vomiting": "Vomiting Confirmation Status",
    "prom_diarrhoea": "Diarrhoea Reported", "confirm_diarrhoea": "Diarrhoea Confirmation Status",
    "prom_abdopain": "Abdominal Pain Reported", "confirm_abdopain": "Abdominal Pain Confirmation Status",
    "prom_gu": "Urinary Problems Reported", "confirm_gu": "Urinary Confirmation Status",
    "prom_cardpain": "Chest Pain Reported", "confirm_cardpain": "Chest Pain Confirmation Status",
    "prom_headache": "Headache Reported", "confirm_headache": "Headache Confirmation Status",
    "prom_dizziness": "Dizziness Reported", "confirm_dizziness": "Dizziness Confirmation Status",
    "prom_weakness": "Body Weakness Reported", "confirm_weakness": "Weakness Confirmation Status",
    "prom_syncope": "Fainting/Blackout Reported", "confirm_syncope": "Syncope Confirmation Status",
    "prom_bleeding": "Bleeding Reported", "confirm_bleeding": "Bleeding Confirmation Status",
    "prom_injury": "Injury Reported", "confirm_injury": "Injury Confirmation Status",
    "prom_skin": "Skin Problem Reported", "confirm_skin": "Skin Confirmation Status",
    "prom_eye": "Eye Problem Reported", "confirm_eye": "Eye Confirmation Status",
    "prom_ent": "ENT Problem Reported", "confirm_ent": "ENT Confirmation Status",
    "prom_msk": "Muscle/Joint Problem Reported", "confirm_msk": "MSK Confirmation Status",

    // --- FEVER ---
    "fever_01": "Onset", "fever_02": "Duration (days)", "fever_03": "Still feverish today", 
    "fever_04": "Measured temp at home", "fever_041": "Highest reading", "fever_05": "Recent hospitalization", 
    "fever_06": "Sick contacts (2 weeks)", "fever_07": "Travel history (1 month)", "fever_08": "Outdoor/Water exposure",

    // --- RESPIRATORY (SOB & COUGH) ---
    "resp_sob01": "SOB Onset Type", "resp_sob02": "SOB Duration (days)", "resp_sob03": "Occurs at rest/active", 
    "resp_sob04": "Limits activity", "resp_sob05": "Orthopnea (lying flat)", "resp_sob06": "PND (waking night)", 
    "resp_sob07": "Environmental triggers", "resp_sob08": "Pain with deep breath", "resp_sob09": "Wheezing",
    "resp_cou01": "Cough Duration (days)", "resp_cou02": "Productive of phlegm", "resp_cou021": "Phlegm color", 
    "resp_cou022": "Increase in phlegm", "resp_cou023": "Change in phlegm color", "resp_cou03": "Hemoptysis (blood)", 
    "resp_cou04": "Runny nose", "resp_cou05": "Sore throat",

    // --- GASTROINTESTINAL (GIT) ---
    "git_vom01": "Nausea", "git_vom02": "Vomit appearance", "git_vom03": "Frequency", "git_vom04": "Duration", 
    "git_vom05": "Keep down fluids", "git_dia01": "Diarrhoea Frequency", "git_dia02": "Diarrhoea Duration", 
    "git_dia03": "Suspicious food trigger", "git_dia021": "Others unwell", "git_pain01": "Radiation to back", 
    "git_pain02": "Radiation to chest", "git_pain03": "Acid reflux", "git_pain04": "Radiation to R shoulder", 
    "git_pain05": "Worse with eating", "git_pain06": "Post-fatty food pain", "git_pain07": "Belly button to RIF", 
    "git_pain08": "Worse with cough/move", "git_01": "Constipation", "git_02": "Last bowel motion", 
    "git_03": "Stool color", "git_04": "Blood in stool", "git_05": "Passing gas", "git_06": "Bloated/Distended", 
    "git_07": "Jaundice", "git_08": "Difficulty swallowing", "git_09": "Painful swallowing", "git_10": "Incontinence",

    // --- GU (URINARY) ---
    "gu_01": "Able to pass urine", "gu_02": "Dysuria (pain)", "gu_021": "Dysuria Duration", 
    "gu_03": "Urine frequency change", "gu_04": "Dark urine", "gu_05": "Urinary retention", 
    "gu_06": "Hematuria (blood)", "gu_07": "Flank pain", "gu_071": "Pain wave type", 
    "gu_072": "Radiation to groin", "gu_08": "History of stones", "gu_09": "Stent present", 
    "gu_10": "Recent GU procedure", "gu_11": "Bladder incontinence", "gu_cbd01": "Cloudy urine (bag)", 
    "gu_tes01": "Scrotal pain", "gu_tes02": "Scrotal swelling",

    // --- CARDIAC (CHEST PAIN) ---
    "card_pain01": "Activity at onset", "card_pain02A": "Radiation to back", "card_pain03A": "Radiation to jaw", 
    "card_pain04A": "Radiation to neck", "card_pain05A": "Radiation to arms", "card_pain07A": "Improved with rest", 
    "card_pain10A": "Associated nausea", "card_pain11A": "Associated sweating", "card_01": "Leg swelling", 
    "card_014": "Leg redness/warmth", "card_03": "Palpitations",

    // --- NEURO (HEADACHE / DIZZY / WEAKNESS / SYNCOPE) ---
    "neuro_head01": "Headache Location", "neuro_head02": "Onset (days)", "neuro_head05": "Severity", 
    "neuro_head12": "Photophobia", "neuro_dizz01": "Dizziness type", "neuro_weak01": "Weakness distribution", 
    "neuro_weak02": "Sudden onset", "neuro_weak06": "Speech difficulty", "neuro_weak08": "Facial droop", 
    "neuro_sync01": "Syncope Onset (days)", "neuro_sync02": "Loss of consciousness level", 
    "neuro_01": "Neck stiffness", "neuro_02": "Confusion", "neuro_03": "Seizures",

    // --- SYSTEMIC / SKIN / INJURY / OBGYN / EYE / ENT ---
    "sys_01": "Loss of appetite", "sys_02": "Weight loss", "sys_03": "Lethargy", "sys_04": "Aches", "sys_05": "Night sweats",
    "skin_01": "Skin change type", "skin_02": "Skin change location", "inj_01": "Injury location", 
    "inj_05": "Mechanism of injury", "eye_01": "Eye symptom type", "eye_06": "Vision loss",
    "og_01": "Pregnancy chance", "og_013": "Vaginal bleeding", "og_02": "Abnormal discharge",
    "ent_00": "ENT problem type", "ent_ear01": "Ear symptom", "ent_nose01": "Nose symptom", 
    "ent_throat01": "Throat symptom", "msk_01": "MSK problem type", "msk_02": "MSK location",

    // --- HISTORY & MEDS ---
    "med_gen01": "Regular Medications", "med_gen02": "Drug Allergies", "med_gen022": "Allergy Reaction",
    "prompt_como01": "Medical History", "como_10": "Recent Surgery (3mo)", "prompt_como02": "Medical Devices",
    "soc_gen01": "Smoking status", "soc_gen02": "Alcohol consumption"
};

function formatClinicalHistory(complaints, details) {
    if (!details || typeof details !== 'object') return "No detailed history available.";

    let report = "";
    const mainComplaints = Array.isArray(complaints) ? complaints.join(", ") : (complaints || "Unspecified");
    report += `PRESENTING COMPLAINT: ${mainComplaints}\n`;
    report += `===========================================\n\n`;

    const sections = [
        { name: "FEVER SECTION", keys: ["fever", "prom_fever", "confirm_fever", "med_fever"] },
        { name: "RESPIRATORY (SOB & COUGH)", keys: ["resp_", "prom_sob", "confirm_sob", "prom_cough", "confirm_cough"] },
        { name: "GASTROINTESTINAL", keys: ["git_", "pain_git", "prom_vomiting", "confirm_vomiting", "prom_diarrhoea", "confirm_diarrhoea", "prom_abdopain", "confirm_abdopain"] },
        { name: "URINARY (GU)", keys: ["gu_", "prom_gu", "confirm_gu"] },
        { name: "CARDIAC / CHEST PAIN", keys: ["card_", "pain_card", "prom_cardpain", "confirm_cardpain"] },
        { name: "NEUROLOGICAL (HEAD / DIZZY / WEAK / SYNC)", keys: ["neuro_", "prom_head", "confirm_head", "prom_dizz", "confirm_dizz", "prom_weak", "confirm_weak", "prom_sync", "confirm_sync"] },
        { name: "OBSTETRICS & GYNAECOLOGY", keys: ["og_"] },
        { name: "BLEEDING SCREEN", keys: ["bleed_", "prom_bleeding", "confirm_bleeding"] },
        { name: "INJURY / SKIN / EYE / ENT", keys: ["inj_", "skin_", "eye_", "ent_", "prom_injury", "confirm_injury", "prom_skin", "confirm_skin", "prom_eye", "confirm_eye", "prom_ent", "confirm_ent"] },
        { name: "MUSCULOSKELETAL", keys: ["msk_", "prom_msk", "confirm_msk"] },
        { name: "SYSTEMIC SYMPTOMS", keys: ["sys_"] },
        { name: "MEDICAL / SURGICAL / SOCIAL HISTORY", keys: ["prompt_como", "como_", "med_gen", "med_0", "soc_gen"] }
    ];

    const usedKeys = new Set(['id', 'triggeredRedFlagRuleIds']);

    sections.forEach(section => {
        const sectionData = Object.entries(details).filter(([id]) => {
            // Checks if the DB key starts with any of our section prefixes
            return section.keys.some(prefix => id.startsWith(prefix)) && !usedKeys.has(id);
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