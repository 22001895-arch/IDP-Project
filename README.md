# IDP Central Backend Server

The **IDP Central Backend** is a Node.js/Express server that serves as the clinical data hub for the Intelligent Diagnostic Platform (IDP). It orchestrates real-time patient data ingestion, processes medical triage through a hybrid rule-based/AI engine, and manages the Doctor Dashboard interface.

## 🚀 Key Features

- **Dual-Stage Triage Pipeline**: 
  - **Stage 1 (Hard Rules)**: An engine with **15+ specialized medical rules** (e.g., cardiac indicators, neurological deficits, severe respiratory distress) that triggers immediate alerts.
  - **Stage 2 (AI Analysis)**: Azure OpenAI (Gemini/GPT) fallback for nuanced cases, providing categorization (RED, YELLOW, GREEN) and professional clinical summaries.
- **rPPG Vitals Integration**: Processes contactless vitals including Heart Rate, HRV (Heart Rate Variability), Respiratory Rate, and PPI (Pulse-to-Pulse Interval).
- **Patient History Mapping**: Ingests structured symptom data and maps it to human-readable labels using a centralized `question.csv` bank.
- **Doctor Authentication**: Secure RBAC (Role-Based Access Control) using `bcrypt` password hashing.
- **Clinical Dashboard API**: Serves a prioritized queue (`v_patient_queue`) that automatically floats high-risk patients to the top.
- **Doctor Interventions**: Support for starting consultations, tracking clinical progress, and manual red-flag overrides for physician review.

## 🛠️ Tech Stack

- **Runtime**: Node.js 20+ & Express
- **Database**: PostgreSQL (via Supabase) with custom views for queue management.
- **AI/ML**: Azure OpenAI / Gemini for medical-grade summarization and decision support.
- **Security**: `bcrypt` for credentials, API Key verification for ingestion endpoints.
- **Formatting**: Custom clinical history formatter for structured symptom visualization.

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/22001895-arch/IDP-Project.git
   cd IDP-Project
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory with:
   - `DATABASE_URL`: PostgreSQL connection string.
   - `AZURE_OPENAI_API_KEY`: Azure/OpenAI API key.
   - `AZURE_OPENAI_ENDPOINT`: API endpoint.
   - `DEPLOYMENT_NAME`: AI model deployment ID.
   - `HOSPITAL_API_KEY`: Secret key for securing data ingestion from the History/rPPG apps.

4. **Initialize Database**:
   - Run `supabase_schema.sql` in your SQL editor to create the `doctors` and `patients` tables and the optimized views.

5. **Start the Server**:
   ```bash
   npm start
   ```

## 🔌 API Reference

### Authentication
- `POST /api/auth/login`: Doctor login (Email/Password).

### Data Ingestion (Secured with `x-api-key`)
- `POST /api/sync/history`: Syncs patient vitals and symptom history. Triggers the Triage Engine automatically once both datasets are present.

### Dashboard Operations
- `GET /api/view`: Returns a "Pretty" list of patients with formatted clinical histories, sorted by priority.
- `GET /api/waiting-room`: Lists patients currently awaiting vitals or history completion.
- `POST /api/patient/:id/start-consultation`: Marks a patient as "In Consultation" and assigns the doctor ID.
- `POST /api/patient/:id/override-redflag`: Allows a doctor to manually clear an AI/Rule flag after assessment.

## 📂 Project Structure

- `server.js`: Central Express server and AI pipeline orchestration.
- `triageRules.js`: The hard-rule engine containing red flag combination logic.
- `formatter.js`: Logic for converting raw question IDs into readable clinical reports.
- `question.csv`: The source-of-truth mapping for all clinical questions.
- `redflag_combinations.csv`: Documentation of the rules implemented in the triage engine.
- `supabase_schema.sql`: Full database schema including views for queue prioritization.

---
**Version**: 1.2.0  
**Status**: Production Ready  
**Last Updated**: May 14, 2026

