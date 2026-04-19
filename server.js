// server.js - Centralized Smart Backend
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const os = require('os');

// Import your Hard Rules
const { checkHardRules, detectRedFlags } = require('./triageRules.js');

const app = express();
app.use(cors());
app.use(express.json());

// --- AI CONFIGURATION ---
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
});

// --- DATABASE SETUP (Supabase) ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("⚠️ Warning: Supabase credentials missing in .env!");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("🗄️ Supabase client initialized.");

// --- SCHEMA NOTE ---
// Unlike local SQLite/PG, we typically create tables via the Supabase Dashboard.
// Ensure you have 'patients' and 'red_flags' tables created.
// To enable real-time on 'red_flags', go to:
// Database -> Replication -> enable 'Realtime' for the 'red_flags' table.
const verifySupabase = () => {
    console.log("✅ Ready to sync with Supabase Cloud!");
};
verifySupabase();

// ==========================================
// 🏥 THE WAITING ROOM (In-Memory Buffer)
// Must be here globally so all routes can see it!
// ==========================================
const waitingRoom = {};

// ==========================================
// 📥 THE INGESTION ROUTE (With Buffer Logic)
// ==========================================
app.post('/api/sync/history', async (req, res) => {
    const data = req.body;
    const id = data.id;

    if (!id) {
        return res.status(400).json({ error: "Patient ID is required" });
    }

    console.log(`\n--- [INCOMING DATA] Received data for Patient ID: ${id} ---`);

    // 1. Put the patient in the Waiting Room if they aren't there yet
    if (!waitingRoom[id]) {
        waitingRoom[id] = {};
    }

    // 2. Merge the new data with whatever is already in the Waiting Room
    waitingRoom[id] = { ...waitingRoom[id], ...data };
    
    const patientData = waitingRoom[id];

    // 3. Check what is missing
    const hasHistory = patientData.complaints && patientData.details;
    const hasVitals = patientData.ppi && patientData.respiratory_rate;

    if (!hasHistory) {
        console.log(`⏳ Patient ${id} is in the Waiting Room. Waiting for History app...`);
        return res.json({ success: true, status: "WAITING_FOR_HISTORY" });
    }
    
    if (!hasVitals) {
        console.log(`⏳ Patient ${id} is in the Waiting Room. Waiting for rPPG Vitals...`);
        return res.json({ success: true, status: "WAITING_FOR_VITALS" });
    }

    // ==========================================
    // 🚀 WE HAVE BOTH! RUN THE PIPELINE!
    // ==========================================
    console.log(`✅ All data received for Patient ${id}! Starting Triage...`);

    let finalTriage = {};
    let notesSummary = "No additional notes provided.";

    // --- 🚨 STEP 0: RED FLAG DETECTION ---
    console.log("Step 1: Running Red Flag Detection Engine...");
    const detectedFlags = detectRedFlags(patientData.complaints, patientData.details);
    const redFlagStatus = detectedFlags.length > 0 ? "Yes" : "No";

    if (detectedFlags.length > 0) {
        console.log(`🚨 ${detectedFlags.length} Red Flag(s) detected for Patient ${id}:`);
        detectedFlags.forEach(f => console.log(`   [${f.priority}] ${f.msg}`));
    } else {
        console.log("✅ No Red Flags detected.");
    }

    try {
        // --- STEP 1: CHECK HARD RULES ---
        console.log("Step 2: Checking Medical Safety Rules...");
        const ruleResult = checkHardRules(patientData.complaints, patientData.details);

        if (ruleResult) {
            console.log("🚨 Rule Triggered:", ruleResult.zone);
            finalTriage = ruleResult;
        } else {
            // --- STEP 2: CALL GEMINI ---
            console.log("Step 3: No Red Flags found. Sending to Gemini...");
            const prompt = `
                You are a medical triage system.
                Analyze the following patient data:
                Complaints: ${JSON.stringify(patientData.complaints)}
                Details: ${JSON.stringify(patientData.details)}
                Vitals: PPI=${patientData.ppi}, RespRate=${patientData.respiratory_rate}, HRV=${patientData.hrv}, SpO2=${patientData.spo2}

                TASK:
                1. Categorize as RED, YELLOW, or GREEN.
                2. Write a 2-sentence summary.

                IMPORTANT: Return ONLY a raw JSON object. No markdown, no backticks.
                Example: {"zone": "GREEN", "summary": "Patient is stable."}
            `;

            const result = await model.generateContent(prompt);
            let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            finalTriage = JSON.parse(text);
            console.log("Step 4: AI Result Generated ->", finalTriage.zone);
        }
        
        // --- EXTRA STEP: SUMMARIZING ADDITIONAL NOTES ---
        if (patientData.final_notes_raw && patientData.final_notes_raw.trim() !== "") {
            console.log("XTRA STEP: Summarizing Final Notes separately...");
            const notesPrompt = `
                Summarize the following patient comments for a doctor in one concise sentence:
                "${patientData.final_notes_raw}"
                Return ONLY JSON: {"summary": "..."}
            `;
            const notesResult = await model.generateContent(notesPrompt);
            let notesText = notesResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            notesSummary = JSON.parse(notesText).summary;
        }

        // --- STEP 3: DATABASE STORAGE (Supabase) ---
        console.log("Step 5: Writing patient record to Supabase...");
        
        const { error: patientError } = await supabase
            .from('patients')
            .upsert({
                id,
                complaints: JSON.stringify(patientData.complaints),
                details: JSON.stringify(patientData.details),
                final_notes_raw: patientData.final_notes_raw,
                ppi: patientData.ppi,
                respiratory_rate: patientData.respiratory_rate,
                hrv: patientData.hrv,
                spo2: patientData.spo2,
                redflag: redFlagStatus,
                ai_summary: finalTriage.summary || "No summary",
                triage_zone: finalTriage.zone || "UNKNOWN",
                final_note_summarized: notesSummary
            });

        if (patientError) throw patientError;
        
        console.log("Step 6: Patient record saved!");

        // --- 🚨 STEP 4: SAVE RED FLAGS & TRIGGER REALTIME ---
        if (detectedFlags.length > 0) {
            console.log(`Step 7: Pushing ${detectedFlags.length} flags to Supabase (Dashboard will update automatically)...`);
            
            const flagsToInsert = detectedFlags.map(flag => ({
                patient_id: id,
                complaint: flag.complaint,
                question_id: flag.questionId,
                answer: flag.answer,
                msg: flag.msg,
                priority: flag.priority
            }));

            const { error: flagError } = await supabase
                .from('red_flags')
                .insert(flagsToInsert);

            if (flagError) console.error("❌ Error saving red flags:", flagError.message);
            else console.log("🚨 Red flags pushed successfully.");
        }

        // 🧹 CLEANUP: Remove patient from Waiting Room so memory stays clean
        delete waitingRoom[id];

        res.json({ success: true, triage: finalTriage, redFlags: detectedFlags });

    } catch (error) {
        console.error("❌ Error Details:", error.message);

        const fallbackResponse = { 
            zone: "PENDING", 
            summary: error.message.includes("429") ? "Quota hit. Manual triage required." : "System Error." 
        };

        const { error: fallbackError } = await supabase
            .from('patients')
            .upsert({
                id,
                complaints: JSON.stringify(patientData.complaints),
                details: JSON.stringify(patientData.details),
                final_notes_raw: patientData.final_notes_raw,
                ppi: patientData.ppi,
                respiratory_rate: patientData.respiratory_rate,
                hrv: patientData.hrv,
                spo2: patientData.spo2,
                redflag: "Unknown",
                ai_summary: fallbackResponse.summary,
                triage_zone: fallbackResponse.zone,
                final_note_summarized: "Error generating notes"
            });

        if (fallbackError) console.error("❌ Fallback DB Error:", fallbackError.message);
            delete waitingRoom[id]; // Cleanup even on failure
            res.status(500).json({ error: "Processing failed", details: fallbackResponse });
        }
    }
});

// ==========================================
// 📤 ROUTE 2: GET HISTORICAL RECORDS
// ==========================================
app.get('/api/view', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data); 
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 📡 ROUTE 3: LIVE SERVER STATUS
// ==========================================
app.get('/api/status', (req, res) => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const memory = process.memoryUsage();
    const memoryUsedMB = Math.round(memory.heapUsed / 1024 / 1024);

    const nets = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }

    res.json({
        serverStatus: "Online 🟢",
        databaseStatus: "Supabase Cloud ☁️",
        aiConnection: "Ready 🤖",
        ipAddress: localIp,
        uptime: `${hours}h ${minutes}m ${seconds}s`,
        memoryUsed: `${memoryUsedMB} MB`,
        waitingRoomCount: Object.keys(waitingRoom).length,
        waitingPatients: Object.keys(waitingRoom) 
    });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Smart Server is running!`);
    console.log(`🔗 Click to view database logic: http://localhost:${PORT}/api/view`);
    console.log(`🏥 Backend is ready to receive data on port ${PORT}\n`);
});



