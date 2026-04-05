// server.js - Centralized Smart Backend
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const os = require('os');

// Import your Hard Rules
const { checkHardRules } = require('./triageRules.js'); 

const app = express();
app.use(cors());
app.use(express.json());

// --- AI CONFIGURATION ---
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || "AIzaSyAEIqlHmFqP2VsKLhHVrE4TjaocTtuL2qM";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    generationConfig: { responseMimeType: "application/json" }
});

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./patient_data.sqlite', (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log("🗄️ Connected to Central Database!");
});

// Create the 12-column table
db.run(`CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    complaints TEXT,
    details TEXT,
    final_notes_raw TEXT,
    ppi TEXT,
    respiratory_rate TEXT,
    hrv TEXT,
    spo2 TEXT,
    redflag TEXT,
    ai_summary TEXT,
    triage_zone TEXT,
    final_note_summarized TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

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
    // 🚀 WE HAVE BOTH! RUN THE AI PIPELINE!
    // ==========================================
    console.log(`✅ All data received for Patient ${id}! Starting Triage...`);

    let finalTriage = {}; 
    let redFlagStatus = "No";
    let notesSummary = "No additional notes provided.";

    try {
        // --- STEP 1: CHECK HARD RULES ---
        console.log("Step 2: Checking Medical Safety Rules...");
        const ruleResult = checkHardRules(patientData.complaints, patientData.details);

        if (ruleResult) {
            console.log("🚨 Rule Triggered:", ruleResult.zone);
            finalTriage = ruleResult; 
            redFlagStatus = "Yes";
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
            redFlagStatus = "No";
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

        // --- STEP 3: DATABASE STORAGE ---
        console.log("Step 5: Writing to database...");
        
        const sql = `INSERT INTO patients 
            (id, complaints, details, final_notes_raw, ppi, respiratory_rate, hrv, spo2, redflag, ai_summary, triage_zone, final_note_summarized) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const values = [
            id, 
            JSON.stringify(patientData.complaints), 
            JSON.stringify(patientData.details), 
            patientData.final_notes_raw, 
            patientData.ppi, 
            patientData.respiratory_rate, 
            patientData.hrv, 
            patientData.spo2, 
            redFlagStatus, 
            finalTriage.summary || "No summary", 
            finalTriage.zone || "UNKNOWN", 
            notesSummary
        ];

        db.run(sql, values, function(err) {
            if (err) {
                console.error("❌ DB Error:", err.message);
                return res.status(500).json({ error: "Database save failed" });
            }
            console.log("Step 6: Saved to DB successfully!");
            
            // 🧹 CLEANUP: Remove patient from Waiting Room so memory stays clean
            delete waitingRoom[id];

            res.json({ success: true, triage: finalTriage }); 
        });

    } catch (error) {
        console.error("❌ Error Details:", error.message);

        const fallbackResponse = { 
            zone: "PENDING", 
            summary: error.message.includes("429") ? "Quota hit. Manual triage required." : "System Error." 
        };

        const fallbackSql = `INSERT INTO patients 
            (id, complaints, details, final_notes_raw, ppi, respiratory_rate, hrv, spo2, redflag, ai_summary, triage_zone, final_note_summarized) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
        const fallbackValues = [
            id, 
            JSON.stringify(patientData.complaints), 
            JSON.stringify(patientData.details), 
            patientData.final_notes_raw, 
            patientData.ppi, 
            patientData.respiratory_rate, 
            patientData.hrv, 
            patientData.spo2, 
            "Unknown", 
            fallbackResponse.summary, 
            fallbackResponse.zone, 
            "Error generating notes"
        ];

        db.run(fallbackSql, fallbackValues, () => {
            delete waitingRoom[id]; // Cleanup even on failure
            res.status(500).json({ error: "Processing failed", details: fallbackResponse });
        });
    }
});

// ==========================================
// 📤 ROUTE 2: GIVE JSON (To your index.html)
// ==========================================
app.get('/api/view', (req, res) => {
    db.all(`SELECT * FROM patients ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows); 
    });
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
        databaseStatus: "Connected 🗄️",
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