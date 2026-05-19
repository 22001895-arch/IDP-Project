-- ============================================================
-- IDP PROJECT - SUPABASE SCHEMA SETUP
-- Paste this entire file into the Supabase SQL Editor and Run.
--
-- IMPORTANT: Passwords below are PLAINTEXT placeholders.
-- Your Node.js server MUST hash passwords with bcrypt before
-- inserting new doctors. Replace the dummy hashes below with
-- real bcrypt hashes once you wire up the auth endpoint.
-- ============================================================


-- ============================================================
-- STEP 1: CREATE THE DOCTORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        TEXT UNIQUE NOT NULL,         -- e.g. "DR001"
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,                -- store bcrypt hash ONLY
    department      TEXT,
    is_active       BOOLEAN DEFAULT TRUE,          -- set FALSE to deactivate a doctor
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STEP 2: SEED SAMPLE DOCTOR ACCOUNTS
-- NOTE: password_hash values below are PLACEHOLDER strings.
--       Replace them with real bcrypt hashes from your server.
--       e.g. in Node.js: bcrypt.hashSync('YourPassword', 10)
--
--       Demo accounts (change passwords before going live!):
--         DR001 / dr.rahman@hospital.com
--         DR002 / dr.lim@hospital.com
--         DR003 / dr.aisha@hospital.com
-- ============================================================
INSERT INTO doctors (staff_id, name, email, password_hash, department) VALUES
    ('DR001', 'Dr. Ahmad Rahman',  'dr.rahman@hospital.com', 'REPLACE_WITH_BCRYPT_HASH', 'Emergency'),
    ('DR002', 'Dr. Lim Wei Jie',   'dr.lim@hospital.com',    'REPLACE_WITH_BCRYPT_HASH', 'Cardiology'),
    ('DR003', 'Dr. Aisha Malik',   'dr.aisha@hospital.com',  'REPLACE_WITH_BCRYPT_HASH', 'General')
ON CONFLICT (staff_id) DO NOTHING;


-- ============================================================
-- STEP 3: MODIFY THE EXISTING PATIENTS TABLE
--         (Safe to run even if the column already exists —
--          each ALTER is wrapped in a DO block to avoid errors)
-- ============================================================

-- 3a. Which doctor started the consultation and when
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'seen_by_doctor_id'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN seen_by_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'consultation_started_at'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN consultation_started_at TIMESTAMP;
    END IF;
END $$;

-- 3b. Red flag override tracking
--     redflag_override = TRUE means the doctor manually cleared the red flag.
--     Dashboard logic: show as red flag if redflag = 'Yes' AND redflag_override = FALSE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'redflag_override'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN redflag_override BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'redflag_overridden_by_doctor_id'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN redflag_overridden_by_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'redflag_overridden_at'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN redflag_overridden_at TIMESTAMP;
    END IF;
END $$;


-- ============================================================
-- STEP 4: HELPFUL VIEWS (optional but recommended)
-- ============================================================

-- View: Active red flag patients (not yet overridden), sorted to top
CREATE OR REPLACE VIEW v_active_redflags AS
SELECT
    p.*,
    d.name  AS doctor_name,
    d.staff_id AS doctor_staff_id
FROM patients p
LEFT JOIN doctors d ON p.seen_by_doctor_id = d.id
WHERE p.redflag = 'Yes'
  AND (p.redflag_override = FALSE OR p.redflag_override IS NULL)
ORDER BY p.created_at DESC;

-- View: Full patient queue (red flags first, then normal, with doctor info)
CREATE OR REPLACE VIEW v_patient_queue AS
SELECT
    p.*,
    -- Effective red flag: only if AI flagged AND not manually overridden
    CASE
        WHEN p.redflag = 'Yes' AND (p.redflag_override = FALSE OR p.redflag_override IS NULL)
        THEN TRUE
        ELSE FALSE
    END AS is_active_redflag,
    d_seen.name            AS seen_by_doctor_name,
    d_seen.staff_id        AS seen_by_doctor_staff_id,
    d_override.name        AS override_doctor_name,
    d_override.staff_id    AS override_doctor_staff_id
