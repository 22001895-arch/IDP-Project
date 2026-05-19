// scratch/test_formatter.js — run with: node scratch/test_formatter.js
const { formatClinicalHistory } = require('../formatter.js');

const complaints = ['Skin problem'];

const details = {
  id: '03525392', age: '69', gender: 'Female',
  prompt_como01: ['High blood pressure', 'Diabetes'],
  como_10: 'No',
  prompt_como02_lite: ['None of these'],
  confirm_skin: 'Proceed',
  skin_01: ['Redness', 'Swelling', 'Itching', 'Rashes'],
  skin_02: ['Abdomen', 'RightForearm', 'LeftForearm', 'Head'],
  skin_03: '1',
  prom_sob: 'No',
  prom_fever: 'No',
  prom_dizziness: 'No',
  prom_abdopain: 'Yes',
  prom_diarrhoea: 'No',
  med_gen01: 'Yes',
  med_gen011: 'Yes',
  med_gen012: 'Yes',
  med_gen0121: 'No',
  med_gen013: 'Not sure',
  med_gen014: 'Yes',
  med_gen015: 'No',
  med_gen02: 'No',
  med_02: 'No',
  // Full social history — all sub-questions exercised
  soc_gen01: 'No',              // Ex-smoker path
  soc_gen011: '15',             // Cigarettes per day
  soc_gen012: '3',              // When did you stop smoking (days ago)
  soc_gen013: '25',             // For how many years smoked
  soc_gen02: 'Yes',             // Drinks alcohol
  soc_gen021: 'Socially (less than once a week)',
  soc_gen03: 'Alone',
  soc_gen04: 'I am well and active, but do not exercise regularly.',
  p_final_notes: 'Maybe is the medicine that give me rashes',
};

const result = formatClinicalHistory(complaints, details);
console.log(result);
