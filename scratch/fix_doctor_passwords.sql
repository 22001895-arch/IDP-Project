-- ============================================================
-- QUICK FIX: Run this in Supabase SQL Editor to set real passwords
-- DR001 → DrRahman@123
-- DR002 → DrLim@123
-- DR003 → DrAisha@123
-- ============================================================

-- First, check what's currently in the doctors table:
SELECT staff_id, email, LEFT(password_hash, 20) AS hash_preview, is_active FROM doctors;

-- Then run these updates:
UPDATE doctors SET password_hash = '$2b$10$RvzRXYagEWkI.yLlaVyp.u4JwpGIupzBbvLMrabNDDnhzqRo1oQUO' WHERE staff_id = 'DR001';
UPDATE doctors SET password_hash = '$2b$10$B5bxPxXPcHIKccXcxmAcGeXqGrA3repbfy0GiV9q2lRX8T0RINmqW' WHERE staff_id = 'DR002';
UPDATE doctors SET password_hash = '$2b$10$0O5yYGBcVrXbEK0BCZyML.20so0cWRda306cLpy2A.FSR7W/Gt24C' WHERE staff_id = 'DR003';

-- Verify the fix:
SELECT staff_id, email, LEFT(password_hash, 7) AS hash_start, is_active FROM doctors;
-- hash_start should show '$2b$10$' for all rows if hashes are correct
