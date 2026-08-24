# Google Gemini 2.0 LLM Prompt Engineering & Fallbacks

The platform utilizes Google Gemini 2.0 Flash for clinical triage, operations insights, and patient follow-up summarization.

---

## 1. Pre-Visit Symptom Triage Prompt

**Model:** `gemini-2.0-flash`  
**Temperature:** `0.2`  

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

## 2. Specialty Recommendation & Dynamic Question Extractor Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
Based on the provided symptoms and patient history, recommend the most appropriate medical specialty. Also, extract dynamic questions that the patient should answer before their visit.

Return JSON with structure:
{
  "recommended_specialty": "Cardiology",
  "confidence_score": 0.95,
  "dynamic_questions": ["Have you experienced chest pain?", "Is there a family history of heart disease?"]
}

Symptoms & History:
{patient_data}
```

---

## 3. Post-Visit Note Summary & Medication Parsing Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
You are a friendly patient communication assistant. Translate the following doctor clinical notes and prescription into a clear, patient-friendly summary:

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

Clinical Notes:
{doctor_notes}

Prescription:
{prescription_text}
```

---

## 4. Cross-Specialty Clinical History Briefing Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
You are a clinical summarizer. Read the patient's past medical records across different specialties and generate a structured briefing for the upcoming doctor visit. Group the findings into Category A (Critical/Active Issues), Category B (Chronic/Managed Conditions), and Category C (Historical/Resolved Issues).

Return JSON with structure:
{
  "category_a": ["Critical issue 1"],
  "category_b": ["Chronic condition 1"],
  "category_c": ["Past surgery 1"]
}

Medical Records:
{medical_records}
```

---

## 5. Cancellation Reason Demerits Classification Prompt

**Model:** `gemini-2.0-flash`  
**Temperature:** `0.1`  

### Prompt Template:
```
Evaluate the reason provided by a doctor for canceling an appointment. Classify whether the cancellation reason is justified (e.g., medical emergency, personal illness) or unjustified (e.g., poor planning, double booked elsewhere).

Return JSON with structure:
{
  "is_justified": true | false,
  "demerits_to_apply": 0, // 0 if justified, up to 10 if unjustified
  "reasoning": "Explanation for the classification"
}

Cancellation Reason:
{cancellation_reason}
```

---

## 6. Leave Approval Recommendation Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
Evaluate a doctor's leave request based on the current schedule density, availability of alternative doctors in the same specialty, and hospital policies.

Return JSON with structure:
{
  "recommend_approval": true | false,
  "impact_score": 0.8, // 0.0 to 1.0 indicating disruption level
  "justification": "Analysis of coverage and rescheduling needs"
}

Leave Request Details:
{leave_request}

Current Schedule Density:
{schedule_density}
```

---

## 7. Hospital Operations Insights (CMO Insights) Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
You are an AI hospital administrator assistant. Analyze the daily metrics (appointment volume, cancellation rates, wait times, department load) and generate actionable insights for the Chief Medical Officer (CMO).

Return JSON with structure:
{
  "overall_health_score": 85,
  "critical_bottlenecks": ["High wait times in Cardiology"],
  "actionable_recommendations": ["Reassign 2 float doctors to Cardiology today"]
}

Daily Metrics:
{daily_metrics}
```

---

## 8. Doctor Performance Appraisal Analysis Prompt

**Model:** `gemini-2.0-flash`  

### Prompt Template:
```
Analyze the performance metrics for a specific doctor, including patient reviews, cancellation frequency, demerit points, and patient outcome feedback. Provide a comprehensive appraisal summary.

Return JSON with structure:
{
  "performance_rating": "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" | "UNACCEPTABLE",
  "strengths": ["High patient satisfaction"],
  "areas_for_improvement": ["Frequent late cancellations"],
  "recommended_action": "None" // Or e.g. "Review scheduling practices"
}

Doctor Metrics:
{doctor_metrics}
```

---

## Resiliency & Deterministic Fallbacks

If the Gemini API key is missing, quota exceeded, or network fails, the system executes 3-attempt exponential backoff (2s, 4s, 8s). If all retries fail, it uses fallback dictionaries specific to each prompt type to ensure the system gracefully degrades without blocking core functionality.
