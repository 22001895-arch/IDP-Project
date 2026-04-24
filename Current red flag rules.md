# 🚨 Current Red Flag Rules

This document outlines the clinical "Red Flag" detection logic currently implemented in the triage engine (`triageRules.js`). These rules are triggered based on patient answers to specific clinical questions.

---

## 🤒 Fever
| Question ID | Description | Trigger Condition | Priority |
| :--- | :--- | :--- | :--- |
| `resp_001` | Shortness of breath | Answer is **"Yes"** | 🔴 Critical |
| `neuro_003` | Confusion / altered mental status | Answer is **"Yes"** | 🔴 Critical |
| `neuro_004` | Neck stiffness / meningism signs | Answer is **"Yes"** | 🔴 Critical |

---

## 🫀 Chest Pain
| Question ID | Description | Trigger Condition | Priority |
| :--- | :--- | :--- | :--- |
| `chest_001` | Crushing / heaviness character | Answer is **"Yes"** | 🔴 Critical |
| `chest_009` | Pain score (Numeric) | Score **> 5** | 🟡 Urgent |
| `chest_009p` | Pain score (Alternative) | Score **> 5** | 🟡 Urgent |
| `resp_001` | Shortness of breath | Answer is **"Yes"** | 🔴 Critical |
| `chest_026` | Radiation / associated symptom | Answer is **"Yes"** | 🔴 Critical |
| `neuro_005` | Concurrent neurological symptoms | Answer is **"Yes"** | 🔴 Critical |

---

## 🤢 Stomach / Abdominal Pain
| Question ID | Description | Trigger Condition | Priority |
| :--- | :--- | :--- | :--- |
| `gi_015` | GI bleeding signs | **"Fresh blood"** OR **"Dark like coffee grounds"** | 🔴 Critical |
| `gi_033` | Abdominal rigidity / guarding | Answer is **"Yes"** | 🔴 Critical |
| `gi_034` | Rebound tenderness | Answer is **"Yes"** | 🟡 Urgent |

---

## 📋 Placeholder Categories (No Rules Yet)
The following symptoms are registered in the system but currently have no hardcoded red flag triggers:
*   Shortness of breath (standalone)
*   Headache
*   Dizziness
*   Eye pain or redness
*   Nausea/Vomiting
*   Cough/Sore throat
*   Diarrhoea
*   Back pain
*   Fainting/Blackout
*   Limb pain (arm/leg pain)
*   Feeling generally unwell
*   Skin rashes
*   Problem with passing urine

---

> [!TIP]
> **Management Note:** To update these rules, modify the `RED_FLAG_RULES` object in `triageRules.js`. Ensure the `id` matches the Question ID provided by the frontend/Gemini routing engine.
