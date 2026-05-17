// formatter.js — Clinical History Formatter (CSV-driven)
'use strict';

const fs = require('fs');
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
  { name: 'FEVER', triggers: ['prom_fever', 'confirm_fever'], prefixes: ['fever_', 'med_fever'] },
  { name: 'SHORTNESS OF BREATH', triggers: ['prom_sob', 'confirm_sob'], prefixes: ['resp_sob'] },
  { name: 'COUGH', triggers: ['prom_cough', 'confirm_cough'], prefixes: ['resp_cou'] },
  { name: 'VOMITING', triggers: ['prom_vomiting', 'confirm_vomiting'], prefixes: ['git_vom'] },
  { name: 'DIARRHOEA', triggers: ['prom_diarrhoea', 'confirm_diarrhoea'], prefixes: ['git_dia'] },
  { name: 'ABDOMINAL PAIN', triggers: ['prom_abdopain', 'confirm_abdopain'], prefixes: ['git_pain', 'pain_git_', 'git_0'] },
  { name: 'URINARY PROBLEMS', triggers: ['prom_gu', 'confirm_gu'], prefixes: ['gu_'] },
  { name: 'CHEST PAIN', triggers: ['prom_cardpain', 'confirm_cardpain'], prefixes: ['card_pain', 'pain_card_', 'card_0'] },
  { name: 'HEADACHE', triggers: ['prom_headache', 'confirm_headache'], prefixes: ['neuro_head'] },
  { name: 'DIZZINESS', triggers: ['prom_dizziness', 'confirm_dizziness'], prefixes: ['neuro_dizz'] },
  { name: 'BODY WEAKNESS', triggers: ['prom_weakness', 'confirm_weakness'], prefixes: ['neuro_weak'] },
  { name: 'FAINTING / BLACKOUT', triggers: ['prom_syncope', 'confirm_syncope'], prefixes: ['neuro_sync'] },
  { name: 'BLEEDING', triggers: ['prom_bleeding', 'confirm_bleeding'], prefixes: ['bleed_'] },
  { name: 'INJURY', triggers: ['prom_injury', 'confirm_injury'], prefixes: ['inj_'] },
  { name: 'SKIN PROBLEM', triggers: ['prom_skin', 'confirm_skin'], prefixes: ['skin_'] },
  { name: 'EYE PROBLEM', triggers: ['prom_eye', 'confirm_eye'], prefixes: ['eye_'] },
  { name: 'ENT PROBLEM', triggers: ['prom_ent', 'confirm_ent'], prefixes: ['ent_'] },
  { name: 'MUSCULOSKELETAL', triggers: ['prom_msk', 'confirm_msk'], prefixes: ['msk_'] },
  { name: 'SYSTEMIC SYMPTOMS', triggers: [], prefixes: ['sys_', 'og_'] },
  { name: 'NEUROLOGICAL SCREEN', triggers: [], prefixes: ['neuro_0'] },
  { name: 'PAST MEDICAL HISTORY', triggers: ['prompt_como01', 'prompt_como02', 'prompt_como02_lite'], prefixes: ['como_', 'risk_'] },
  { name: 'MEDICATIONS', triggers: [], prefixes: ['med_gen', 'med_0'] },
  { name: 'SOCIAL HISTORY', triggers: [], prefixes: ['soc_gen'] },
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
      const id = line.substring(0, comma).trim();
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

  // Specificity order matters
  if (/when was your last dialysis/.test(q)) return 'Last dialysis';
  if (/when was the stent inserted/.test(q)) return 'Stent insertion';
  if (/when did the injury happen|how did the injury happen/.test(q)) return 'Injury details';
  if (/when did|when was/.test(q)) return 'Onset';
  if (/start suddenly or gradually/.test(q)) return 'Onset';
  if (/how many days|how long have you had/.test(q)) return 'Duration';
  if (/how long/.test(q)) return 'Duration';
  if (/at rest or when you are active|at rest or during/.test(q)) return 'Occurs at';
  if (/limited.*ability to walk|limited.*usual activities/.test(q)) return 'Activity limitation';
  if (/one episode.*or multiple|have you had one episode/.test(q)) return 'Episode pattern';
  if (/is the pain on one side or both/.test(q)) return 'Side';
  if (/where do you feel|where is the|which part of your body/.test(q)) return 'Location';
  if (/how bad is the pain now|how bad was the pain|how bad is/.test(q)) return 'Severity';
  if (/can you describe/.test(q)) return 'Character';
  if (/what colour|what color/.test(q)) return 'Colour';
  if (/what does the vomit look/.test(q)) return 'Appearance';
  if (/which best describes your dizziness/.test(q)) return 'Dizziness type';
  if (/which best describes/.test(q)) return 'Type';
  if (/what were you doing when/.test(q)) return 'Activity at onset';
  if (/about how long were you unconscious/.test(q)) return 'Duration unconscious';
  if (/about how many cigarettes/.test(q)) return 'Cigarettes per day';
  if (/for how many years/.test(q)) return 'Duration (years)';
  if (/how often/.test(q)) return 'Frequency';
  if (/how many times/.test(q)) return 'Frequency';
  if (/how many episodes/.test(q)) return 'No. of episodes';
  if (/how long does each episode/.test(q)) return 'Episode duration';
  if (/how bad was the pain at its worst/.test(q)) return 'Worst severity';
  if (/what kind of|what problems are you having/.test(q)) return 'Type';
  if (/what do you think entered|what do you think is stuck/.test(q)) return 'Foreign body';
  if (/who do you live with/.test(q)) return 'Living situation';
  if (/which of the following best describes you/.test(q)) return 'Functional status';
  if (/what time did/.test(q)) return 'Time of onset';
  if (/what was the highest reading/.test(q)) return 'Highest temperature';
  if (/when was the last episode/.test(q)) return 'Last episode';
  if (/how many weeks pregnant/.test(q)) return 'Gestational age';
  if (/when was your last menstrual/.test(q)) return 'Last menstrual period';
  if (/is the swelling on one side or both/.test(q)) return 'Side affected';
  if (/which side is more swollen/.test(q)) return 'More swollen side';
  if (/which nostril/.test(q)) return 'Nostril affected';
  if (/which eye is affected/.test(q)) return 'Eye affected';
  if (/which ear is affected/.test(q)) return 'Ear affected';
  if (/is the pain on one side or both/.test(q)) return 'Side';
  if (/what body position/.test(q)) return 'Position at onset';
  if (/\(days ago\)/.test(q)) return 'Days ago';
  // Fallback: strip and capitalise
  const phrase = stripToPhrase(question);
  return cap(phrase);
}

