# Agent guide: restore AI processing and optional vitals integration

Written: 2026-10-04. This is a future implementation guide, not the current architecture. Read `ARCHITECTURE_NOTES.md` and the current code before making changes.

## Choose the requested restoration

Interpret the user's future request before changing the pipeline:

| Requested behavior | History formatting | AI evaluation | Vitals requirement |
|---|---|---|---|
| Restore AI summaries only | Save immediately | Run on history | None |
| Restore AI with optional vitals | Save immediately | Use available history and vitals; optionally refresh when vitals arrive | None for initial output |
| Restore the original wait-for-both behavior | Gate processing if explicitly requested | Run once history and required vitals are present | Both `heart_rate` and `respiratory_rate` |

If the user asks only to restore AI, default to the first option. Do not reintroduce the vitals wait implicitly. If the user explicitly asks for the original behavior, implement the third option. Preserve immediate formatted output unless the user asks to gate that output too.

## Baseline to preserve

- `npm start` runs `server.js`; `server-medllama.js` is a separate legacy implementation.
- `POST /api/sync/history` accepts history and optional vitals using the same patient `id` and requires `x-api-key`. There is no `/api/sync/vitals` route.
- Payloads are merged in PostgreSQL using an upsert, not an in-memory waiting-room buffer.
- `formatter.js` plus `question.csv` produces structured history in `clinical_history_generated`.
- `/api/view` returns `clinical_history_formatted`: doctor edit first, stored generated history second, live formatter fallback third.
- `index.html` shows structured history when a patient is opened and refreshes its list every 10 seconds.
- The local `detectRedFlags` engine remains active. It saves rule IDs and labels in `details`.
- New formatted patients currently have `triage_zone = 'UNKNOWN'`, not an AI-assigned zone.
- AI summary and summarized-note columns still exist. New records leave them null; older values may exist.

Keep doctor edits, consultation state, queue numbers, authentication, and red-flag overrides intact. Do not reset the database or replace whole files from an older revision to restore one feature.

## Restore history-based AI summaries

1. Inspect `server.js`, `formatter.js`, `triageRules.js`, `index.html`, `status.html`, `supabase_schema.sql`, and `tests/history-ingestion.test.js`. Check the actual deployed schema if database changes are needed.
2. Restore the Azure OpenAI client using the already-declared `openai` dependency. The previous configuration used `AzureOpenAI`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `DEPLOYMENT_NAME`, and API version `2024-02-01`. Verify the current SDK/API and deployment compatibility before implementing; the old version is historical information, not a requirement.
3. Prefer a reversible setting such as `AI_PROCESSING_ENABLED=false` by default. Construct the AI client only when enabled. Missing AI configuration must not break formatter-only startup. This setting does not exist yet; add and document it if used.
4. Keep history formatting and its database save before the AI request. The patient's structured history should be available through `/api/view` even if AI is slow or fails.
5. Extract AI evaluation into a helper rather than mixing prompts, persistence, queue allocation, and response handling into one block.
6. Use `getLabelMap()` from `formatter.js` to translate question IDs to readable questions. Exclude generated `triggeredRedFlagRuleIds` and `triggeredRedFlagRules` from the questionnaire input. Supply complaints, translated answers, and original patient notes.
7. Ask for a two-sentence clinical summary and a structured red-flag result. The previous result shape was:

   ```json
   {
     "summary": "Two-sentence history-based clinical summary.",
     "ai_redflag_detected": false,
     "ai_redflag_reason": "Reason based on the supplied history."
   }
   ```

8. Request JSON output and validate the parsed fields before saving. Missing vital signs must remain unknown; do not instruct the AI to assume normal measurements or clinical stability.
9. Save the validated summary to `patients.ai_summary`. If an AI red flag is detected, combine it with local rule results: AI must not clear a flag detected by local rules. The prior AI flag ID was `ai_hidden_redflag`, stored with a readable label and priority in the same arrays as local flags. Replace generated metadata when refreshing so duplicates and stale AI flags do not accumulate.
10. If restoring note summarization, summarize nonempty `final_notes_raw` separately into `final_note_summarized`. Retain the raw text. A notes-summary failure must not discard an already valid clinical summary or formatted history.
11. Define how AI completion is tracked. Do not use `clinical_history_generated` as evidence that AI ran, or `triage_zone` as the only completion marker: existing formatted records are `UNKNOWN`, and some older records may have stale AI summaries. Use explicit state or an input revision/hash if repeat evaluation is needed.
12. Protect against duplicate/concurrent requests and stale AI results. An evaluation of an older history must not overwrite a newer submission or a doctor's edited summary. Reuse the existing summary-edit timestamp contract (`summary_updated_at`) or introduce a documented revision check.
13. On AI failure, retain formatted history, local flags, queue assignment, and raw notes. Report an unavailable/failed AI state rather than representing AI as complete or moving a formatted patient back to the pending-history buffer.

If AI runs after responding, implement a managed background job or durable retry mechanism with tracked state; avoid an untracked promise that can lose work on server restart. If the ingestion response waits for AI, document that the database and dashboard can already expose formatted history while the request is still running.

## Restore the dashboard AI fields

