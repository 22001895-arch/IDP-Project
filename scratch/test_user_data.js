
const { detectRedFlags } = require('../triageRules.js');

const patientData = {
    complaints: ["Fever"],
    details: {"fever_002":"15","fever_003":"No","fever_004":"Yes","fever_005":"Yes","fever_005a":"30","resp_001":"Yes","resp_002":"Yes","ent_001":"Yes","resp_003":"No","ent_002":"Yes","ent_003":"Yes","gu_001":"Yes","gu_002":"Yes","gu_005":"Yes","gi_001":"No","gi_006":"No","gi_008":"No","skin_001":"No","skin_004":"No","head_001":"No","neuro_001":"No","neuro_002":"No","neuro_003":"No","neuro_004":"No","sys_001":"No","sys_002":"No","med_001":"No","med_010":"No","med_011":"No","med_016":"No","med_019":"No","med_020":"No","soc_001":"Never","soc_005":"No","soc_007":"Alone","soc_008":"I am very fit and active. I exercise regularly"}
};

console.log("Detecting red flags for user data...");
const flags = detectRedFlags(patientData.complaints, patientData.details);
console.log("Detected Flags:", JSON.stringify(flags, null, 2));

if (flags.length > 0) {
    console.log("RESULT: SUCCESS - Red flags were detected.");
} else {
    console.log("RESULT: FAILED - No red flags detected.");
}