function cap(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Helper to polish English for positive statements ────────────────────────
function polishPositive(phrase) {
  let s = phrase.toLowerCase();

  if (s.startsWith('hear a wheezing')) return 'Hears a wheezing sound when breathing';
  if (s.includes('measured your temperature') || s.includes('measured temperature')) return 'Measured temperature at home';
  if (s.startsWith('admitted to hospital')) return 'Admitted to hospital recently';
  if (s.startsWith('in contact with')) return 'In contact with unwell person(s)';
  if (s.startsWith('travelled overseas') || s.startsWith('traveled overseas')) return 'Recent overseas travel';
  if (s.startsWith('recently been hiking')) return 'Recent hiking or contact with rivers/muddy water';
  if (s.startsWith('taken fever medication')) return 'Has taken fever medication';
  if (s.startsWith('taken antibiotics')) return 'Has taken antibiotics recently';
  if (s.startsWith('received any vaccination')) return 'Has received recent vaccination';

  if (s.startsWith('limited your ability') || s.startsWith('limited ability')) return 'Limitation in usual activities';
  if (s.startsWith('breathless when lying')) return 'Breathless when lying flat';
  if (s.startsWith('waking up suddenly')) return 'Sudden waking at night from breathlessness';
  if (s.startsWith('shortness of breath triggered by')) return 'Triggered by dust, smoke, or cold air';
  if (s.includes('pain get worse when you take a deep breath')) return 'Pain worsens with deep breath or cough';

  if (s.startsWith('feeling nauseated')) return 'Experiencing nausea';
  if (s.includes('abdomen feel bloated')) return 'Abdomen feels bloated or distended';
  if (s.includes('coughing or moving make the pain worse')) return 'Pain worsens with movement or coughing';

  if (s.includes('injury to your eye')) return 'Preceding eye or face injury';
  if (s.includes('completely loss vision') || s.includes('completely lost vision')) return 'Complete loss of vision';
  if (s.includes('hurt when you move you eyes') || s.includes('hurt when you move your eyes')) return 'Pain with eye movement';
  if (s.includes('eye look like it is bulging')) return 'Eye appears bulging';
  if (s.includes('see rings or circles')) return 'Sees halos around lights';
  if (s.includes('bright lights make your eyes')) return 'Photophobia (sensitivity to bright lights)';
  if (s.includes('discharge in or around')) return 'Eye discharge present';
  if (s.includes('symptoms start or get worse in a dark')) return 'Symptoms worsen in the dark';
  if (s.includes('affected eye feel itchy')) return 'Eye feels itchy or gritty';
  if (s.includes('eyelids stuck together')) return 'Eyelids stuck together in the morning';
  if (s.startsWith('wear contact lenses')) return 'Wears contact lenses';
  if (s.includes('like something has entered your eye')) return 'Foreign body sensation in the eye';
  if (s.includes('recent eye surgery')) return 'Recent eye surgery or procedure';

  if (s.startsWith('lost your appetite')) return 'Loss of appetite';
  if (s.startsWith('lost weight')) return 'Unintentional weight loss';
  if (s.startsWith('feeling unusually tired')) return 'Unusual fatigue or lack of energy';
  if (s.startsWith('have muscle aches')) return 'Muscle or body aches present';
  if (s.startsWith('sweating a lot at night')) return 'Night sweats present';

  if (s.startsWith('currently taking any regular')) return 'Currently taking regular medications';
  if (s.startsWith('have any allergies')) return 'Has known drug allergies';

  return cap(phrase);
}

// ── Helper to polish English for negative statements ────────────────────────
function polishNegative(phrase) {
  let s = phrase.toLowerCase();

  if (s.startsWith('hear a wheezing')) return 'No wheezing sound heard when breathing';
  if (s.includes('measured your temperature') || s.includes('measured temperature')) return 'Did not measure temperature at home';
  if (s.startsWith('admitted to hospital')) return 'Not admitted to hospital';
  if (s.startsWith('in contact with')) return 'No contact with anyone unwell';
  if (s.startsWith('travelled overseas') || s.startsWith('traveled overseas')) return 'No recent overseas travel';
  if (s.startsWith('recently been hiking')) return 'No recent hiking or contact with rivers/muddy water';
  if (s.startsWith('taken fever medication')) return 'No fever medication taken';
  if (s.startsWith('taken antibiotics')) return 'No antibiotics taken recently';
  if (s.startsWith('received any vaccination')) return 'No recent vaccinations';

  if (s.startsWith('limited your ability') || s.startsWith('limited ability')) return 'No limitation in usual activities';
  if (s.startsWith('breathless when lying')) return 'Not breathless when lying flat';
  if (s.startsWith('waking up suddenly')) return 'No sudden waking at night from breathlessness';
  if (s.startsWith('shortness of breath triggered by')) return 'Not triggered by dust, smoke, or cold air';
  if (s.includes('pain get worse when you take a deep breath')) return 'Pain does not worsen with deep breath or cough';

  if (s.startsWith('feeling nauseated')) return 'Denies nausea';
  if (s.includes('abdomen feel bloated')) return 'Abdomen is not bloated or distended';
  if (s.includes('coughing or moving make the pain worse')) return 'Pain does not worsen with movement or coughing';

  if (s.includes('injury to your eye')) return 'No preceding eye or face injury';
  if (s.includes('completely loss vision') || s.includes('completely lost vision')) return 'No complete loss of vision';
  if (s.includes('hurt when you move you eyes') || s.includes('hurt when you move your eyes')) return 'No pain with eye movement';
  if (s.includes('eye look like it is bulging')) return 'Eye does not appear bulging';
  if (s.includes('see rings or circles')) return 'No halos seen around lights';
  if (s.includes('bright lights make your eyes')) return 'No photophobia (sensitivity to bright lights)';
  if (s.includes('discharge in or around')) return 'No eye discharge';
  if (s.includes('symptoms start or get worse in a dark')) return 'Symptoms do not worsen in the dark';
  if (s.includes('affected eye feel itchy')) return 'Eye does not feel itchy or gritty';
  if (s.includes('eyelids stuck together')) return 'Eyelids not stuck together in the morning';
  if (s.startsWith('wear contact lenses')) return 'Does not wear contact lenses';
  if (s.includes('like something has entered your eye')) return 'No foreign body sensation in the eye';
  if (s.includes('recent eye surgery')) return 'No recent eye surgery or procedures';

  if (s.startsWith('lost your appetite')) return 'No loss of appetite';
  if (s.startsWith('lost weight')) return 'No unintentional weight loss';
  if (s.startsWith('feeling unusually tired')) return 'No unusual fatigue';
  if (s.startsWith('have muscle aches')) return 'No muscle or body aches';
  if (s.startsWith('sweating a lot at night')) return 'No night sweats';

  if (s.startsWith('currently taking any regular')) return 'Not taking any regular medications';
  if (s.startsWith('have any allergies')) return 'No known drug allergies';

  // Fallback heuristics:
  const doesMatch = s.match(/^does (your |the )?(.*?) (feel|get|look|make) (.*)/);
  if (doesMatch) return cap(`${doesMatch[2]} does not ${doesMatch[3]} ${doesMatch[4]}`.trim());

  if (s.match(/^[a-z]+ing\b/)) return 'Denies ' + s;

  return 'No ' + s;
}

// ── Convert a label + value into a clinical statement ─────────────────────────
function toClinicalStatement(key, label, value) {
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(v => {
          if (v && typeof v === 'object') {
            if (v.label) return `  • ${v.label}${v.priority ? ` (${v.priority})` : ''}`;
            if (v.id) return `  • ${v.id}`;
            return `  • ${JSON.stringify(v)}`;
          }
          return `  • ${v}`;
        }).join('\n')
      : null;
  }

  const strVal = String(value).trim();
  if (!strVal || strVal === 'Proceed' || strVal === 'Selected') return null; // skip navigation keys

  const lower = strVal.toLowerCase();

  // Yes → positive statement
  if (lower === 'yes') {
    const phrase = stripToPhrase(label)
      .replace(/(\?|\.$)/g, '')
      .trim();
    return polishPositive(phrase);
  }

  // No → Checklist-style negative statement
  // This avoids awkward sentences like "No breathless when lying flat"
  if (lower === 'no') {
    const phrase = stripToPhrase(label)
      .replace(/(\?|\.$)/g, '')
      .trim();
    return polishNegative(phrase);
  }

  // Self-contained categorical answers (do not show label)
  const noLabelKeys = new Set([
    'soc_gen01', 'soc_gen02', 'soc_gen03', 'soc_gen04',
    'neuro_dizz01', 'neuro_sync03', 'soc_gen021'
  ]);
  if (noLabelKeys.has(key)) {
    return cap(strVal);
  }

  // Descriptive value — use short clinical label
  const shortLabel = getShortLabel(label);
  return `${shortLabel}: ${strVal}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
function formatClinicalHistory(complaints, details) {
  if (!details || typeof details !== 'object') return 'No detailed history available.';

  const labelMap = getLabelMap();
  const usedKeys = new Set(EXCLUDED_KEYS);
  let report = '';

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

      const statement = toClinicalStatement(key, label, value);
      if (statement) report += `${statement}\n`;
    }

    report += '\n';
  }

  // ── Catch-all: keys not covered by any section ────────────────────────────
  const remaining = Object.keys(details).filter(k => !usedKeys.has(k));
  if (remaining.length > 0) {
    report += `─── ADDITIONAL DETAILS ───\n`;
    for (const key of remaining) {
      const value = details[key];
      const label = labelMap[key];
      const display = label ? cap(stripToPhrase(label)) : cap(key.replace(/_/g, ' '));

      if (Array.isArray(value)) {
        if (value.length > 0) {
          report += `${display}:\n`;
          report += value.map(v => {
            if (v && typeof v === 'object') {
              if (v.label) return `  • ${v.label}${v.priority ? ` (${v.priority})` : ''}`;
              if (v.id) return `  • ${v.id}`;
              return `  • ${JSON.stringify(v)}`;
            }
            return `  • ${v}`;
          }).join('\n') + '\n';
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