const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the actual route without opening a port or contacting Azure/PostgreSQL.
function loadServer({ existing = {}, saveFails = false } = {}) {
    const routes = new Map();
    const queries = [];
    let patient = { ...existing };
    const app = {
        use() {},
        get(route, handler) { routes.set(route, handler); },
        post(route, ...handlers) { routes.set(route, handlers.at(-1)); },
        listen() {}
    };
    const express = () => app;
    express.json = () => () => {};
    class Pool {
        on() {}
        async query(sql, values) {
            queries.push({ sql, values });
            if (sql.includes('INSERT INTO patients')) {
                const fields = ['id', 'complaints', 'details', 'final_notes_raw', 'ppi',
                    'respiratory_rate', 'hrv', 'heart_rate', 'duration_seconds',
                    'heart_beat_rhythm', 'vitals_scanned_at', 'vitals_ingested_at'];
                patient = { triage_zone: 'PENDING', ...patient };
                fields.forEach((field, i) => {
                    if (values[i] !== null) patient[field] = values[i];
                });
                return { rows: [patient] };
            }
            if (sql.includes('UPDATE patients SET')) {
                if (saveFails) throw new Error('Database unavailable');
                patient = { ...patient, redflag: values[0], details: values[1],
                    queue_number: values[2], clinical_history_generated: values[3], triage_zone: 'UNKNOWN' };
            }
            if (sql.includes('SELECT * FROM patients') || sql.includes('SELECT * FROM v_patient_queue')) {
                return { rows: [patient] };
            }
            return { rows: [], rowCount: 1 };
        }
    }
    const mocks = {
        dotenv: { config() {} }, express, cors: () => () => {},
        pg: { Pool }, bcrypt: {}
    };
    const filename = path.join(__dirname, '..', 'server.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        require(name) {
            assert.notEqual(name, 'openai', 'Formatter-only backend must not load AI');
            return mocks[name] || require(name.startsWith('.')
                ? path.resolve(path.dirname(filename), name) : name);
        },
        __dirname: path.dirname(filename), process,
        console: { log() {}, warn() {}, error() {} }
    }, { filename });
    async function request(route, body) {
        let response;
        const res = {
            status() { return this; },
            json(data) { response = data; }
        };
        await routes.get(route)({ body }, res);
        return response;
    }
    return { request, queries };
}

test('history alone is formatted, persisted, and exposed through the dashboard API', async () => {
    const server = loadServer();
    const response = await server.request('/api/sync/history', {
        id: 'test-history-only', complaints: ['Cough'],
        details: { confirm_cough: 'Proceed', resp_cou01: 'Two days' },
        final_notes_raw: 'Additional patient comments'
    });
    assert.equal(response.success, true);
    assert.equal(response.status, 'FORMATTED');
    assert.match(response.clinical_history_formatted, /Cough/i);
    const saved = server.queries.find(q => q.sql.includes('clinical_history_generated = $4'));
    assert.ok(saved);
    assert.equal(saved.values[3], response.clinical_history_formatted);
    assert.equal(saved.values[4], 'test-history-only');
    const dashboard = await server.request('/api/view');
    assert.equal(dashboard[0].clinical_history_formatted, response.clinical_history_formatted);
    assert.equal(dashboard[0].triage_zone, 'UNKNOWN');
    assert.equal(dashboard[0].final_notes_raw, 'Additional patient comments');
});

test('vitals alone still wait for the history form', async () => {
    const server = loadServer();
    const response = await server.request('/api/sync/history', {
        id: 'test-vitals-only', heart_rate: 80, respiratory_rate: 16
    });
    assert.equal(response.status, 'WAITING_FOR_HISTORY');
    assert.ok(!server.queries.some(q => q.sql.includes('UPDATE patients SET')));
});

test('late vitals do not regenerate a completed history', async () => {
    const server = loadServer({ existing: {
        complaints: '["Cough"]', details: '{}', triage_zone: 'UNKNOWN',
        clinical_history_generated: 'Previously formatted history'
    } });
    const response = await server.request('/api/sync/history', {
        id: 'test-completed', heart_rate: 80, respiratory_rate: 16
    });
    assert.equal(response.status, 'ALREADY_FORMATTED');
    assert.ok(!server.queries.some(q => q.sql.includes('UPDATE patients SET')));
});

test('resubmitted history is regenerated while preserving the queue and doctor edits', async () => {
    const server = loadServer({ existing: {
        complaints: '["Cough"]', details: '{}', triage_zone: 'UNKNOWN', queue_number: 42,
        clinical_history_generated: 'Old history', clinical_history_edited: 'Doctor edit'
    } });
    const response = await server.request('/api/sync/history', {
        id: 'test-revised', complaints: '["Fever"]', details: '{}'
    });
    assert.equal(response.status, 'FORMATTED');
    assert.match(response.clinical_history_formatted, /Fever/i);
    const dashboard = await server.request('/api/view');
    assert.equal(dashboard[0].queue_number, 42);
    assert.equal(dashboard[0].clinical_history_formatted, 'Doctor edit');
});

test('local red-flag rules still work without AI', async () => {
    const server = loadServer();
    await server.request('/api/sync/history', {
        id: 'test-rules', complaints: ['Weakness'], details: { neuro_weak07: 'Yes' }
    });
    const saved = server.queries.find(q => q.sql.includes('UPDATE patients SET'));
    assert.equal(saved.values[0], 'Yes');
    assert.match(saved.values[1], /combo_neuro_balance_loss/);
});

test('database save failure is reported instead of claiming successful formatting', async () => {
    const server = loadServer({ saveFails: true });
    const response = await server.request('/api/sync/history', {
        id: 'test-db-failure', complaints: ['Cough'], details: {}
    });
    assert.equal(response.error, 'History processing failed');
});

test('waiting-room readiness depends only on history', async () => {
    const server = loadServer({ existing: {
        id: 'test-pending', complaints: '["Cough"]', details: '{}', triage_zone: 'PENDING'
    } });
    const response = await server.request('/api/waiting-room');
    assert.equal(response.waitingRoom[0].status, 'Complete - Ready for Triage');
    assert.equal(response.waitingRoom[0].hasHeartRate, false);
});

test('dashboard modal displays structured history instead of raw questionnaire JSON', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const elements = new Map();
    const context = vm.createContext({
        document: { getElementById(id) {
            assert.ok(html.includes(`id="${id}"`), `Dashboard element ${id} exists`);
            if (!elements.has(id)) elements.set(id, { style: {} });
            return elements.get(id);
        } },
        window: {}, setInterval() {}, console,
        fetch: async () => ({ ok: true, json: async () => [] }),
        testPatient: {
            id: 'test-dashboard', complaints: '["Cough"]', details: '{"confirm_cough":"Proceed"}',
            clinical_history_formatted: 'CHIEF COMPLAINTS\nCough\nStructured symptom details'
        }
    });
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    vm.runInContext("allPatients = [testPatient]; openModal('test-dashboard');", context);
    assert.equal(elements.get('modal-details').innerText, context.testPatient.clinical_history_formatted);
    assert.equal(elements.get('modal-rhythm').innerText, 'N/A');
    assert.equal(elements.get('patientModal').style.display, 'block');
});
