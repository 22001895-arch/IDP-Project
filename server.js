// server.js - Centralized Smart Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { AzureOpenAI } = require("openai"); 
const os = require('os');
const path = require('path');

// Import your Hard Rules & Red Flag Detection Engine
const { checkHardRules, detectRedFlags } = require('./triageRules.js');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🛡️ THE BOUNCER (API KEY SECURITY)
// ==========================================
const SECRET_API_KEY = process.env.HOSPITAL_API_KEY || "super-secret-hospital-key-123";

const verifyApiKey = (req, res, next) => {
    const clientKey = req.headers['x-api-key'];
    if (!clientKey || clientKey !== SECRET_API_KEY) {
        console.log(`🛑 SECURITY ALERT: Blocked unauthorized POST request!`);
        return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
    }
    next();
};

// ==========================================
// 🧠 AZURE AI CONFIGURATION 
// ==========================================
const aiClient = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: "2024-02-01", 
    deployment: process.env.DEPLOYMENT_NAME 
});

// --- DATABASE SETUP (PostgreSQL) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.on('connect', () => {
    console.log("🗄️ Connected to PostgreSQL Central Database!");
});

// Create the 12-column table
const initializeDatabase = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            complaints TEXT,
            details TEXT,
            final_notes_raw TEXT,
            ppi TEXT,
            respiratory_rate TEXT,
            hrv TEXT,
            heart_rate TEXT,
            redflag TEXT,
            ai_summary TEXT,
            triage_zone TEXT,
            final_note_summarized TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log("✅ Database table verified!");
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
};
initializeDatabase();

// ==========================================
// 🏠 FRONT DOOR ROUTES (Serve HTML Pages)
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/status.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'status.html'));
});

// ==========================================
// 📥 THE INGESTION ROUTE (DIRECT TO DATABASE UPSERT)
// ==========================================
app.post('/api/sync/history', verifyApiKey, async (req, res) => {
    const data = req.body;
    const id = data.id;

    if (!id) {
        return res.status(400).json({ error: "Patient ID is required" });
    }

    console.log(`\n--- [INCOMING DATA] Received data for Patient ID: ${id} ---`);

    // --- 🛡️ Normalize payload fields for legacy/new rPPG formats ---
    const ppi = data.ppi || data.pi || null;
    const respRate = data.respiratory_rate || data.rr || null;
    const heartRate = data.heart_rate || data.hr || null;
    const hrv = data.hrv || data.cv || null;

    // Ensure complaints/details are strings before saving to DB
    const complaintsStr = data.complaints ? (typeof data.complaints === 'string' ? data.complaints : JSON.stringify(data.complaints)) : null;
    const detailsStr = data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : null;
    const finalNotesStr = data.final_notes_raw || null;

    try {
        // 🚀 THE MAGIC UPSERT QUERY
        // If ID exists, merge the new data. COALESCE ensures we don't overwrite existing data with NULLs.
        const upsertSql = `
            INSERT INTO patients (
                id, complaints, details, final_notes_raw, 
                ppi, respiratory_rate, hrv, heart_rate,
                redflag, ai_summary, triage_zone, final_note_summarized
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 'PENDING', 'PENDING', 'PENDING'
            ) ON CONFLICT (id) DO UPDATE SET
                complaints = COALESCE(EXCLUDED.complaints, patients.complaints),
                details = COALESCE(EXCLUDED.details, patients.details),
                final_notes_raw = COALESCE(EXCLUDED.final_notes_raw, patients.final_notes_raw),
                ppi = COALESCE(EXCLUDED.ppi, patients.ppi),
                respiratory_rate = COALESCE(EXCLUDED.respiratory_rate, patients.respiratory_rate),
                hrv = COALESCE(EXCLUDED.hrv, patients.hrv),
                heart_rate = COALESCE(EXCLUDED.heart_rate, patients.heart_rate)
            RETURNING *;
        `;

        const values = [id, complaintsStr, detailsStr, finalNotesStr, ppi, respRate, hrv, heartRate];
        const { rows } = await pool.query(upsertSql, values);
        
        const patientData = rows[0]; // The fully merged row from the database!
        
        // --- CHECK IF WE HAVE BOTH HALVES ---
        const hasHistory = patientData.complaints && patientData.details;
        const hasVitals = patientData.ppi && patientData.respiratory_rate;
        const needsTriage = patientData.triage_zone === 'PENDING' || patientData.triage_zone === 'UNKNOWN';

        if (!hasHistory || !hasVitals) {
            console.log(`⏳ Patient ${id} saved to DB safely. Missing ${!hasHistory ? 'History' : 'Vitals'}. Waiting for the rest...`);
            return res.json({ success: true, status: !hasHistory ? "WAITING_FOR_HISTORY" : "WAITING_FOR_VITALS" });
        }

        // If we already ran triage before, don't run it again
        if (!needsTriage) {
            console.log(`✅ Patient ${id} already has a complete triage profile.`);
            return res.json({ success: true, status: "ALREADY_TRIAGED" });
        }

        // ==========================================
        // 🚀 WE HAVE BOTH! RUN THE AI PIPELINE!
        // ==========================================
        console.log(`✅ All data merged in DB for Patient ${id}! Starting Triage...`);

        // Parse strings back into Objects for the AI
        let parsedComplaints = {};
        let parsedDetails = {};
        try { parsedComplaints = JSON.parse(patientData.complaints); } catch (e) {}
        try { parsedDetails = JSON.parse(patientData.details); } catch (e) {}

        let finalTriage = {};
        let notesSummary = "No additional notes provided.";

        // --- 🚨 STEP 0: RED FLAG DETECTION ---
        console.log("Step 1: Running Red Flag Detection Engine...");
        const detectedFlags = detectRedFlags(parsedComplaints, parsedDetails);
        let redFlagStatus = detectedFlags.length > 0 ? "Yes" : "No";

        if (detectedFlags.length > 0) {
            console.log(`🚨 ${detectedFlags.length} Red Flag(s) detected for Patient ${id}`);
            const triggeredRuleIds = detectedFlags.map(f => f.questionId);
            parsedDetails.triggeredRedFlagRuleIds = triggeredRuleIds;
            
            // Immediately update the DB with the new rule IDs attached to details
            await pool.query(`UPDATE patients SET details = $1 WHERE id = $2`, [JSON.stringify(parsedDetails), id]);
        }

        console.log("Step 2: Checking Medical Safety Rules...");
        const ruleResult = checkHardRules(parsedComplaints, parsedDetails);

        if (ruleResult) {
            console.log("🚨 Rule Triggered:", ruleResult.zone);
            finalTriage = ruleResult;
            redFlagStatus = "Yes"; 
        } else {
            console.log("Step 3: No Red Flags found. Sending to Azure OpenAI...");
            const prompt = `
                You are a medical triage system.
                Analyze the following patient data:
                Complaints: ${patientData.complaints}
                Details: ${patientData.details}
                Vitals: PPI=${patientData.ppi}, RespRate=${patientData.respiratory_rate}, HRV=${patientData.hrv}, HeartRate=${patientData.heart_rate}

                TASK:
                1. Categorize as RED, YELLOW, or GREEN.
                2. Write a 2-sentence summary.

                IMPORTANT: Return ONLY a raw JSON object. 
                Example: {"zone": "GREEN", "summary": "Patient is stable."}
            `;

            const result = await aiClient.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: process.env.DEPLOYMENT_NAME,
                response_format: { type: "json_object" } 
            });
            
            finalTriage = JSON.parse(result.choices[0].message.content);
            console.log("Step 4: AI Result Generated ->", finalTriage.zone);
        }
        
        if (patientData.final_notes_raw && patientData.final_notes_raw.trim() !== "") {
            console.log("XTRA STEP: Summarizing Final Notes separately...");
            const notesPrompt = `
                Summarize the following patient comments for a doctor in one concise sentence:
                "${patientData.final_notes_raw}"
                Return ONLY JSON: {"summary": "..."}
            `;
            const notesResult = await aiClient.chat.completions.create({
                messages: [{ role: "system", content: notesPrompt }],
                model: process.env.DEPLOYMENT_NAME,
                response_format: { type: "json_object" }
            });
            const parsedNotes = JSON.parse(notesResult.choices[0].message.content);
            notesSummary = parsedNotes.summary;
        }

        console.log("Step 5: Updating database with Final Triage...");
        
        await pool.query(`
            UPDATE patients 
            SET redflag = $1, ai_summary = $2, triage_zone = $3, final_note_summarized = $4
            WHERE id = $5
        `, [
            redFlagStatus, 
            finalTriage.summary || "No summary", 
            finalTriage.zone || "UNKNOWN", 
            notesSummary, 
            id
        ]);
        
        console.log("Step 6: Triage fully saved!");
        res.json({ success: true, triage: finalTriage });

    } catch (error) {
        console.error("❌ Error Details:", error.message);
        res.status(500).json({ error: "Processing failed", message: error.message });
    }
});

