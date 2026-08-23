# Google Gemini 2.0 LLM Prompt Engineering & Fallbacks

The platform utilizes Google Gemini 2.0 Flash for clinical triage and patient follow-up summarization.

---

## 1. Pre-Visit AI Triage Prompt

**Model:** `gemini-2.0-flash`  
**Temperature:** `0.2` (Low variance, deterministic evaluation)  

### Prompt Template:
```
You are an expert medical triage assistant. Analyze the patient's symptoms described below and return a valid JSON object with exact structure:

{
  "urgency_level": "LOW" | "MEDIUM" | "HIGH",
  "chief_complaint": "Single sentence summary of primary issue",
  "suggested_questions": ["Question 1 for doctor", "Question 2", "Question 3"],
  "key_symptoms": ["Symptom 1", "Symptom 2"]
}

Patient Symptoms:
{symptoms_text}
```

---

## 2. Post-Visit Patient Explanation Prompt

### Prompt Template:
```
You are a friendly patient communication assistant. Translate the following doctor clinical notes and prescription into a clear, patient-friendly summary:

Clinical Notes:
{doctor_notes}

Prescription:
{prescription_text}

Return JSON with structure:
{
  "patient_explanation": "Simplified text explaining diagnosis and care plan",
  "medications": [
    {
      "name": "Medication Name",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration_days": 7
    }
  ]
}
```

---

## 3. Resiliency & Deterministic Fallbacks

If the Gemini API key is missing, quota exceeded, or network fails, the system executes 3-attempt exponential backoff (2s, 4s, 8s). If all retries fail, it uses the fallback dictionary:

```python
PRE_VISIT_FALLBACK = {
    "urgency_level": "MEDIUM",
    "chief_complaint": "Symptom evaluation pending physician review",
    "suggested_questions": [
        "How long have you experienced these symptoms?",
        "Are you currently taking any prescription medications?",
        "Have you had similar symptoms in the past?"
    ],
    "key_symptoms": ["As submitted in form"]
}
```
