// backend/triageRules.js

const COMPLAINT_RULES = {
  "Fever": (selected, history) => {
    const assoc = history.f_assoc || [];
    const temp = parseFloat(history.f_pattern);
    const hasInfect = !!history.f_infect;
    const hasTravel = !!history.f_travel;
    const day = parseFloat(history.f_duration);

    //Sepsis
    if (temp >= 39 && (assoc.includes("Feeling cold/Shivering")||assoc.includes("Confusion/Unusual behaviour")||assoc.includes("Very tired/Weak"))){
      return { zone: "RED", summary: "EMERGENCY: Possible Sepsis / Severe Infection\nRationale: High Fever + Rigors/AMS/Immunocompromised = Sepsis Risk." };
    }
    if (hasInfect && (assoc.includes("Shortness of breath")||assoc.includes("Chest pain/Fast heartbeat")||assoc.includes("Confusion/Unusual behaviour"))){
      return { zone: "RED", summary: "EMERGENCY: Possible Sepsis / Severe Infection\nRationale: High Fever + Rigors/AMS/Immunocompromised = Sepsis Risk." };
    }

    //Meningtis/Encephalitis
    if (assoc.includes("Headache") && (assoc.includes("Stiff neck")||assoc.includes("Confusion/Unusual behaviour"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Meningtis / Encephalitis\nRationale: Fever + Headache + Neck Stiffness / AMS is classic CNS infection." };
    }
    if (assoc.includes("Seizure") && temp >=38) {
      return { zone: "RED", summary: "EMERGENCY: Possible Meningtis / Encephalitis\nRationale: Fever + Headache + Neck Stiffness / AMS is classic CNS infection." };
    }
    
    //Pneumonia
    if (assoc.includes("Shortness of breath") && (temp>=38||assoc.includes("Feeling cold/Shivering"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Severe Respiratory Infection (Pneumonia)\nRationale: Fever + Dyspnoea = Pneumonia/Covid/Sepsis concern." };
    }
    
    //Cardiac Infection/ACS Mimic
    if (assoc.includes("Chest pain/Fast heartbeat") && temp>=38) {
      return { zone: "RED", summary: "EMERGENCY: Possible Cardiac Infection\nRationale: Fever + Chest pain = Myocarditis/Endocarditis/ACS Mimic." };
    }

    //Urinary Tract Infection
    if (assoc.includes("Pain or burning when passing urine/Back pain") && (temp>=38||assoc.includes("Feeling cold/Shivering"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Severe Uriary Tract Infection\nRationale: Fever + Flank pain + Rigors = Pyelonephritis/Urosepsis." };
    }

    //Viral Hemorrhagic Fever
    if (assoc.includes("Easy bruising/Bleeding") && (assoc.includes("Very tired/Weak")||assoc.includes("Loss of appetite/Weight loss"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Dengue / Viral Hemorrhagic Fever\nRationale: Fever + Bleeding + Lethargy is dangerous in endemic regions." };
    }
    if (hasTravel && assoc.includes("Easy bruising/Bleeding")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Dengue / Viral Hemorrhagic Fever\nRationale: Fever + Bleeding + Lethargy is dangerous in endemic regions." };
    }

    //Chronic Infection
    if (day>=14 && (assoc.includes("Night sweats")||assoc.includes("Loss of appetite/Weight loss"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Tuberculosis / Chronic Infection\nRationale: Prolonged fever + Weight loss/Night sweats." };
    }

    //Stroke Mimic/CNS Infection
    if (assoc.includes("Confusion/Unusual behaviour") && (assoc.includes("Dizziness")||assoc.includes("Headache"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Stroke Mimic / CNS Infection\nRationale: Fever + AMS + Dizziness/Headache = CNS emergency until proven otherwise." };
    }

    return null;
  },



  "Headache": (selected, history) => {
    const feel = history.h_feel || [];
    const assoc = history.h_assoc || [];
    const score = parseInt(history.h_score,10);
    const loc = history.h_location || [];

    // Subarachnoid Haemorrhage (SAH)
    if (history.h_onset === "Sudden" && feel.includes("Worst headache I have ever had")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Subarachnoid Haemorrhage\nRationale: Sudden, Worst-ever headache = SAH until proven otherwise." };
    }

    //Stroke
    if (assoc.includes("Weakness, numbness, slurred speech, or face drooping")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Stroke / Intracranial Event\nRationale: Headache + Focal Neurology/AMS = Central cause." };
    }
    if (assoc.includes("Feeling confused or unusually drowsy")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Stroke / Intracranial Event\nRationale: Headache + Focal Neurology/AMS = Central cause." };
    }

    //Meningtis / Encephalitis
    if (assoc.includes("Fever") && (assoc.includes("Feeling confused or unusually drowsy")||assoc.includes("Seizure or fits"))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Meningtis / Encephalitis\nRationale: Fever + Headache + AMS/Seizure = CNS infection risk." };
    }
    if (assoc.includes("Fever") && score>=7) {
      return { zone: "RED", summary: "EMERGENCY: Possible Meningtis / Encephalitis\nRationale: Fever + Headache + AMS/Seizure = CNS infection risk." };
    }
    
    //Intracranial Bleed / Post-Traumatic Brain Injury
    if (assoc.includes("Recent head injury or fall") && (assoc.includes("Feeling confused or unusually drowsy")||score>=7)) {
      return { zone: "RED", summary: "EMERGENCY: Possible Intracranial Bleed / Post-Traumatic Brain Injury\nRationale: Head injury + Headache + AMS = Bleed until proven otherwise." };
    }

    //Seizure-Related Intracranial Pathology
    if (assoc.includes("Seizure or fits")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Seizure-Related Intracranial Pathology\nRationale: Seizure + Headache may indicate bleed, infection, tumour." };
    }

    //Cavernous Sinus / Orbital Infection
    if (loc.includes("Around or behind the eyes") && assoc.includes("Fever") && assoc.includes("Blurred/Double vision")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Cavernous Sinus / Orbital Infection\nRationale: Orbital pain + Fever + Visual symptoms = Serious infection risk." };
    }

    return null;
  },




  "Dizziness": (selected, history) => {
    const assoc = history.dz_assoc || [];
    const onset = history.dz_onset || [];
    const feel = history.dz_feel || [];
    const trigger = history.dz_trigger || [];

    //Posterior Circulation Stroke
    if (onset.includes("Sudden") && assoc.includes("Face drooping, slurred speech, weakness or numbness")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Posterior Circulation Stroke\nRationale: Central vertigo until proven otherwise." };
    }
    if (feel.includes("Unsteady or off-balance") && assoc.includes("Face drooping, slurred speech, weakness or numbness")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Posterior Circulation Stroke\nRationale: Central vertigo until proven otherwise." };
    }

    //Arrhythmia / Ischaemia
    if (assoc.includes("Chest pain or fast heartbeat") && feel.includes("Feeling light-headed or faint")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Arrhythmia / Ischaemia\nRationale: Light-headedness + Chest symptoms or Syncope =Cardiac risk." };
    }
    if (assoc.includes("Fainted or passed out")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Arrhythmia / Ischaemia\nRationale: Light-headedness + Chest symptoms or Syncope =Cardiac risk." };
    }

    //Suspected Head Injury / Intracranial Bleed
    if (assoc.includes("Recent injury or fall") && onset.includes("Sudden")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Suspected Head Injury / Intracranial Bleed\nRationale: Sudden dizziness post-trauma needs urgent exclusion of bleed." };
    }

    //Central Vertigo (Non-Peripheral)
    if (feel.includes("Feeling light-headed or faint") && onset.includes("Sudden") && trigger.includes("It happens on its own")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Central Vertigo (Non-Peripheral)\nRationale: Acute, spontaneous imbalance ≠ BPPV -> Central cause concern." };
    }

    //Serious Ear / CNS Infection
    if (assoc.includes("Ear pain/discharge") && assoc.includes("Face drooping, slurred speech, weakness or numbness")) {
      return { zone: "RED", summary: "EMERGENCY: Possible Serious Ear / CNS Infection\nRationale: Otogenic infection with CNS involvement is rare but dangerous." };
    }

    return null;
  },




  "Chest pain": (selected, history) => {
    const assoc = history.cp_assoc || [];
    const score = parseInt(history.cp_score,10);
    const feel = history.cp_feel || [];
    const rad = history.cp_rad || [];
    const loc = history.cp_location || [];
    const prec = history.cp_precipitate || [];
    const onset = history.cp_onset || [];

    //Acute Coronary Syndrome (ACS / MI)
    if (loc.includes("Middle of the chest") && ((feel.includes("Heavy or pressure-like"))||(feel.includes("Tight or squeezing"))) && score>=7) {
      return { zone: "RED", summary: "EMERGENCY: Possible Acute Coronary Syndrome (ACS / MI)\nRationale: Typical ischemic pattern -> must rule out MI." };
    }
    if (((rad.includes("Jaw"))||(rad.includes("Left arm"))) && ((feel.includes("Heavy or pressure-like"))||(feel.includes("Tight or squeezing")))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Acute Coronary Syndrome (ACS / MI)\nRationale: Typical ischemic pattern -> must rule out MI." };
    }
    if (prec.includes("During physical activity") && ((feel.includes("Heavy or pressure-like"))||(feel.includes("Tight or squeezing")))) {
      return { zone: "RED", summary: "EMERGENCY: Possible Acute Coronary Syndrome (ACS / MI)\nRationale: Typical ischemic pattern -> must rule out MI." };
    }

    //Aortic Dissection
    if (onset.includes("Sudden") && rad.includes("Back") && score>=7) {
      return { zone: "RED", summary: "EMERGENCY: Potential Aortic Dissection\nRationale: Sudden severe chest/back pain = dissection until it is proven." };
    }

    //Pulmonary Embolism
    if (assoc.includes("Shortness of breath") && onset.includes("Sudden")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Pulmonary Embolism\nRationale: Acute dyspnoea + Chest pain = PE risk." };
    }
    if (assoc.includes("Shortness of breath") && assoc.includes("Fast or irregular heartbeat")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Pulmonary Embolism\nRationale: Acute dyspnoea + Chest pain = PE risk." };
    }

    //Life-Threatening Arrhythmia
    if (assoc.includes("Fast or irregular heartbeat") && assoc.includes("Shortness of breath")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Life-Threatening Arrhythmia\nRationale: Chest symptoms + Palpitations may indicate unstable rhythm." };
    }

    //Pneumothorax
    if (assoc.includes("Shortness of breath") && onset.includes("Sudden") && feel.includes("Sharp")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Pneumothorax\nRationale: Sudden sharp pain + Dyspnoea = Collapsed lung risk." };
    }

    //Chest Pain with Shock / Systemic Compromise
    if (assoc.includes("Cold sweats") && score>=8) {
      return { zone: "RED", summary: "EMERGENCY: Potential Chest Pain with Shock / Systemic Compromise\nRationale: Sudden sharp pain + Dyspnoea = Collapsed lung risk." };
    }

    return null;
  },




  "Abdominal pain": (selected, history) => {
    const assoc = history.abd_assoc || [];
    const onset = history.abd_onset || [];
    const char = history.abd_char || [];
    const score = parseInt(history.abd_score);
    const rad = history.abd_rad || [];
    const goodPosture = !!history.abd_posture;
    const hasMed = !!history.abd_med;
    const loc = history.abd_location || [];
    const hasFam = !!history.abd_fam;

    //Perforated Viscus / Acute Abdomen
    if (onset.includes("Sudden") && char.includes("Sharp") && score>=8) {
      return { zone: "RED", summary: "EMERGENCY: Potential Perforated Viscus / Acute Abdomen\nRationale: Sudden severe sharp pain = surgical emergency until proven otherwise." };
    }

    //Acute Pancreatitis
    if (rad.includes("Back") && goodPosture && assoc.includes("Nausea/Vomiting")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Acute Pancreatitis\nRationale: Classic pancreatitis pain relieved by leaning forward." };
    }

    //Ruptured/Bleeding Peptic Ulcer
    if (assoc.includes("Vomiting blood") || assoc.includes("Blood in stool")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Ruptured/Bleeding Peptic Ulcer\nRationale: Any GI bleeding = emergency." };
    }

    //Bowel Obstruction
    if (char.includes("Cramping (comes and goes)") && assoc.includes("Constipation") && assoc.includes("Abdominal swelling or lump")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Bowel Obstruction\nRationale: Colicky pain + Distension + Surgical history = Obstruction risk." };
    }
    if (hasMed && char.includes("Cramping (comes and goes)") && assoc.includes("Constipation")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Bowel Obstruction\nRationale: Colicky pain + Distension + Surgical history = Obstruction risk." };
    }

    //Appendicitis (Complicated/Severe)
    if (loc.includes("RIF") && score>=7 && assoc.includes("Nausea/Vomiting")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Appendicitis (Complicated/Severe)\nRationale: Classic appendicitis pattern -> surgical review required." };
    }

    //Hepatobiliary Sepsis / Obstructive Jaundice
    if (assoc.includes("Yellowing of eyes or skin") && assoc.includes("Loss of appetite or weight loss")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Hepatobiliary Sepsis / Obstructive Jaundice\nRationale: Jaundice + Systemic symptoms = High-risk pathology." };
    }

    //Ruptured Ectopic Pregnancy / Gynecological Emergency
    if (assoc.includes("Vaginal bleeding, discharge, or passing tissue") && score>=7) {
      return { zone: "RED", summary: "EMERGENCY: Potential Ruptured Ectopic Pregnancy / Gynecological Emergency\nRationale: Jaundice + Systemic symptoms = High-risk pathology." };
    }

    //Abdominal Malignancy with Complications
    if (assoc.includes("Loss of appetite or weight loss") && assoc.includes("Abdominal swelling or lump") && hasFam) {
      return { zone: "RED", summary: "EMERGENCY: Potential Abdominal Malignancy with Complications\nRationale: Weight loss + mass = Urgent investigation." };
    }

    return null;
  },

  "Fainted": (selected, history) => {
    const prodrome = history.syn_prodrome || [];
    const assoc = history.syn_assoc || [];
    const trigger = history.syn_trigger || [];
    const hasEp = !!history.syn_episodes;

    //Cardiac Syncope
    if (trigger.includes("Physical activity or exercise") || prodrome.includes("Chest pain") || prodrome.includes("Fast or irregular heartbeat") || assoc.includes("Chest pain") || assoc.includes("Fast or irregular heartbeat")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Cardiac Syncope\nRationale: Syncope with exertion or cardiac symptoms = Sudden death risk." };
    }

    //Malignant Arrhythmia
    if (prodrome.includes("No warning signs") && trigger.includes("Sitting or resting")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Malignant Arrhythmia\nRationale: Sudden syncope without prodrome, no warning = electrical cause until proven otherwise." };
    }

    //Seizure (Convulsive Syncope vs Epilepsy)
    if (assoc.includes("Jerking or shaking movements") || assoc.includes("Bit your tongue") ||assoc.includes("Eyes rolled back") || assoc.includes("Loss of urine or bowel control")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Seizure (Convulsive Syncope vs Epilepsy)\nRationale: Loss of consciousness with convulsive features point to epilepsy or cerebral hypoxia." };
    }

    //Stroke / TIA-Related Syncope
    if (assoc.includes("Weakness, numbness, or slurred speech")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Stroke / TIA-Related Syncope\nRationale: Syncope with neurological deficit, Focal neurology is never benign." };
    }

    //Pulmonary Embolism
    if (prodrome.includes("Dyspnea") && prodrome.includes("Chest pain")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Pulmonary Embolism\nRationale: Syncope with Dyspnea and Chest Pain, PE can cause sudden syncope and death." };
    }

    //Traumatic Syncope
    if (assoc.includes("Injury from the fall")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Traumatic Syncope\nRationale: Syncope with Significant Injury requires urgent assessment." };
    }

    //Recurrent Unexplained Syncope
    if (hasEp && prodrome.includes("No warning signs")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Recurrent Unexplained Syncope\nRationale: Repetition without prodroe strongly suggests cardiac cause (Etiology)." };
    }

    return null;
  },




  "Body Weakness/Lethargy": (selected, history) => {
    const assoc = history.let_assoc || [];
    const onset = history.let_onset || [];
    const rad = history.let_rad || [];

    //Acute Stroke / TIA
    if (onset.includes("Sudden") && rad.includes("One side or one part of the body") && assoc.includes("Slurred speech or face drooping")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Acute Stroke / TIA\nRationale: Sudden focal weakness = Stroke until proven otherwise." };
    }

    //Guillain-Barre Syndrome (GBS)
    if (rad.includes("Started in the legs and is moving upwards")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Guillain-Barre Syndrome (GBS)\nRationale: Ascending weakness can progress to respiratory failure." };
    }

    //Sepsis
    if (assoc.includes("Fever") && assoc.includes("Feeling very tired or sleepy")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Sepsis\nRationale: Infection + Altered energy = Systemic illness." };
    }

    //Diabetic Emergency (DKA / HHS)
    if (assoc.includes("Passing urine very often or feeling very thirsty") && assoc.includes("Nausea/Vomiting")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Diabetic Emergency (DKA / HHS)\nRationale: Polyuria with Vomiting, metabolic collapse risk." };
    }

    //Acute Coronary Syndrome (Atypical Presentation)
    if (assoc.includes("Chest pain") || assoc.includes("Shortness of breath")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Acute Coronary Syndrome (Atypical Presentation)\nRationale: Weakness with Chest Pain or Dyspnea, Elderly and diabetics may present atypically." };
    }

    //Severe Anemia / Active bleeding
    if (assoc.includes("Recent bleeding (from stool or vaginal bleeding)") || assoc.includes("Loss of appetite or weight loss")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Severe Anemia / Active bleeding\nRationale: Weakness with Bleeding or Weight Loss -> Hypoxia and volume loss risk." };
    }

    //Severe Anemia / Active bleeding
    if (assoc.includes("Known thyroid problem") || onset.includes("Gradual")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Severe Anemia / Active bleeding\nRationale: Severe Lethargy with Thyroid disease -> can progress to coma if untreated." };
    }

    return null;
  },

  "Sore throat": (selected, history) => {
    const assoc = history.sore_assoc || [];
    const score = parseInt(history.sore_score);

    //Impending Airway Obstruction
    if (assoc.includes("Drooling or difficulty handling saliva") && assoc.includes("Shortness of breath")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Impending Airway Obstruction\nRationale: Drooling with Breathing or Swallowing Difficulty -> Immediate airway risk." };
    }
    if (assoc.includes("Drooling or difficulty handling saliva") && assoc.includes("Difficulty swallowing food or drinks")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Impending Airway Obstruction\nRationale: Drooling with Breathing or Swallowing Difficulty -> Immediate airway risk." };
    }

    //Deep Neck Space Infection (Peritonsillar / Retropharyngeal Abscess)
    if (assoc.includes("Neck swelling") && assoc.includes("Pain when swallowing")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Deep Neck Space Infection (Peritonsillar / Retropharyngeal Abscess)\nRationale: Neck Swelling with Painful Swallowing -> Risk of airway compromise and sepsis." };
    }
    if (assoc.includes("Neck swelling") && assoc.includes("Difficulty swallowing food or drinks")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Deep Neck Space Infection (Peritonsillar / Retropharyngeal Abscess)\nRationale: Neck Swelling with Painful Swallowing -> Risk of airway compromise and sepsis." };
    }

    //Laryngeal Involvement / Vocal Cord Emergency
    if (assoc.includes("Hoarse or changed voice") && assoc.includes("Shortness of breath")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Laryngeal Involvement / Vocal Cord Emergency\nRationale: Hoarseness with Breathing difficulty -> Swelling at vocal cords can rapidly worsen." };
    }

    //Foreign Body Ingestion (Airway or Esophageal)
    if (assoc.includes("Something stuck in the throat (e.g. fish bone)")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Foreign Body Ingestion (Airway or Esophageal)\nRationale: Possilble foreign body in throat -> Risk of airway obstruction or esophageal perforation." };
    }

    //Severe Bacterial Infection / Systemic Involvement
    if (assoc.includes("Fever") && score>=8 && !assoc.includes("Runny nose")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Severe Bacterial Infection / Systemic Involvement\nRationale: High pain + Fever without URTI symptoms = Red Flag." };
    }

    return null;
  },



  
  "Altered Mental Status": (selected, history) => {
    const assoc = history.mental_assoc || [];
    const onset = history.mental_onset || [];

    //Acute Stroke / Intrcranial Event
    if (onset.includes("Sudden") && assoc.includes("Weakness, numbness, or slurred speech")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Acute Stroke / Intrcranial Event\nRationale: Sudden Altered Mental Status with Neurological Deficit -> Time-critical, needs immediate imaging." };
    }

    //Central Nervous System Infection (Meningitis / Encephalitis)
    if (assoc.includes("Fever") && ((assoc.includes("Headache")) || (assoc.includes("Seizure or fits")))) {
      return { zone: "RED", summary: "EMERGENCY: Potential Central Nervous System Infection (Meningitis / Encephalitis)\nRationale: Fever with Altered Mental Status -> High mortality without early treatment." };
    }

    //Hypoglycemia
    if (assoc.includes("Low blood sugar (if checked)")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Hypoglycemia\nRationale: Altered Mental Status due to Low Blood Sugar -> Immediate Treatment Required." };
    }

    //Seizure / Post-Ictal State
    if (assoc.includes("Seizure or fits")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Seizure / Post-Ictal State\nRationale: Altered Mental Status following Seizure - Urgent Assessment Required." };
    }

    //Traumatic Brain Injury
    if (assoc.includes("Recent fall or head injury")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Traumatic Brain Injury\nRationale: Altered Mental Status after Trauma -> Risk of Intracranial Bleed." };
    }

    //Metabolic / Systemic Cause (Sepsis/Organ Failure)
    if (assoc.includes("Fever") && assoc.includes("Poor appetite or weight loss")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Metabolic / Systemic Cause (Sepsis/Organ Failure)\nRationale: Altered Mental Status with Fever and Weight Loss -> Possible Severe Systemic Illness." };
    }

    //Brain Metastasis / Raised ICP
    if (assoc.includes("History of cancer") && assoc.includes("Headache")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Brain Metastasis / Raised ICP\nRationale: Altered Mental Status in Patient with Cancer History -> Possible Brain Involvement." };
    }

    //Intoxication / Poisoning
    if (assoc.includes("Alcohol or drug use / overdose")) {
      return { zone: "RED", summary: "EMERGENCY: Potential Intoxication / Poisoning\nRationale: Altered Mental Status due to Possible Intoxication -> Airway and Overdose risk." };
    }

    return null;
  }
};

const checkHardRules = (selectedComplaints, history) => {
  // Loop through each complaint chosen by the user
  for (const complaint of selectedComplaints) {
    // Check if we have a specific rule for this complaint
    if (COMPLAINT_RULES[complaint]) {
      const result = COMPLAINT_RULES[complaint](selectedComplaints, history);
      if (result) return result; // Return the first Red Flag found
    }
  }
  return null; // Let Gemini handle it if no hard rules match
};

module.exports = { checkHardRules };