// ==========================================
// 📤 ROUTE 2: GIVE JSON (To your index.html)
// ==========================================
app.get('/api/view', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM patients ORDER BY created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 📡 ROUTE 3: LIVE SERVER STATUS (Now checks Database!)
// ==========================================
app.get('/api/status', async (req, res) => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const memoryUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    let waitingCount = 0;
    try {
        const result = await pool.query(`SELECT COUNT(*) FROM patients WHERE triage_zone = 'PENDING'`);
        waitingCount = parseInt(result.rows[0].count);
    } catch (e) {
        console.error("Status DB Error:", e.message);
    }

    res.json({
        serverStatus: "Online 🟢",
        databaseStatus: "Connected (PostgreSQL) 🗄️",
        aiConnection: "Ready (Azure) 🤖", 
        uptime: `${hours}h ${minutes}m`,
        memoryUsed: `${memoryUsedMB} MB`,
        waitingRoomCount: waitingCount
    });
});

// ==========================================
// 📋 ROUTE 4: GET WAITING ROOM PATIENTS (Direct from DB!)
// ==========================================
app.get('/api/waiting-room', async (req, res) => {
    try {
        // Grab anyone who hasn't been triaged yet
        const { rows } = await pool.query(`SELECT * FROM patients WHERE triage_zone = 'PENDING' ORDER BY created_at DESC`);
        
        const waitingRoomList = rows.map(data => ({
            id: data.id,
            hasComplaints: !!data.complaints,
            hasDetails: !!data.details,
            hasPPI: !!data.ppi,
            hasRespiratoryRate: !!data.respiratory_rate,
            hasHeartRate: !!data.heart_rate,
            status: (!data.complaints) ? "Waiting for History" : "Waiting for Vitals (rPPG)"
        }));

        res.json({ waitingRoom: waitingRoomList });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🛠️ SECRET ROUTE: Fix Database Columns
// ==========================================
app.get('/api/fix-db', async (req, res) => {
    try {
        await pool.query(`ALTER TABLE patients RENAME COLUMN spo2 TO heart_rate;`);
        res.send("✅ Database column successfully renamed!");
    } catch (err) {
        res.status(500).send(`❌ Error (might already be fixed!): ${err.message}`);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Central Database Server is running on Port ${PORT}!`);
});