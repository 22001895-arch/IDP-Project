const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { HfInference } = require('@huggingface/inference');

const app = express();
app.use(cors());
app.use(express.json());

// --- AI CONFIGURATION ---
const HF_TOKEN = process.env.HF_TOKEN;
const hf = new HfInference(HF_TOKEN);

// Updated Model and specific Inference Provider
const MODEL_ID = "johnsnowlabs/JSL-MedLlama-3-8B-v1.0";
const PROVIDER = "featherless-ai"; 

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./triage.db', (err) => {
    if (err) console.error(err.message);
    console.log('Database Connected.');
});

db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaints TEXT,
    details TEXT,
    ai_summary TEXT,
    triage_zone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// --- HELPER: ROBUST JSON PARSER ---
function robustExtractJSON(text) {
    try {
        console.log("--- RAW AI RESPONSE ---");
        console.log(text);
        console.log("------------------------");

        const start = text.indexOf('{');
        const end = text.lastIndexOf('}') + 1;
        if (start === -1) throw new Error("No JSON found");

        const parsed = JSON.parse(text.substring(start, end));

        // CRITICAL CHECK: Does the JSON actually contain triage info?
        // If the AI just repeated the 'complaints' field, this will trigger the fallback.
        if (!parsed.zone && !parsed.Zone) {
            throw new Error("JSON exists but missing 'zone' field");
        }

        return {
            zone: (parsed.zone || parsed.Zone).toUpperCase(),
            summary: parsed.summary || parsed.Summary || "Medical assessment completed."
        };

    } catch (e) {
        console.log("⚠️ Parsing failed or invalid keys. Searching for keywords...");
        
        // Keyword Search Fallback
        let foundZone = "PENDING";
        if (/RED/i.test(text)) foundZone = "RED";
        else if (/YELLOW/i.test(text)) foundZone = "YELLOW";
        else if (/GREEN/i.test(text)) foundZone = "GREEN";

        return { 
            zone: foundZone, 
            summary: "AI response was unstructured. Manual review required." 
        };
    }
}

// --- ROUTES ---
const { checkHardRules } = require('./triageRules.js');

app.post('/api/save', async (req, res) => {
    const { complaints, history } = req.body;
    let finalTriage; 

    console.log(`\n--- [START] JSL-MedLlama Triage via ${PROVIDER} ---`);

    try {
        // --- STEP 1: CHECK HARD RULES ---
        const ruleResult = checkHardRules(complaints, history);

        if (ruleResult) {
            console.log("🚨 Rule Triggered:", ruleResult.zone);
            finalTriage = ruleResult; 
        } else {
            console.log("Step: Sending to John Snow Labs MedLlama...");
            
            // Llama-3 Chat Template format for better accuracy
            // Refined prompt to be even stricter about JSON
            /*const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
            You are a medical triage system. You MUST respond with ONLY a valid JSON object. 
            No conversational text. No markdown backticks.
            INPUT DATA: A list of symptoms and patient history.
            Example: {"zone": "GREEN", "summary": "Patient has mild symptoms."}
            <|eot_id|><|start_header_id|>user<|end_header_id|>
            Complaints: ${complaints.join(", ")}
            History: ${JSON.stringify(history)}

            TASK:
            1. Categorize as RED (Emergency), YELLOW (Urgent), or GREEN (Stable).
            2. Provide a 2-sentence medical summary.
            Analyze the input and output ONLY a JSON object.
            <|eot_id|><|start_header_id|>assistant<|end_header_id|>{"zone":`;*/

            // 1. Define your "Universal" prompt content
            const coreTask = `
                You are a medical triage system.
                Analyze: ${complaints.join(", ")}
                Data: ${JSON.stringify(history)}

                TASK:
                1. Categorize as RED, YELLOW, or GREEN.
                2. Write a 2-sentence summary.

                IMPORTANT: Return ONLY a raw JSON object. No markdown, no backticks.
                Example: {"zone": "GREEN", "summary": "Patient is stable."}
            `;

            // 2. Wrap it in Llama-3 tags and "Force" the JSON start
            const prompt = `<|begin_of_text|><|start_header_id|>user<|end_header_id|>
            ${coreTask}
            <|eot_id|><|start_header_id|>assistant<|end_header_id|>
            {"zone":`;
            //////////////////////////////////////////////////////////

            const response = await hf.textGeneration({
                model: MODEL_ID,
                inputs: prompt,
                provider: PROVIDER, // <--- Integration of featherless-ai
                parameters: {
                    max_new_tokens: 250,
                    temperature: 0.1,
                    stop: ["}"],
                    return_full_text: false
                }
            });

            // Extract and Parse
            let aiText = `{"zone":` + response.generated_text;
            if (!aiText.includes("}")) aiText += "}";
            finalTriage = robustExtractJSON(aiText);
            console.log("Step: AI Result Generated ->", finalTriage.zone);
        }

        // --- STEP 3: DATABASE STORAGE ---
        const query = `INSERT INTO submissions (complaints, details, ai_summary, triage_zone) VALUES (?, ?, ?, ?)`;
        
        db.run(query, [
            JSON.stringify(complaints),
            JSON.stringify(history),
            finalTriage.summary || "No summary available",
            finalTriage.zone || "UNKNOWN"
        ], function(err) {
            if (err) {
                console.error("DB Error:", err.message);
                return res.status(500).json({ error: "Database save failed" });
            }
            res.json({ success: true, triage: finalTriage }); 
        });

    } catch (error) {
        console.error("❌ Provider Error:", error.message);
        const fallback = { zone: "PENDING", summary: "AI Provider Error. Please review manually." };
        
        db.run(`INSERT INTO submissions (complaints, details, ai_summary, triage_zone) VALUES (?, ?, ?, ?)`, 
            [JSON.stringify(complaints), JSON.stringify(history), fallback.summary, fallback.zone],
            () => res.status(500).json({ error: "AI Processing failed", details: fallback })
        );
    }
});

app.get('/api/view', (req, res) => {
    db.all("SELECT * FROM submissions ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 MedLLaMA (JSL) Server is running on Port ${PORT}!`);
    console.log(`⚙️ Provider: ${PROVIDER}`);
    console.log(`🔗 Admin View: http://localhost:${PORT}/api/view\n`);
});