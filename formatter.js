// formatter.js — Clinical History Formatter (CSV-driven)
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Keys to always exclude ────────────────────────────────────────────────────
const EXCLUDED_KEYS = new Set([
  'id', 'age', 'gender', 'name', 'patientName', 'patientAge', 'patientGender',
  'registrationNumber', 'rn', 'triggeredRedFlagRuleIds', 'p_final_notes'
]);

// ── Pattern that identifies routing/trigger keys ──────────────────────────────
const TRIGGER_RE = /^(prom_|confirm_|prompt_)/;

// ── Section definitions (order = display order) ───────────────────────────────
const SECTIONS = [
  { name: 'FEVER',                 triggers: ['prom_fever','confirm_fever'],                    prefixes: ['fever_','med_fever'] },
  { name: 'SHORTNESS OF BREATH',   triggers: ['prom_sob','confirm_sob'],                        prefixes: ['resp_sob'] },
  { name: 'COUGH',                 triggers: ['prom_cough','confirm_cough'],                    prefixes: ['resp_cou'] },
  { name: 'VOMITING',              triggers: ['prom_vomiting','confirm_vomiting'],              prefixes: ['git_vom'] },
  { name: 'DIARRHOEA',             triggers: ['prom_diarrhoea','confirm_diarrhoea'],            prefixes: ['git_dia'] },
  { name: 'ABDOMINAL PAIN',        triggers: ['prom_abdopain','confirm_abdopain'],              prefixes: ['git_pain','pain_git_','git_0'] },
  { name: 'URINARY PROBLEMS',      triggers: ['prom_gu','confirm_gu'],                          prefixes: ['gu_'] },
  { name: 'CHEST PAIN',            triggers: ['prom_cardpain','confirm_cardpain'],              prefixes: ['card_pain','pain_card_','card_0'] },
  { name: 'HEADACHE',              triggers: ['prom_headache','confirm_headache'],              prefixes: ['neuro_head'] },
  { name: 'DIZZINESS',             triggers: ['prom_dizziness','confirm_dizziness'],            prefixes: ['neuro_dizz'] },
  { name: 'BODY WEAKNESS',         triggers: ['prom_weakness','confirm_weakness'],              prefixes: ['neuro_weak'] },
  { name: 'FAINTING / BLACKOUT',   triggers: ['prom_syncope','confirm_syncope'],                prefixes: ['neuro_sync'] },
  { name: 'BLEEDING',              triggers: ['prom_bleeding','confirm_bleeding'],              prefixes: ['bleed_'] },
  { name: 'INJURY',                triggers: ['prom_injury','confirm_injury'],                  prefixes: ['inj_'] },
  { name: 'SKIN PROBLEM',          triggers: ['prom_skin','confirm_skin'],                      prefixes: ['skin_'] },
  { name: 'EYE PROBLEM',           triggers: ['prom_eye','confirm_eye'],                        prefixes: ['eye_'] },
  { name: 'ENT PROBLEM',           triggers: ['prom_ent','confirm_ent'],                        prefixes: ['ent_'] },
  { name: 'MUSCULOSKELETAL',        triggers: ['prom_msk','confirm_msk'],                       prefixes: ['msk_'] },
  { name: 'SYSTEMIC SYMPTOMS',     triggers: [],                                                prefixes: ['sys_','og_'] },
  { name: 'NEUROLOGICAL SCREEN',   triggers: [],                                                prefixes: ['neuro_0'] },
  { name: 'PAST MEDICAL HISTORY',  triggers: ['prompt_como01','prompt_como02','prompt_como02_lite'], prefixes: ['como_','risk_'] },
  { name: 'MEDICATIONS',           triggers: [],                                                prefixes: ['med_gen','med_0'] },
  { name: 'SOCIAL HISTORY',        triggers: [],                                                prefixes: ['soc_gen'] },
];