FROM patients p
LEFT JOIN doctors d_seen     ON p.seen_by_doctor_id               = d_seen.id
LEFT JOIN doctors d_override ON p.redflag_overridden_by_doctor_id = d_override.id
ORDER BY
    is_active_redflag DESC,   -- red flag patients bubble to the top
    p.created_at DESC;


-- ============================================================
-- STEP 5: VERIFY EVERYTHING LOOKS CORRECT
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;

SELECT id, staff_id, name, email, department, is_active FROM doctors;

-- ============================================================
-- STEP 6: SET REAL BCRYPT PASSWORD HASHES FOR SEED DOCTORS
--         Passwords: DR001=DrRahman@123 | DR002=DrLim@123 | DR003=DrAisha@123
--         Change these before going live!
-- ============================================================
UPDATE doctors SET password_hash = '$2b$10$RvzRXYagEWkI.yLlaVyp.u4JwpGIupzBbvLMrabNDDnhzqRo1oQUO' WHERE staff_id = 'DR001';
UPDATE doctors SET password_hash = '$2b$10$B5bxPxXPcHIKccXcxmAcGeXqGrA3repbfy0GiV9q2lRX8T0RINmqW' WHERE staff_id = 'DR002';
UPDATE doctors SET password_hash = '$2b$10$0O5yYGBcVrXbEK0BCZyML.20so0cWRda306cLpy2A.FSR7W/Gt24C' WHERE staff_id = 'DR003';


-- ============================================================
-- STEP 7: PERSISTENT CONSULTATION STATUS (Run this migration!)
--
--   Adds two new columns so that 'In Progress' and 'Completed'
--   statuses survive page refreshes, new tabs, and different
--   devices. Previously these were stored only in sessionStorage.
-- ============================================================

-- 7a. Add consultation_status column (Waiting / In Progress / Completed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'consultation_status'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN consultation_status TEXT NOT NULL DEFAULT 'Waiting'
            CHECK (consultation_status IN ('Waiting', 'In Progress', 'Completed'));
    END IF;
END $$;

-- 7b. Add timestamp for when consultation was marked complete
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'consultation_completed_at'
    ) THEN
        ALTER TABLE patients
            ADD COLUMN consultation_completed_at TIMESTAMP;
    END IF;
END $$;

-- 7c. Backfill existing rows that already have a doctor assigned
--     (they were already "In Progress" but never had the column)
UPDATE patients
SET consultation_status = 'In Progress'
WHERE seen_by_doctor_id IS NOT NULL
  AND consultation_status = 'Waiting';

-- 7d. Verify new columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'patients'
  AND column_name IN ('consultation_status', 'consultation_completed_at')
ORDER BY ordinal_position;

-- ============================================================
-- STEP 8: NEW COLUMNS (duration_seconds & clinical_history_edited)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'duration_seconds'
    ) THEN
        ALTER TABLE patients ADD COLUMN duration_seconds INTEGER;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'clinical_history_edited'
    ) THEN
        ALTER TABLE patients ADD COLUMN clinical_history_edited TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'clinical_history_generated'
    ) THEN
        ALTER TABLE patients ADD COLUMN clinical_history_generated TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'heart_beat_rhythm'
    ) THEN
        ALTER TABLE patients ADD COLUMN heart_beat_rhythm TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'vitals_scanned_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN vitals_scanned_at TIMESTAMP;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'vitals_ingested_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN vitals_ingested_at TIMESTAMP;
    END IF;
END $$;

-- ============================================================
-- STEP 9: CONFLICT PREVENTION TIMESTAMP COLUMNS
--         Enables "First Doctor Wins" optimistic locking for
--         clinical history and AI summary edits.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'history_updated_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN history_updated_at TIMESTAMP;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'summary_updated_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN summary_updated_at TIMESTAMP;
    END IF;
END $$;

