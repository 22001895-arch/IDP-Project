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
    // Look for the VIP pass in the request headers
    const clientKey = req.headers['x-api-key'];

    if (!clientKey || clientKey !== SECRET_API_KEY) {
        console.log(`🛑 SECURITY ALERT: Blocked unauthorized POST request from an unknown source!`);
        return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
    }
    
    // If the key matches, open the door and run the route!
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
            heart_rate TEXT, /* 👈 CHANGED */
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

// Serve the index.html file at the main web address
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the status.html file when visiting /status.html
app.get('/status.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'status.html'));
});


// ==========================================
// 📥 THE INGESTION ROUTE (Secured with verifyApiKey!)
// ==========================================
app.post('/api/sync/history', verifyApiKey, async (req, res) => {
    const data = req.body;
    const id = data.id;

    if (!id) {
        return res.status(400).json({ error: "Patient ID is required" });
    }

    console.log(`\n--- [INCOMING DATA] Received data for Patient ID: ${id} ---`);

    // --- 🛡️ Normalize payload fields for DB and legacy/new rPPG formats ---
    const ppi = data.ppi || data.pi || null;
    const respRate = data.respiratory_rate || data.rr || null;
    const heartRate = data.heart_rate || data.hr || null;
    const hrv = data.hrv || data.cv || null;
    const complaintsStr = data.complaints ? (typeof data.complaints === 'string' ? data.complaints : JSON.stringify(data.complaints)) : null;
    const detailsStr = data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : null;
    const finalNotesStr = data.final_notes_raw || null;

    let patientData;

    try {
        // 🚀 THE UPSERT: Merge History and Vitals directly in the database
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
        const upsertValues = [id, complaintsStr, detailsStr, finalNotesStr, ppi, respRate, hrv, heartRate];
        
        const { rows } = await pool.query(upsertSql, upsertValues);
        patientData = rows[0];

    } catch (dbErr) {
        console.error("❌ DB Upsert Error:", dbErr.message);
        return res.status(500).json({ error: "Database merge failed" });
    }

    // --- 🛡️ DEFENSIVE PARSING: Ensure data is in Object/Array format for AI ---
    if (typeof patientData.complaints === 'string') {
        try { patientData.complaints = JSON.parse(patientData.complaints); } catch (e) { console.warn("⚠️ Failed to parse complaints string"); }
    }
    if (typeof patientData.details === 'string') {
        try { patientData.details = JSON.parse(patientData.details); } catch (e) { console.warn("⚠️ Failed to parse details string"); }
    }

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

    // Prevent re-running triage if already complete
    if (patientData.triage_zone !== 'PENDING' && patientData.triage_zone !== 'UNKNOWN') {
        return res.json({ success: true, status: "ALREADY_TRIAGED" });
    }

    // ==========================================
    // 🚀 WE HAVE BOTH! RUN THE AI PIPELINE!
    // ==========================================
    console.log(`✅ All data received for Patient ${id}! Starting Triage...`);

    let finalTriage = {};
    let notesSummary = "No additional notes provided.";

    // --- 🚨 STEP 0: RED FLAG DETECTION ---
    console.log("Step 1: Running Red Flag Detection Engine...");
    const detectedFlags = detectRedFlags(patientData.complaints, patientData.details);
    let redFlagStatus = detectedFlags.length > 0 ? "Yes" : "No";

    if (detectedFlags.length > 0) {
        console.log(`🚨 ${detectedFlags.length} Red Flag(s) detected for Patient ${id}:`);
        detectedFlags.forEach(f => console.log(`   [${f.priority}] ${f.msg}`));
        
        // 👈 ADDED: Include triggered rule IDs in details JSON
        const triggeredRuleIds = detectedFlags.map(f => f.questionId);
        patientData.details.triggeredRedFlagRuleIds = triggeredRuleIds;
        console.log(`   Triggered Rule IDs: ${triggeredRuleIds.join(", ")}`);
    } else {
        console.log("✅ No Red Flags detected.");
    }

    try {
        console.log("Step 2: Checking Medical Safety Rules...");
        const ruleResult = checkHardRules(patientData.complaints, patientData.details);

        if (ruleResult) {
            console.log("🚨 Rule Triggered:", ruleResult.zone);
            finalTriage = ruleResult;
            redFlagStatus = "Yes"; // Ensure Yes when hard rule fires too
        } else {
            console.log("Step 3: No Red Flags found. Sending to Azure OpenAI...");
            const prompt = `
                You are a medical triage system.
                Analyze the following patient data:
                Complaints: ${JSON.stringify(patientData.complaints)}
                Details: ${JSON.stringify(patientData.details)}
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

        console.log("Step 5: Writing to database...");
        
        // 👈 CHANGED: SQL Query (Now UPDATE instead of INSERT because Upsert created the row)
        const sql = `UPDATE patients SET 
            redflag = $1, ai_summary = $2, triage_zone = $3, final_note_summarized = $4, details = $5
            WHERE id = $6`;
        
        // 👈 CHANGED: Values array
        const values = [
            redFlagStatus,
            finalTriage.summary || "No summary",
            finalTriage.zone || "UNKNOWN",
            notesSummary,
            JSON.stringify(patientData.details), // Saves the triggeredRedFlagRuleIds to DB
            id
        ];

        await pool.query(sql, values);
        
        console.log("Step 6: Saved to DB successfully!");

        res.json({ success: true, triage: finalTriage });

    } catch (error) {
        console.error("❌ Error Details:", error.message);

        const fallbackResponse = { 
            zone: "PENDING", 
            summary: error.message.includes("429") ? "Quota hit. Manual triage required." : "System Error." 
        };

        // 👈 CHANGED: Fallback SQL Query (Now UPDATE instead of INSERT)
        const fallbackSql = `UPDATE patients SET 
            redflag = $1, ai_summary = $2, triage_zone = $3, final_note_summarized = $4
            WHERE id = $5`;
            
        // 👈 CHANGED: Fallback Values array
        const fallbackValues = [
            "Unknown", fallbackResponse.summary, fallbackResponse.zone, "Error generating notes", id
        ];

        try {
            await pool.query(fallbackSql, fallbackValues);
        } catch (dbError) {
            console.error("❌ Fallback DB Error:", dbError.message);
        } finally {
            res.status(500).json({ error: "Processing failed", details: fallbackResponse });
        }
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
// 📡 ROUTE 3: LIVE SERVER STATUS
// ==========================================
app.get('/api/status', async (req, res) => {
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

    // 👈 CHANGED: Fetching Waiting Room exact data from DB instead of memory object
    let waitingPatients = [];
    try {
        const { rows } = await pool.query(`SELECT id FROM patients WHERE triage_zone = 'PENDING'`);
        waitingPatients = rows.map(r => r.id);
    } catch(e) {}

    res.json({
        serverStatus: "Online 🟢",
        databaseStatus: "Connected (PostgreSQL) 🗄️",
        aiConnection: "Ready (Azure) 🤖", 
        ipAddress: localIp,
        uptime: `${hours}h ${minutes}m ${seconds}s`,
        memoryUsed: `${memoryUsedMB} MB`,
        waitingRoomCount: waitingPatients.length,
        waitingPatients: waitingPatients
    });
});

// ==========================================
// 📋 ROUTE 4: GET WAITING ROOM PATIENTS
// ==========================================
app.get('/api/waiting-room', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM patients WHERE triage_zone = 'PENDING' ORDER BY created_at DESC`);
        const waitingRoomList = [];
        
        for (const data of rows) {
            let complaints = [];
            let details = {};
            try { complaints = data.complaints ? JSON.parse(data.complaints) : []; } catch(e){}
            try { details = data.details ? JSON.parse(data.details) : {}; } catch(e){}

            waitingRoomList.push({
                id: data.id,
                complaints,
                details,
                complaintsText: Array.isArray(complaints) ? complaints.join(', ') : String(complaints),
                detailsText: typeof details === 'object' ? JSON.stringify(details) : String(details),
                hasComplaints: !!data.complaints,
                hasDetails: !!data.details,
                hasPPI: !!data.ppi,
                hasRespiratoryRate: !!data.respiratory_rate,
                hasHRV: !!data.hrv,
                hasHeartRate: !!data.heart_rate,
                status: (data.complaints && data.details && data.ppi && data.respiratory_rate) 
                    ? "Complete - Ready for Triage" 
                    : data.complaints && data.details 
                        ? "Waiting for Vitals (rPPG)" 
                        : "Waiting for History"
            });
        }
        res.json({ waitingRoom: waitingRoomList });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🛠️ SECRET ROUTE: Fix Database Columns!
// ==========================================
app.get('/api/fix-db', async (req, res) => {
    try {
        await pool.query(`ALTER TABLE patients RENAME COLUMN spo2 TO heart_rate;`);
        res.send("✅ Database column successfully renamed from spo2 to heart_rate!");
    } catch (err) {
        res.status(500).send(`❌ Error (it might already be fixed!): ${err.message}`);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Central Cloud Server is running on Port ${PORT}!`);
});