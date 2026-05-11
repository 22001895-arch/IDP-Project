// scratch/testTriage.js
const { detectRedFlags } = require('../triageRules.js');

const testCases = [
    {
        name: "Rule 1: Cardiac pain - central + current pain",
        details: {
            "prom_cardpain": "Yes",
            "pain_01": "Central",
            "pain_03": "Yes"
        },
        expectedIds: ["combo_cardiac_central_now", "combo_cardiac_central_location"]
    },
    {
        name: "Rule 2: Cardiac pain - left side location",
        details: {
            "prom_cardpain": "Yes",
            "pain_01": "Left side of chest",
            "pain_03": "No"
        },
        expectedIds: ["combo_cardiac_central_location"]
    },
    {
        name: "Rule 3: Cardiac pain - radiation to arm",
        details: {
            "prom_cardpain": "Yes",
            "card_pain05B": "Yes"
        },
        expectedIds: ["combo_cardiac_radiation"]
    },
    {
        name: "Rule 4: Cardiac pain + SOB",
        details: {
            "prom_cardpain": "Yes",
            "prom_sob": "Yes"
        },
        expectedIds: ["combo_cardiac_with_sob"]
    },
    {
        name: "Rule 5: SOB + Wheeze",
        details: {
            "prom_sob": "Yes",
            "resp_sob09": "Yes"
        },
        expectedIds: ["combo_sob_wheeze"]
    },
    {
        name: "Negative Test: No matching rules",
        details: {
            "prom_cardpain": "No",
            "prom_sob": "No"
        },
        expectedIds: []
    }
];

console.log("=== Starting Triage Rules Test ===\n");

testCases.forEach((tc, index) => {
    console.log(`Test Case ${index + 1}: ${tc.name}`);
    const results = detectRedFlags([], tc.details);
    const resultIds = results.map(r => r.ruleId);
    
    const passed = tc.expectedIds.every(id => resultIds.includes(id)) && 
                   resultIds.length === tc.expectedIds.length;

    if (passed) {
        console.log("✅ PASSED");
    } else {
        console.log("❌ FAILED");
        console.log("  Expected:", tc.expectedIds);
        console.log("  Actual:  ", resultIds);
    }
    console.log("-----------------------------------\n");
});
