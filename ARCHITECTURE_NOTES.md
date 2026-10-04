# Architecture Notes - IDP Project (ED Triage System)

Last updated: 2026-10-04. This describes `server.js`, the active backend started by `npm start`.

## Current flow: formatter only

```text
Patient history form (id + complaints + details + optional final_notes_raw)
    |
    v
POST /api/sync/history (requires x-api-key)
    +-- Upsert patient data into PostgreSQL / Supabase
    +-- Require complaints and details; vital signs are optional
    +-- Run local red-flag combination rules (triageRules.js)
    +-- Format structured clinical history (formatter.js + question.csv)
    +-- Assign a queue number if the patient does not already have one
    +-- Save clinical_history_generated and rule results
    +-- Return status: FORMATTED and clinical_history_formatted
    |
    v
GET /api/view reads v_patient_queue
    +-- Returns clinical_history_formatted, preferring doctor edits
    |
    v
index.html refreshes its patient list every 10 seconds
    +-- Opening a patient shows Structured Clinical History
```

AI processing is temporarily disabled. The active backend does not initialize an Azure AI client or call an AI service. AI clinical summary generation, AI note summarization, and AI hidden-red-flag detection do not run. Azure AI credentials are not required for this flow.

The formatter organizes reported questionnaire answers using predefined sections and question labels. This structured output is not an AI clinical assessment. Free-text patient comments are stored in `final_notes_raw` and displayed separately.

## Processing and triage state

- New rows start with `triage_zone = 'PENDING'` while history is missing or formatting has not completed.
- Without both `complaints` and `details`, ingestion returns `WAITING_FOR_HISTORY`.
- Formatting proceeds as soon as history is available, without requiring heart rate or respiratory rate.
- Successful formatting saves `clinical_history_generated` and changes a null or `PENDING` triage zone to `UNKNOWN`. Existing non-pending zones are preserved. `UNKNOWN` means no clinical triage zone has been assigned by this flow.
- Local red-flag rules set `redflag` to `Yes` or `No` and store triggered rule IDs and labels in `details`. They do not assign a triage zone.
- Resubmitting history regenerates stored formatted history, preserving an existing queue number and doctor-edited history.
- A vitals-only update to a patient with stored generated history returns `ALREADY_FORMATTED` after merging vitals; it does not regenerate history.
- New records have null `ai_summary` and `final_note_summarized`. Older non-placeholder values are preserved; legacy `PENDING` placeholders are cleared when formatting completes.
- A formatting, queue, or save failure returns HTTP 500. The initial upsert can remain saved in a pending state; resubmitting history retries processing.

`/api/waiting-room` and `/api/status` read pending rows from the database. There is no in-memory waiting-room buffer. The waiting-room response retains the legacy label `Complete - Ready for Triage` for pending rows with history; this indicates readiness for the current formatting flow. Server status reports AI as `Disabled (formatter only)`.

## Actual endpoint and optional vitals

History and optional vitals both use **`POST /api/sync/history`**, matched by patient `id`. **`POST /api/sync/vitals` is not implemented.**

Example history-only body:

```json
{
  "id": "PATIENT-001",
  "complaints": ["Cough"],
  "details": { "confirm_cough": "Proceed" },
  "final_notes_raw": "Additional patient comments"
}
```

`complaints` and `details` can also be JSON-encoded strings. Optional vital fields accepted by the same route:

| Field | Accepted alias |
|---|---|
| `ppi` | `pi` |
| `respiratory_rate` | `rr` |
| `heart_rate` | `hr` |
| `hrv` | `cv` |
| `duration_seconds` | None |
| `heart_beat_rhythm` | None |
| `vitals_scanned_at` | `timestamp` |

Vitals are merged into the database and can be displayed in the dashboard. They do not gate formatting. The active ingestion route uses `heart_rate`, not `spo2`.

## Key patient columns

Types below match the table declaration in `server.js`; deployed migrations may define additional columns.

| Column | Declared type | Current purpose |
|---|---|---|
| `id` | TEXT | Patient identifier / primary key |
| `complaints` | TEXT | JSON-encoded chief complaints |
| `details` | TEXT | JSON-encoded answers and local rule results |
| `final_notes_raw` | TEXT | Original patient comments |
| `clinical_history_generated` | TEXT | Structured history produced by the formatter |
| `clinical_history_edited` | TEXT | Doctor-edited history; preferred by the dashboard |
| `redflag` | TEXT | Local rule result; initially `PENDING` |
| `triage_zone` | TEXT | Initially `PENDING`; new formatted records become `UNKNOWN` |
| `ai_summary` | TEXT | No new AI output while AI is disabled |
| `final_note_summarized` | TEXT | No new AI note summary while AI is disabled |
| `ppi`, `respiratory_rate`, `hrv`, `heart_rate` | TEXT | Optional vitals |
| `duration_seconds` | INTEGER | Optional measurement duration |
| `heart_beat_rhythm` | TEXT | Optional reported rhythm |
| `vitals_scanned_at`, `vitals_ingested_at` | TIMESTAMP | Optional measurement and ingestion times |
| `created_at` | TIMESTAMP | Database-generated creation time |

Queue assignment additionally requires `queue_number` and `consultation_status` in the deployed database. `/api/view` uses `v_patient_queue` and selects history in this order: doctor-edited history, stored generated history, live formatter fallback.

## Corrections to the earlier notes

The earlier notes incorrectly described separate history/vitals endpoints, a Gemini summary pipeline, an in-memory buffer, a separate hard-rules stage, and numeric `spo2` storage. Before the recent edits, the active backend actually merged both payload types into PostgreSQL through `/api/sync/history`, then required history, heart rate, and respiratory rate before calling Azure OpenAI. The current implementation removes the vitals gate and bypasses AI entirely.

## Future re-enablement

See [RESTORE_AI_AND_VITALS.md](RESTORE_AI_AND_VITALS.md) for agent instructions, restoration options, affected code, and required checks.

To re-enable AI, add an AI client and evaluation step, define its stored outputs, and update the dashboard and tests. The previous active provider was Azure OpenAI. Decide separately whether AI consumes history alone or optional vitals; preserve immediate availability of formatted history if that remains the desired behavior.

There is no separate vitals endpoint or in-memory buffer to restore. A future separate vitals endpoint would need implementation and documented client integrations.

## Related files and validation

- `server.js`: Active Express backend, ingestion, persistence, and dashboard API.
- `formatter.js` and `question.csv`: Clinical history formatting and labels.
- `triageRules.js`: Local red-flag combination detection.
- `index.html`: Local dashboard and structured history display.
- `status.html`: Server status and pending-patient display.
- `supabase_schema.sql`: Database migrations and queue-view definition; compare against the deployed schema when changing the database.
- `server-medllama.js`: Separate legacy backend; not started by `npm start`.
- `tests/history-ingestion.test.js`: Regression checks for formatting, persistence, dashboard output, local flags, late vitals, and errors. Run with `npm test` (`npm.cmd test` in PowerShell if execution policy blocks `npm.ps1`). These checks mock PostgreSQL and do not verify the deployed database schema.
