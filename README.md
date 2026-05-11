# IDP Central Backend Server

The **IDP Central Backend** is a Node.js/Express server that serves as the clinical data hub. it handles real-time patient ingestion from rPPG and History apps, processes medical triage via Azure OpenAI, and manages the doctor dashboard interactions.

## 🚀 Key Features

- **Automated Triage Pipeline**: Combines clinical vitals (rPPG) and patient history with Azure OpenAI to categorize patients into Red, Yellow, or Green zones.
- **Doctor Authentication**: Custom login system with secure password hashing via `bcrypt`.
- **Database Management**: Integrated with Supabase (PostgreSQL) for persistent patient records and audit logs.
- **Audit Tracking**: Automatically records which doctor starts each consultation and when.
- **Red Flag Engine**: Triggered by high-priority symptoms to alert clinical staff immediately.

## 🛠️ Tech Stack

- **Node.js & Express**: Core server framework.
- **PostgreSQL (Supabase)**: Relational database for patient and doctor data.
- **Azure OpenAI**: Medical-grade AI summarization and triage logic.
- **bcrypt**: Security for doctor credentials.

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
   Create a `.env` file in the root directory (refer to `.env.example` if available) with:
   - `DATABASE_URL`: Your Supabase connection string.
   - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI key.
   - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint.
   - `DEPLOYMENT_NAME`: Your GPT-4 deployment name.
   - `HOSPITAL_API_KEY`: Secret key for securing clinical data ingestion.

4. **Initialize Database**:
   Run the SQL found in `supabase_schema.sql` within your Supabase SQL Editor to create the `doctors` and `patients` tables.

5. **Start the Server**:
   ```bash
   npm start
   ```
   The server will run on `http://localhost:5000`.

## 🔌 API Reference

### Authentication
- `POST /api/auth/login`: Authenticate a doctor and receive a session object.

### Data Ingestion
- `POST /api/sync/history`: (Secured) Sync patient vitals and history for AI processing.

### Dashboard Operations
- `GET /api/view`: Fetch all patients via the `v_patient_queue` view (priority sorted).
- `POST /api/patient/:id/start-consultation`: Assign a doctor to a patient record.
- `POST /api/patient/:id/override-redflag`: Manually clear a red flag alert.

## 📄 Database Schema
The project uses a structured PostgreSQL schema with views:
- `patients`: Core record table.
- `doctors`: Clinical staff accounts.
- `v_patient_queue`: A view that automatically floats red-flag patients to the top of the queue.

---
**Version**: 1.1.0
**Last Updated**: May 11, 2026