In `index.html`, add a separate AI section while keeping Structured Clinical History:

- Add elements for the clinical summary and, if enabled, patient-notes summary. Previous element IDs were `modal-summary` and `modal-notes-summary`.
- Populate them in `openModal()` from `patient.ai_summary` and `patient.final_note_summarized` using `innerText` or `textContent`.
- Handle disabled, processing, unavailable, and completed states accurately. Legacy summary text is not proof of a completed evaluation for the latest history.
- Keep `modal-details` bound to `clinical_history_formatted`; do not replace it with raw JSON.
- Keep unavailable vitals displayed as `N/A`, including heart-beat rhythm.
- Update `/api/status` so `aiConnection` describes the actual configuration; do not always claim the connection is ready.

`/api/view` reads `v_patient_queue`. If new tracking columns are added, check whether the deployed view exposes them; a PostgreSQL view created with `p.*` may need recreation to include newly added columns. Retain its doctor joins and prioritization.

## Reintroduce vitals only when requested

Current normalization supports `heart_rate`/`hr`, `respiratory_rate`/`rr`, `ppi`/`pi`, and `hrv`/`cv`, plus `duration_seconds`, `heart_beat_rhythm`, and measurement timestamps. Use `heart_rate`, not the obsolete `spo2` field.

For optional vitals in AI:

1. Keep history-only formatting and evaluation working.
2. Include available measurements and their timestamps in the AI input; explicitly identify absent measurements.
3. If a second evaluation should run when vitals arrive, change the current early return for vitals-only payloads (`ALREADY_FORMATTED`). It currently skips all further processing when generated history exists.
4. Re-evaluate only when relevant inputs change; preserve the patient's queue and doctor edits. Track the input revision and stage so late results cannot overwrite newer evaluations.

For the original required-vitals gate:

1. After the database merge and JSON parsing, require both history fields and both `heart_rate` and `respiratory_rate` before AI evaluation. Add validation for the accepted measurement format; do not rely solely on truthiness.
2. Return `WAITING_FOR_HISTORY` when history is absent and `WAITING_FOR_VITALS` when required vitals are absent.
3. Place this gate before formatting/save/queue assignment only if the user explicitly requests that the structured output should also wait.
4. Adjust the vitals-only early return so arrival of the missing measurements can trigger AI even when formatted history already exists.
5. Align pending-state queries, waiting-room statuses, and `status.html` badges with the chosen behavior. If formatted patients use `UNKNOWN`, querying only `PENDING` will not identify those awaiting AI/vitals; use separate processing state as needed.
6. Keep merging both sources in the database. A separate vitals endpoint is optional new work, not an endpoint that can be simply restored. If added, share ingestion logic and update the vitals client and documentation.

## Triage-zone behavior is a separate decision

The former AI result schema contained a summary and red-flag fields but no triage zone. The old backend saved `GREEN` after successful AI processing regardless of the returned red-flag result. Do not treat that constant as an AI clinical decision.

Restoring summaries alone should preserve `UNKNOWN` for unassessed patients. If the user requests AI zone assignment, define a separate validated zone schema and precedence with local rules and doctor decisions, then test it. Exact restoration of the old constant-zone behavior must be explicitly requested and described accurately.

## Required verification and handoff

Update the existing tests: their current AI-loading prohibition is intentional for formatter-only mode and must remain valid when that mode is selected. Add mocked AI tests for the newly enabled mode.

Verify:

- Disabled mode starts without AI credentials and still saves/displays structured history.
- History-only input behaves according to the selected mode.
- Vitals-first, history-first, and combined payloads converge to the intended state.
- Valid AI output is saved and shown separately from structured history.
- Missing/malformed AI fields, timeouts, and provider failures preserve local output.
- Local red flags survive a negative AI result; refreshed flag metadata has no duplicates.
- Repeated requests and late responses do not duplicate queue assignment or overwrite newer inputs or doctor edits.
- Existing formatter-only patients can receive AI evaluation without being mistaken for already evaluated patients.
- Dashboard and waiting-room labels reflect processing state accurately.

Run `npm test` (`npm.cmd test` if PowerShell blocks `npm.ps1`), `node --check server.js`, and `git diff --check`. If database migrations are introduced, validate them against a test database and verify `/api/view`; the current mocked tests do not validate the live schema. Use a real AI request only with configured credentials and appropriate test data.

Update `README.md` and `ARCHITECTURE_NOTES.md` to describe the final implemented mode, new settings, API responses, migrations, and failure behavior. Report what was restored and which checks ran. This document alone does not authorize a future deployment or migration.

## Suggested instruction to give the future agent

> Read RESTORE_AI_AND_VITALS.md and ARCHITECTURE_NOTES.md, then restore Azure AI clinical summaries using history alone. Keep structured clinical history immediately available, preserve local red-flag detection and doctor edits, and keep vital signs optional. Restore a separate AI summary section in the dashboard. Implement and test a reversible AI setting, and update the architecture notes to match the final code.

If you want the original wait-for-both behavior instead, explicitly add:

> Require heart rate and respiratory rate before AI runs. [Keep formatted history immediately available / also delay formatted history until vitals arrive]. Implement the selected behavior and its waiting-room states.
