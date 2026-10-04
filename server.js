// server.js - Centralized Smart Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const { formatClinicalHistory } = require('./formatter.js');

// Import your Hard Rules & Red Flag Detection Engine
const { detectRedFlags } = require('./triageRules.js');

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

// AI processing is temporarily disabled; history is formatted locally.

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
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', NULL, 'PENDING', NULL
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

    // --- 🛡️ DEFENSIVE PARSING: Ensure data is in Object/Array format for the formatter ---
    if (typeof patientData.complaints === 'string') {
        try { patientData.complaints = JSON.parse(patientData.complaints); } catch (e) { console.warn("⚠️ Failed to parse complaints string"); }
    }
    if (typeof patientData.details === 'string') {
        try { patientData.details = JSON.parse(patientData.details); } catch (e) { console.warn("⚠️ Failed to parse details string"); }
    }

    const hasHistory = patientData.complaints && patientData.details;

    if (!hasHistory) {
        console.log(`⏳ Patient ${id} is in the Waiting Room. Waiting for History app...`);
        return res.json({ success: true, status: "WAITING_FOR_HISTORY" });
    }

    // Vitals-only updates should not regenerate an already formatted history.
    const hasIncomingHistory = complaintsStr !== null || detailsStr !== null;
    if (!hasIncomingHistory && patientData.clinical_history_generated) {
        return res.json({ success: true, status: "ALREADY_FORMATTED" });
    }

    try {
        // Keep the local rule engine; no AI calls are made.
        const detectedFlags = detectRedFlags(patientData.complaints, patientData.details);
        patientData.details.triggeredRedFlagRuleIds = detectedFlags.map(f => f.ruleId);
        patientData.details.triggeredRedFlagRules = detectedFlags.map(f => ({
            id: f.ruleId, label: f.label, priority: f.priority
        }));
        const generatedHistory = formatClinicalHistory(patientData.complaints, patientData.details);

        let nextQueue = patientData.queue_number;
        if (nextQueue === null || nextQueue === undefined) {
            const { rows: activeRows } = await pool.query(`SELECT queue_number FROM patients WHERE consultation_status IN ('Waiting', 'In Progress') AND queue_number IS NOT NULL`);
            const activeQueues = new Set(activeRows.map(r => r.queue_number));
            const { rows: lastRow } = await pool.query(`SELECT queue_number FROM patients WHERE queue_number IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
            nextQueue = lastRow.length > 0 ? (lastRow[0].queue_number + 1) % 1000 : 0;
            let attempts = 0;
            while (activeQueues.has(nextQueue) && attempts < 1000) {
                nextQueue = (nextQueue + 1) % 1000;
                attempts++;
            }
            if (attempts === 1000) throw new Error('No queue numbers available');
        }

        // UNKNOWN means no clinical triage assessment has been made.
        // Formatting completion is tracked separately by clinical_history_generated.
        await pool.query(`UPDATE patients SET
            redflag = $1,
            details = $2,
            queue_number = COALESCE(queue_number, $3),
            clinical_history_generated = $4,
            triage_zone = CASE WHEN triage_zone IS NULL OR triage_zone = 'PENDING' THEN 'UNKNOWN' ELSE triage_zone END,
            ai_summary = CASE WHEN ai_summary = 'PENDING' THEN NULL ELSE ai_summary END,
            final_note_summarized = CASE WHEN final_note_summarized = 'PENDING' THEN NULL ELSE final_note_summarized END
            WHERE id = $5`, [
            detectedFlags.length > 0 ? 'Yes' : 'No',
            JSON.stringify(patientData.details), nextQueue, generatedHistory, id
        ]);

        console.log(`History formatted and saved for Patient ${id}. AI processing is disabled.`);
        res.json({ success: true, status: "FORMATTED", clinical_history_formatted: generatedHistory });
    } catch (error) {
        console.error('History processing failed:', error.message);
        res.status(500).json({ error: "History processing failed" });
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
                 consultation_started_at = COALESCE(consultation_started_at, NOW()),
                 consultation_status = 'In Progress'
             WHERE id = $2
               AND consultation_status IN ('Waiting', 'Waiting for Lab Report', 'Waiting for Further Consultation')`, // 🔒 Allow fresh starts or resuming
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
// 🔄 ROUTE: UPDATE CONSULTATION STATUS
// ==========================================
app.post('/api/patient/:patientId/update-status', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { doctorId, status } = req.body;

    if (!doctorId || !status) {
        return res.status(400).json({ error: "doctorId and status are required" });
    }

    try {
        const result = await pool.query(
            `UPDATE patients
             SET consultation_status = $1,
                 seen_by_doctor_id = COALESCE(seen_by_doctor_id, $2)
             WHERE id = $3`,
            [status, doctorId, patientId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        console.log(`🔄 Doctor ${doctorId} updated status for patient ${patientId} to '${status}'`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Update status error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 🧪 ROUTE: ORDER LAB TESTS
// ==========================================
app.post('/api/patient/:patientId/order-labs', verifyApiKey, async (req, res) => {
    const { patientId } = req.params;
    const { doctorId, orderedLabs } = req.body;

    if (!doctorId || !Array.isArray(orderedLabs)) {
        return res.status(400).json({ error: "doctorId and orderedLabs (array) are required" });
    }

    try {
        // Fetch existing ordered labs first to prevent overwriting
        const current = await pool.query(`SELECT ordered_labs FROM patients WHERE id = $1`, [patientId]);
        if (current.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found.' });
        }
        
        let existingLabs = [];
        try {
            if (current.rows[0].ordered_labs) {
                existingLabs = typeof current.rows[0].ordered_labs === 'string' 
                    ? JSON.parse(current.rows[0].ordered_labs) 
                    : current.rows[0].ordered_labs;
            }
        } catch (e) {
            console.error("Error parsing existing ordered_labs:", e);
        }

        const combinedLabs = Array.from(new Set([...existingLabs, ...orderedLabs]));

        const result = await pool.query(
            `UPDATE patients
             SET consultation_status = 'Waiting for Lab Report',
                 ordered_labs = $1::jsonb,
                 seen_by_doctor_id = COALESCE(seen_by_doctor_id, $2)
             WHERE id = $3`,
            [JSON.stringify(combinedLabs), doctorId, patientId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Failed to update patient.' });
        }

        console.log(`🧪 Doctor ${doctorId} ordered labs for patient ${patientId}`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Order labs error:", err.message);
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
            let ordered_labs = row.ordered_labs;

            // Ensure data is in Object format (Postgres JSONB is usually already an object)
            try { if (typeof complaints === 'string') complaints = JSON.parse(complaints); } catch (e) { }
            try { if (typeof details === 'string') details = JSON.parse(details); } catch (e) { }
            try { if (typeof ordered_labs === 'string') ordered_labs = JSON.parse(ordered_labs); } catch (e) { }

            return {
                ...row, // Send all original database columns (raw IDs, timestamps, etc.)
                ordered_labs: ordered_labs || [],
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
        aiConnection: "Disabled (formatter only)",
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
                hasHeartRate: !!data.heart_rate,
                hasRespiratoryRate: !!data.respiratory_rate,
                hasRhythm: !!data.heart_beat_rhythm,
                status: (data.complaints && data.details)
                    ? "Complete - Ready for Triage"
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
