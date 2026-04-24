
const { detectRedFlags } = require('../triageRules.js');

const patientData = {
    complaints: ["Chest pain"],
    details: {"id":"12345678","age":"23","gender":"Male","comorbids":["None of these"],"surgical_history":"No","chest_001":"No","chest_002":"UCC","resp_001":"Yes","soc_001":"Never"}
};

console.log("Detecting red flags for user data (Chest pain)...");
const flags = detectRedFlags(patientData.complaints, patientData.details);
console.log("Detected Flags:", JSON.stringify(flags, null, 2));

if (flags.length > 0) {
    console.log("RESULT: SUCCESS - Red flags were detected.");
} else {
    console.log("RESULT: FAILED - No red flags detected.");
}
