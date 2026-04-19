// test_detection.js
const { detectRedFlags } = require('./triageRules.js');

const runTest = (name, payload) => {
    console.log(`\n=== Testing: ${name} ===`);
    const flags = detectRedFlags(payload.complaints, payload.details);
    
    if (flags.length > 0) {
        console.log(`✅ ${flags.length} Red Flag(s) Detected:`);
        flags.forEach((f, i) => {
            console.log(`   ${i + 1}. [${f.priority}] ${f.msg} (Complaint: ${f.complaint})`);
        });
    } else {
        console.log("⚪ No red flags detected.");
    }
};

// --- CASE 1: Fever with respiratory and neuro issues ---
runTest("Fever - Multiple Red Flags", {
    complaints: ["Fever"],
    details: {
        resp_001: "Yes",   // Should trigger
        neuro_003: "Yes",  // Should trigger
        neuro_004: "No"    // Should NOT trigger
    }
});

// --- CASE 2: Chest pain (High score & Sudden) ---
runTest("Chest pain - Emergency", {
    complaints: ["Chest pain"],
    details: {
        chest_001: "Yes",  // Should trigger
        chest_009: "8",    // Should trigger (>5)
        resp_001: "No"
    }
});

// --- CASE 3: Abdominal pain (GI Bleeding) ---
runTest("Stomach/Abdominal pain - GI Bleed", {
    complaints: ["Stomach/Abdominal pain"],
    details: {
        gi_015: "Fresh blood", // Should trigger
        gi_033: "No"
    }
});
