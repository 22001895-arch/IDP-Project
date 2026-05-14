// scratch/test_formatter.js — run with: node scratch/test_formatter.js
const { formatClinicalHistory } = require('../formatter.js');

const complaints = ['Shortness of breath', 'Chest pain'];

const details = {
  "id":            "RN57483954",
  "age":           "55",
  "gender":        "Male",
  "confirm_sob":   "Proceed",
  "prompt_como01": ["Kidney disease","Cancer","Previous stroke","Diabetes","Heart failure",
                    "Heart disease (previous heart attack, angina)","High blood pressure",
                    "COPD or chronic lung disease","Asthma"],
  "como_081":      "Yes",
  "como_091":      "Yes",
  "como_092":      "Yesterday",
  "como_10":       "Yes",
  "prompt_como02": ["Urinary catheter (tube to pass urine)","Feeding tube",
                    "Line or tube for medication or dialysis","Prosthetic heart valve",
                    "Implanted heart pacemaker"],
  "resp_sob01":    "Sudden",
  "resp_sob02":    "2",
  "resp_sob03":    "Both",
  "resp_sob04":    "Yes",
  "resp_sob05":    "Yes",
  "resp_sob06":    "Yes",
  "resp_sob07":    "Yes",
  "resp_sob08":    "Yes",
  "resp_sob09":    "Yes",
  "prom_cardpain": "Yes",
  "pain_card_01":  "UCC (Upper Central Chest)",
  "pain_card_03":  "Yes",
  "pain_card_04":  "Sudden",
  "pain_card_05":  "One continuous episode",
  "pain_card_06":  "Dull",
  "p_final_notes": "I took insulin yesterday\n"
};

const result = formatClinicalHistory(complaints, details);
console.log(result);
