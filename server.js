// server.js - Centralized Smart Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { AzureOpenAI } = require("openai");
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const { formatClinicalHistory } = require('./formatter.js');

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

// Create the table
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
            duration_seconds INTEGER,
            heart_beat_rhythm TEXT,
            vitals_scanned_at TIMESTAMP,
            vitals_ingested_at TIMESTAMP, /* 👈 ADDED HERE */
            redflag TEXT,
            ai_summary TEXT,
            triage_zone TEXT,
            final_note_summarized TEXT,
            clinical_history_edited TEXT,
            clinical_history_generated TEXT,
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
    const durationSeconds = data.duration_seconds || null;
    const heartBeatRhythm = data.heart_beat_rhythm || null;
    const vitalsScannedAt = data.timestamp || data.vitals_scanned_at || null;
    
    // Check if the current payload actually contains vital metrics
    const hasVitalsInPayload = (data.heart_rate || data.respiratory_rate || data.ppi || data.hr || data.rr || data.pi) ? true : false;
    const vitalsIngestedAt = hasVitalsInPayload ? new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).toISOString().replace('Z', '') : null; // Malaysia Time (UTC+8)

    const complaintsStr = data.complaints ? (typeof data.complaints === 'string' ? data.complaints : JSON.stringify(data.complaints)) : null;
    const detailsStr = data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : null;
    const finalNotesStr = data.final_notes_raw || null;

    let patientData;

    try {
        // 🚀 THE UPSERT: Merge History and Vitals directly in the database
        // 👈 ADDED vitals_ingested_at to columns, VALUES ($12), and ON CONFLICT UPDATE
        const upsertSql = `
            INSERT INTO patients (
                id, complaints, details, final_notes_raw, 
                ppi, respiratory_rate, hrv, heart_rate, duration_seconds, heart_beat_rhythm, vitals_scanned_at, vitals_ingested_at,
                redflag, ai_summary, triage_zone, final_note_summarized
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', 'PENDING', 'PENDING', 'PENDING'
            ) ON CONFLICT (id) DO UPDATE SET
                complaints = COALESCE(EXCLUDED.complaints, patients.complaints),
                details = COALESCE(EXCLUDED.details, patients.details),
                final_notes_raw = COALESCE(EXCLUDED.final_notes_raw, patients.final_notes_raw),
                ppi = COALESCE(EXCLUDED.ppi, patients.ppi),
                respiratory_rate = COALESCE(EXCLUDED.respiratory_rate, patients.respiratory_rate),
                hrv = COALESCE(EXCLUDED.hrv, patients.hrv),
                heart_rate = COALESCE(EXCLUDED.heart_rate, patients.heart_rate),
                duration_seconds = COALESCE(EXCLUDED.duration_seconds, patients.duration_seconds),
                heart_beat_rhythm = COALESCE(EXCLUDED.heart_beat_rhythm, patients.heart_beat_rhythm),
                vitals_scanned_at = COALESCE(EXCLUDED.vitals_scanned_at, patients.vitals_scanned_at),
                vitals_ingested_at = COALESCE(EXCLUDED.vitals_ingested_at, patients.vitals_ingested_at)
            RETURNING *;
        `;
        const upsertValues = [
            id, complaintsStr, detailsStr, finalNotesStr, 
            ppi, respRate, hrv, heartRate, durationSeconds, heartBeatRhythm, vitalsScannedAt, vitalsIngestedAt
        ];

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
    // Support either old gatekeepers (ppi) or new gatekeepers (heart_rate) alongside respiratory_rate
    const hasVitals = patientData.respiratory_rate && (patientData.ppi || patientData.heart_rate);

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
        // 👈 FIX: was f.questionId (undefined) — corrected to f.ruleId
        const triggeredRuleIds = detectedFlags.map(f => f.ruleId);
        patientData.details.triggeredRedFlagRuleIds = triggeredRuleIds;
        // 👈 NEW: also store human-readable labels for the dashboard to display
        patientData.details.triggeredRedFlagRules = detectedFlags.map(f => ({
            id:       f.ruleId,
            label:    f.label,
            priority: f.priority
        }));
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
                Vitals: HeartRate=${patientData.heart_rate}, RespRate=${patientData.respiratory_rate}, HeartBeatRhythm=${patientData.heart_beat_rhythm || 'Normal'}, PPI=${patientData.ppi || 'N/A'}, HRV=${patientData.hrv || 'N/A'}

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

        console.log("Step 4.5: Assigning Queue Number...");
        let nextQueue = 0;
        try {
            const { rows: activeRows } = await pool.query(`SELECT queue_number FROM patients WHERE consultation_status IN ('Waiting', 'In Progress') AND queue_number IS NOT NULL`);
            const activeQueues = new Set(activeRows.map(r => r.queue_number));

            const { rows: lastRow } = await pool.query(`SELECT queue_number FROM patients WHERE queue_number IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
            if (lastRow.length > 0) {
                nextQueue = (lastRow[0].queue_number + 1) % 1000;
            }

            while (activeQueues.has(nextQueue)) {
                nextQueue = (nextQueue + 1) % 1000;
            }
        } catch(e) {
            console.error("Queue assignment error:", e.message);
        }

        console.log("Step 5: Writing to database...");

        // Generate and persist formatted clinical history at triage time
        const generatedHistory = formatClinicalHistory(patientData.complaints, patientData.details);

        // 👈 CHANGED: SQL Query (Now UPDATE instead of INSERT because Upsert created the row)
        const sql = `UPDATE patients SET 
            redflag = $1, ai_summary = $2, triage_zone = $3, final_note_summarized = $4, details = $5, queue_number = $6,
            clinical_history_generated = $7
            WHERE id = $8`;

        // 👈 CHANGED: Values array
        const values = [
            redFlagStatus,
            finalTriage.summary || "No summary",
            finalTriage.zone || "UNKNOWN",
            notesSummary,
            JSON.stringify(patientData.details), // Saves the triggeredRedFlagRuleIds to DB
            nextQueue,
            generatedHistory,
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

        console.log("Step 4.5 (Fallback): Assigning Queue Number...");
        let nextQueue = 0;
        try {
            const { rows: activeRows } = await pool.query(`SELECT queue_number FROM patients WHERE consultation_status IN ('Waiting', 'In Progress') AND queue_number IS NOT NULL`);
            const activeQueues = new Set(activeRows.map(r => r.queue_number));
            const { rows: lastRow } = await pool.query(`SELECT queue_number FROM patients WHERE queue_number IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
            if (lastRow.length > 0) nextQueue = (lastRow[0].queue_number + 1) % 1000;
            while (activeQueues.has(nextQueue)) nextQueue = (nextQueue + 1) % 1000;
        } catch(e) {}

        // Generate and persist formatted clinical history even on AI failure
        const fallbackHistory = formatClinicalHistory(patientData.complaints, patientData.details);

        // 👈 CHANGED: Fallback SQL Query (Now UPDATE instead of INSERT)
        const fallbackSql = `UPDATE patients SET 
            redflag = $1, ai_summary = $2, triage_zone = $3, final_note_summarized = $4, queue_number = $5,
            clinical_history_generated = $6
            WHERE id = $7`;

        // 👈 CHANGED: Fallback Values array
        const fallbackValues = [
            "Unknown", fallbackResponse.summary, fallbackResponse.zone, "Error generating notes", nextQueue, fallbackHistory, id
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
// 🔐 ROUTE: DOCTOR LOGIN
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const result = await pool.query(
            `SELECT * FROM doctors WHERE email = $1 AND is_active = TRUE`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const doctor = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, doctor.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        console.log(`✅ Doctor logged in: ${doctor.name} (${doctor.staff_id})`);

        res.json({
            success: true,
            doctor: {
                id: doctor.id,
                staff_id: doctor.staff_id,
                name: doctor.name,
                department: doctor.department
            }
        });
    } catch (err) {
        console.error("❌ Login error:", err.message);
        res.status(500).json({ error: "Server error during login" });
    }
});

// ==========================================
// 🩺 ROUTE: START CONSULTATION
// ==========================================
app.post('/api/patient/:patientId/start-consultation', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { doctorId } = req.body;

    if (!doctorId) {
        return res.status(400).json({ error: "doctorId is required" });
    }

    try {
        const result = await pool.query(
            `UPDATE patients
             SET seen_by_doctor_id = $1,
                 consultation_started_at = NOW(),
                 consultation_status = 'In Progress'
             WHERE id = $2
               AND consultation_status = 'Waiting'`, // 🔒 Only claim if still Waiting
            [doctorId, patientId]
        );

        if (result.rowCount === 0) {
            // Another doctor already claimed this patient
            const current = await pool.query(
                `SELECT seen_by_doctor_name FROM v_patient_queue WHERE id = $1`, [patientId]
            );
            const name = current.rows[0]?.seen_by_doctor_name || 'another doctor';
            return res.status(409).json({ error: `This patient is already being seen by ${name}.` });
        }

        console.log(`🩺 Doctor ${doctorId} started consultation for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Start consultation error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ✅ ROUTE: COMPLETE CONSULTATION
// ==========================================
app.post('/api/patient/:patientId/complete-consultation', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { doctorId } = req.body;

    if (!doctorId) {
        return res.status(400).json({ error: "doctorId is required" });
    }

    try {
        const result = await pool.query(
            `UPDATE patients
             SET consultation_status = 'Completed',
                 consultation_completed_at = NOW(),
                 seen_by_doctor_id = COALESCE(seen_by_doctor_id, $1)
             WHERE id = $2
               AND consultation_status = 'In Progress'`, // 🔒 Only complete if still In Progress
            [doctorId, patientId]
        );

        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'This consultation has already been completed or is not in progress.' });
        }

        console.log(`✅ Doctor ${doctorId} completed consultation for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Complete consultation error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 📝 ROUTE: UPDATE CLINICAL HISTORY
// ==========================================
app.post('/api/patient/:patientId/update-history', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { clinical_history_edited, last_known_updated_at } = req.body;

    try {
        // 🔒 If caller provides a timestamp, only save if the DB hasn't been updated since then
        let result;
        if (last_known_updated_at) {
            result = await pool.query(
                `UPDATE patients
                 SET clinical_history_edited = $1,
                     history_updated_at = NOW()
                 WHERE id = $2
                   AND (history_updated_at IS NULL OR history_updated_at <= $3)`,
                [clinical_history_edited, patientId, last_known_updated_at]
            );
        } else {
            result = await pool.query(
                `UPDATE patients
                 SET clinical_history_edited = $1,
                     history_updated_at = NOW()
                 WHERE id = $2`,
                [clinical_history_edited, patientId]
            );
        }

        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'Clinical history was already modified by another doctor. Please refresh to see the latest version before editing.' });
        }

        console.log(`📝 Updated clinical history for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Update history error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🧠 ROUTE: UPDATE AI SUMMARY
// ==========================================
app.post('/api/patient/:patientId/update-summary', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { ai_summary, last_known_updated_at } = req.body;

    try {
        // 🔒 If caller provides a timestamp, only save if the DB hasn't been updated since then
        let result;
        if (last_known_updated_at) {
            result = await pool.query(
                `UPDATE patients
                 SET ai_summary = $1,
                     summary_updated_at = NOW()
                 WHERE id = $2
                   AND (summary_updated_at IS NULL OR summary_updated_at <= $3)`,
                [ai_summary, patientId, last_known_updated_at]
            );
        } else {
            result = await pool.query(
                `UPDATE patients
                 SET ai_summary = $1,
                     summary_updated_at = NOW()
                 WHERE id = $2`,
                [ai_summary, patientId]
            );
        }

        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'AI summary was already modified by another doctor. Please refresh to see the latest version before editing.' });
        }

        console.log(`🧠 Updated AI summary for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Update summary error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🚩 ROUTE: OVERRIDE RED FLAG
// ==========================================
app.post('/api/patient/:patientId/override-redflag', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { doctorId } = req.body;

    if (!doctorId) {
        return res.status(400).json({ error: "doctorId is required" });
    }

    try {
        const result = await pool.query(
            `UPDATE patients
             SET redflag_override = TRUE,
                 redflag_overridden_by_doctor_id = $1,
                 redflag_overridden_at = NOW()
             WHERE id = $2
               AND (redflag_override = FALSE OR redflag_override IS NULL)`, // 🔒 Only if not already dismissed
            [doctorId, patientId]
        );

        if (result.rowCount === 0) {
            return res.status(409).json({ error: 'This red flag has already been dismissed by another doctor.' });
        }

        console.log(`🚩 Doctor ${doctorId} overrode red flag for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Override red flag error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 📤 ROUTE: API FOR DOCTOR DASHBOARD (Remote Access)
// ==========================================
app.get('/api/view', async (req, res) => {
    try {
        // 1. Get raw data from your view
        const result = await pool.query(`SELECT * FROM v_patient_queue`);

        // 2. Format the data ON-THE-FLY before sending it to the other laptop
        const formattedRows = result.rows.map(row => {
            let complaints = row.complaints;
            let details = row.details;

            // Ensure data is in Object format (Postgres JSONB is usually already an object)
            try { if (typeof complaints === 'string') complaints = JSON.parse(complaints); } catch (e) { }
            try { if (typeof details === 'string') details = JSON.parse(details); } catch (e) { }

            return {
                ...row, // Send all original database columns (raw IDs, timestamps, etc.)
                // Add the NEW "Pretty" version for the Doctor to display
                // Priority: doctor's manual edit → stored generated → live formatter (fallback)
                clinical_history_formatted: row.clinical_history_edited || row.clinical_history_generated || formatClinicalHistory(complaints, details)
            };
        });

        // 3. Send the enhanced JSON to the requesting dashboard
        res.json(formattedRows);
    } catch (err) {
        console.error("❌ Error serving dashboard data:", err.message);
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
    } catch (e) { }

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
            try { complaints = data.complaints ? JSON.parse(data.complaints) : []; } catch (e) { }
            try { details = data.details ? JSON.parse(data.details) : {}; } catch (e) { }

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
        // Keep previous fix just in case it wasn't run
        await pool.query(`ALTER TABLE patients RENAME COLUMN spo2 TO heart_rate;`).catch(() => console.log("spo2 already renamed"));

        // 👈 ADDED HERE: Add duration_seconds column safely to existing table
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;`);
        
        // Add heart_beat_rhythm column
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS heart_beat_rhythm TEXT;`);

        // Add vitals_scanned_at column
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS vitals_scanned_at TIMESTAMP;`);

        // Add vitals_ingested_at column
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS vitals_ingested_at TIMESTAMP;`);

        // Add clinical history columns
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_history_edited TEXT;`);
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_history_generated TEXT;`);

        // Add conflict-prevention timestamp columns
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS history_updated_at TIMESTAMP;`);
        await pool.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP;`);

        res.send("✅ Database columns successfully updated!");
    } catch (err) {
        res.status(500).send(`❌ Error: ${err.message}`);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Central Cloud Server is running on Port ${PORT}!`);
});