// ── Load question.csv into a labelMap (singleton) ─────────────────────────────
let _labelMap = null;
function getLabelMap() {
  if (_labelMap) return _labelMap;
  _labelMap = {};
  try {
    const content = fs.readFileSync(path.join(__dirname, 'question.csv'), 'utf-8');
    const lines = content.replace(/\r/g, '').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const comma = line.indexOf(',');
      if (comma === -1) continue;
      const id  = line.substring(0, comma).trim();
      let label = line.substring(comma + 1).trim();
      if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
      if (id && label) _labelMap[id] = label;
    }
    console.log(`[Formatter] Loaded ${Object.keys(_labelMap).length} labels from question.csv`);
  } catch (e) {
    console.error('[Formatter] Failed to load question.csv:', e.message);
  }
  return _labelMap;
}

// ── Strip question openers to get a bare clinical phrase ──────────────────────
function stripToPhrase(text) {
  return text
    .replace(/\?$/, '')
    .replace(/\(.*?\)/g, '')            // remove parenthetical hints like (👉 Tap on the area)
    .replace(/^(Do you have a |Do you feel |Do you |Have you had |Have you been |Have you noticed |Have you |Did you have |Did you |Did the |Is the pain |Is the |Is there |Are you |Was the |Were you |Does the |Does it |Can you describe the |Can you |Has it )/i, '')
    .replace(/^(been |had |felt |feel |feel a |feel the |noticed |notice )/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Map a question to a short clinical label (for descriptive answers) ─────────
function getShortLabel(question) {
  const q = question.toLowerCase();
  if (/when did|when was your last dialysis/.test(q))                  return 'Last dialysis';
  if (/when did|when was/.test(q))                                    return 'Onset';
  if (/start suddenly or gradually/.test(q))                          return 'Onset';
  if (/how many days|how long have you had/.test(q))                  return 'Duration';
  if (/how long/.test(q))                                             return 'Duration';
  if (/at rest or when you are active|at rest or during/.test(q))    return 'Occurs at';
  if (/limited.*ability to walk|limited.*usual activities/.test(q))  return 'Activity limitation';
  if (/one episode.*or multiple|have you had one episode/.test(q))   return 'Episode pattern';
  if (/is the pain on one side or both/.test(q))                     return 'Side';
  if (/where do you feel|where is the|which part of your body/.test(q)) return 'Location';
  if (/how bad is the pain now|how bad was the pain|how bad is/.test(q)) return 'Severity';
  if (/can you describe/.test(q))                                     return 'Character';
  if (/what colour|what color/.test(q))                               return 'Colour';
  if (/what does the vomit look/.test(q))                             return 'Appearance';
  if (/which best describes your dizziness/.test(q))                  return 'Dizziness type';
  if (/which best describes/.test(q))                                 return 'Type';
  if (/what were you doing when/.test(q))                             return 'Activity at onset';
  if (/about how long were you unconscious/.test(q))                  return 'Duration unconscious';
  if (/about how many cigarettes/.test(q))                            return 'Cigarettes per day';
  if (/for how many years/.test(q))                                   return 'Duration (years)';
  if (/how often/.test(q))                                            return 'Frequency';
  if (/how many times/.test(q))                                       return 'Frequency';
  if (/how many episodes/.test(q))                                    return 'No. of episodes';
  if (/how long does each episode/.test(q))                           return 'Episode duration';
  if (/how bad was the pain at its worst/.test(q))                    return 'Worst severity';
  if (/what kind of|what problems are you having/.test(q))            return 'Type';
  if (/what do you think entered|what do you think is stuck/.test(q)) return 'Foreign body';
  if (/who do you live with/.test(q))                                 return 'Living situation';
  if (/which of the following best describes you/.test(q))            return 'Functional status';
  if (/what time did/.test(q))                                        return 'Time of onset';
  if (/what was the highest reading/.test(q))                         return 'Highest temperature';
  if (/when was your last dialysis/.test(q))                          return 'Last dialysis';
  if (/when was the last episode/.test(q))                            return 'Last episode';
  if (/how many weeks pregnant/.test(q))                              return 'Gestational age';
  if (/when was your last menstrual/.test(q))                         return 'Last menstrual period';
  if (/is the swelling on one side or both/.test(q))                  return 'Side affected';
  if (/which side is more swollen/.test(q))                           return 'More swollen side';
  if (/which nostril/.test(q))                                        return 'Nostril affected';
  if (/which eye is affected/.test(q))                                return 'Eye affected';
  if (/which ear is affected/.test(q))                                return 'Ear affected';
  if (/is the pain on one side or both/.test(q))                      return 'Side';
  if (/what body position/.test(q))                                   return 'Position at onset';
  if (/\(days ago\)/.test(q))                                         return 'Days ago';
  // Fallback: strip and capitalise
  const phrase = stripToPhrase(question);
  return cap(phrase);
}

function cap(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Convert a label + value into a clinical statement ─────────────────────────
function toClinicalStatement(label, value) {
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(v => `  • ${v}`).join('\n')
      : null;
  }

  const strVal = String(value).trim();
  if (!strVal || strVal === 'Proceed') return null;   // pure navigation value — skip

  const lower = strVal.toLowerCase();

  // Yes → positive statement (clean up to read naturally)
  if (lower === 'yes') {
    const phrase = stripToPhrase(label)
      .replace(/(\?|\.$)/g, '')
      .trim();
    return cap(phrase);
  }

  // No → negative statement
  if (lower === 'no') {
    const phrase = stripToPhrase(label)
      .replace(/(\?|\.$)/g, '')
      .trim();
    return `No ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
  }

  // Descriptive value — use short clinical label
  const shortLabel = getShortLabel(label);
  return `${shortLabel}: ${strVal}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
function formatClinicalHistory(complaints, details) {
  if (!details || typeof details !== 'object') return 'No detailed history available.';

  const labelMap  = getLabelMap();
  const usedKeys  = new Set(EXCLUDED_KEYS);
  let report      = '';

  // ── Header ─────────────────────────────────────────────────────────────────
  const mainComplaints = Array.isArray(complaints)
    ? complaints.join(', ')
    : (complaints || 'Unspecified');
  report += `PRESENTING COMPLAINT: ${mainComplaints}\n`;
  report += `═══════════════════════════════════════════\n\n`;

  // ── Defined sections ────────────────────────────────────────────────────────
  for (const section of SECTIONS) {
    // Collect keys belonging to this section (not yet used)
    const sectionKeys = Object.keys(details).filter(key => {
      if (usedKeys.has(key)) return false;
      if (section.triggers.includes(key)) return true;
      return section.prefixes.some(p => key.startsWith(p));
    });

    if (sectionKeys.length === 0) continue;

    // Determine whether there is real content (not just routing trigger keys)
    const hasContent = sectionKeys.some(k => {
      if (!TRIGGER_RE.test(k)) return true;
      // Array trigger keys (prompt_como01 etc.) count as content
      return Array.isArray(details[k]) && details[k].length > 0;
    });

    if (!hasContent) {
      sectionKeys.forEach(k => usedKeys.add(k));
      continue;
    }

    report += `─── ${section.name} ───\n`;

    for (const key of sectionKeys) {
      usedKeys.add(key);
      const value = details[key];

      if (TRIGGER_RE.test(key)) {
        // Only render array triggers (e.g. prompt_como01 = list of conditions)
        if (Array.isArray(value) && value.length > 0) {
          const label = labelMap[key] || key;
          report += `${cap(stripToPhrase(label))}:\n`;
          report += value.map(v => `  • ${v}`).join('\n') + '\n';
        }
        continue;
      }

      const label = labelMap[key];
      if (!label) {
        // Not in question.csv — will appear in catch-all; restore the key
        usedKeys.delete(key);
        continue;
      }

      const statement = toClinicalStatement(label, value);
      if (statement) report += `${statement}\n`;
    }

    report += '\n';
  }

  // ── Catch-all: keys not covered by any section ────────────────────────────
  const remaining = Object.keys(details).filter(k => !usedKeys.has(k));
  if (remaining.length > 0) {
    report += `─── ADDITIONAL DETAILS ───\n`;
    for (const key of remaining) {
      const value  = details[key];
      const label  = labelMap[key];
      const display = label ? cap(stripToPhrase(label)) : cap(key.replace(/_/g, ' '));

      if (Array.isArray(value)) {
        if (value.length > 0) {
          report += `${display}:\n`;
          report += value.map(v => `  • ${v}`).join('\n') + '\n';
        }
      } else {
        const strVal = String(value).trim();
        if (strVal && strVal !== 'Proceed') {
          report += `${display}: ${strVal}\n`;
        }
      }
    }
    report += '\n';
  }

  return report.trim();
}

module.exports = { formatClinicalHistory };