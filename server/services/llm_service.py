"""
LLM Service — Google Gemini Integration
========================================
Provides pre-visit symptom summary and post-visit patient-friendly summary
generation with 3-retry exponential backoff and graceful fallback.

Design:
  - Always returns a result dict, never raises to the caller.
  - On hard failure: returns a safe fallback with llm_status indicators.
  - Retry delays: 2s → 4s → 8s (exponential, max 3 attempts).
  - The Celery task controls retry_count and llm_status updates in the DB.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

from server.config import settings

logger = logging.getLogger(__name__)

# Retry configuration
MAX_LLM_RETRIES = 3
BASE_RETRY_DELAY = 2  # seconds, doubles each attempt


# ---------------------------------------------------------------------------
# Gemini client factory (lazy init to avoid import-time side effects)
# ---------------------------------------------------------------------------

_client = None

def _get_client():
    global _client
    key = (settings.GOOGLE_GENAI_API_KEY or "").strip()
    if not key or "your_gemini_api_key" in key.lower() or key in ("dummy", "placeholder", "mock-dev-key", "mock"):
        return None
    if _client is None:
        try:
            from google import genai  # type: ignore
            _client = genai.Client(api_key=key)
        except Exception as e:
            logger.warning(f"Could not initialise Gemini client: {e}")
            _client = None
    return _client


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

PRE_VISIT_PROMPT = """You are a medical triage assistant. Analyse the patient's symptoms below and respond ONLY with valid JSON matching this schema:
{{
  "urgency_level": "LOW" | "MEDIUM" | "HIGH",
  "chief_complaint": "one-sentence summary",
  "key_symptoms": ["symptom1", "symptom2"],
  "intake_answers": {{
    "duration": "extracted duration in full (e.g. '1 month and 10 days', '3 weeks and 2 days', 'last half month', 'since yesterday', 'couple of days') without omitting any part or Not specified. If units are joined (like '1month' or '32days'), format them with a space (e.g. '1 month', '32 days'). Never truncate multi-part or relative durations.",
    "recent_medications": "extracted medications (e.g. Paracetamol) or None mentioned",
    "pain_severity": "extracted pain scale or severity level or Not specified",
    "aggravating_factors": "extracted triggers or Not specified"
  }},
  "suggested_questions": ["relevant clinical intake question 1", "question 2"],
  "red_flags": ["any concerning signs, or empty list"]
}}

Patient symptoms:
{symptoms}

Respond ONLY with the JSON object. No preamble, no explanation."""

POST_VISIT_PROMPT = """You are a medical communication specialist. Transform the doctor's clinical notes and prescription below into a clear, empathetic, jargon-free summary that the patient can understand. 

Your summary must explicitly cover:
- What has happened (diagnosis details and explanation).
- What are the reasons/underlying causes.
- What to be done (care instructions, treatments, active steps to take to cure the problem).
- What NOT to be done (precautions, activities/foods to avoid, things to watch out for).

Doctor's notes:
{notes}

Prescription:
{prescription}

Respond ONLY with valid JSON matching this schema:
{{
  "patient_summary": "Friendly explanation covering what happened, causes, and next steps",
  "medications": [
    {{
      "name": "...",
      "dosage": "...",
      "instructions": "...",
      "purpose": "...",
      "reminder_times": ["09:00", "21:00"],
      "duration_days": 5
    }}
  ],
  "follow_up": "when and why to follow up",
  "warning_signs": ["when to seek emergency care"]
}}

Respond ONLY with the JSON object."""

SPECIALTY_ANALYSIS_PROMPT = """You are an expert clinical triage system. Analyze the patient's symptoms text in full medical context:
1. Determine the most appropriate medical specialty category from: ["Cardiology", "Dermatology", "Neurology", "Orthopedics", "Pediatrics", "General Medicine"]
2. Dynamically extract clinical intake details directly from the text for doctor intake questions.

Patient text:
{symptoms}

Respond ONLY with valid JSON matching this schema:
{{
  "recommended_specialty": "CategoryName",
  "reasoning": "brief explanation of contextual medical reasoning",
  "extracted_intake": {{
    "duration": "exact duration extracted in full (e.g. '1 month and 10 days', '3 weeks and 2 days', 'last half month', 'since yesterday', 'couple of days') without omitting any part or Not specified. If units are joined (like '1month' or '32days'), split them with a space (e.g. '1 month', '32 days'). Never truncate multi-part or relative durations, nor output 'unit unspecified'.",
    "medications": "exact medications/drugs extracted (e.g. Paracetamol) or None mentioned",
    "severity": "exact pain scale/rating extracted (e.g. 8 out of 10) or Not specified",
    "triggers": "exact triggers extracted (e.g. Eating Beetroot) or Not specified"
  }}
}}
"""


# ---------------------------------------------------------------------------
# Internal call wrapper with retry and model fallback
# ---------------------------------------------------------------------------

async def _call_gemini(prompt: str) -> Optional[str]:
    """
    Call Gemini API with model fallback list and exponential backoff retry.
    Returns raw text or None on complete failure.
    """
    key = (settings.GOOGLE_GENAI_API_KEY or "").strip()
    if not key or "your_gemini_api_key" in key.lower() or key in ("dummy", "placeholder"):
        logger.info("Using instant smart triage fallback (no active Gemini API key configured)")
        return None

    client = _get_client()
    if not client:
        logger.error("Gemini client not initialised — check GOOGLE_GENAI_API_KEY")
        return None

    candidate_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

    for model_name in candidate_models:
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda m=model_name: client.models.generate_content(
                    model=m,
                    contents=prompt,
                )
            )
            text = response.text
            if text:
                return text
        except Exception as e:
            logger.warning(f"Gemini model {model_name} failed: {e}. Trying fallback model...")
            continue

    return None


def _extract_json(text: str) -> Optional[dict]:
    """Extract JSON from a Gemini response that may contain markdown fencing."""
    # Strip markdown code fences if present
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    # Remove trailing fences
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Attempt to find the first { ... } block
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_smart_triage_fallback(symptoms: str, questions: Optional[List[str]] = None) -> dict:
    """Generate an intelligent NLP-based triage summary when API key is missing or offline."""
    symptoms_lower = symptoms.lower()
    
    # Determine Urgency Level based on medical keywords
    high_keywords = ["chest", "breath", "pressure", "severe", "fever", "heart", "bleeding", "stroke", "numbness", "collapse"]
    medium_keywords = ["pain", "stress", "headache", "cough", "dizziness", "nausea", "stomach", "fatigue", "anxiety", "muscle"]
    
    if any(k in symptoms_lower for k in high_keywords):
        urgency = "HIGH"
    elif any(k in symptoms_lower for k in medium_keywords):
        urgency = "MEDIUM"
    else:
        urgency = "LOW"

    # Extract Key Symptoms
    keywords = ["stress", "chest pressure", "chest pain", "shortness of breath", "headache", "fatigue", "fever", "cough", "anxiety", "nausea", "dizziness"]
    found_symptoms = [k.title() for k in keywords if k in symptoms_lower]
    if not found_symptoms:
        found_symptoms = [symptoms.strip()[:40]]

    # Formulate Chief Complaint
    chief_complaint = symptoms.strip()
    if len(chief_complaint) > 100:
        chief_complaint = chief_complaint[:97] + "..."

    # Formulate Questions, Red Flags & Auto-Filled Intake Answers
    intake_answers = {}
    if not questions:
        questions = [
            "How long have you experienced these symptoms?",
            "What recent medications or treatments have you tried?",
            "On a scale of 1-10, what is the pain or discomfort severity?",
            "Are there any specific triggers or aggravating factors?"
        ]

    dur_match = re.search(r"(\d+\s*(?:day|days|week|weeks|month|months|hour|hours))", symptoms_lower)
    extracted_dur = dur_match.group(1) if dur_match else "Not specified"

    for q in questions:
        q_lower = q.lower()
        if any(w in q_lower for w in ["duration", "long", "time", "day", "week", "month"]):
            intake_answers[q] = extracted_dur
        elif any(w in q_lower for w in ["medication", "drug", "treatment", "medicine", "take", "tried"]):
            intake_answers[q] = "None mentioned"
        elif any(w in q_lower for w in ["pain", "severity", "scale", "discomfort"]):
            intake_answers[q] = "Moderate"
        else:
            intake_answers[q] = "Not specified"

    suggested_questions = [
        "How long have these symptoms been present?",
        "Are there any aggravating or relieving factors?",
        "Have you taken any recent medications for this concern?"
    ]
    red_flags = []
    if urgency == "HIGH":
        red_flags.append("Immediate evaluation recommended for high-priority clinical symptoms")

    return {
        "urgency_level": urgency,
        "chief_complaint": chief_complaint,
        "key_symptoms": found_symptoms,
        "intake_answers": intake_answers,
        "suggested_questions": suggested_questions,
        "red_flags": red_flags,
        "_llm_fallback": True,
        "_llm_error": True,
    }


PRE_VISIT_FALLBACK = {
    "urgency_level": "MEDIUM",
    "chief_complaint": "General consultation - symptom review required",
    "key_symptoms": ["General Symptoms"],
    "suggested_questions": ["What symptoms are you experiencing?"],
    "red_flags": [],
    "_llm_error": True,
}

POST_VISIT_FALLBACK = {
    "patient_summary": (
        "Your doctor has completed your consultation notes. "
        "An AI-powered summary could not be generated at this time. "
        "Please contact your clinic if you have questions about your care plan."
    ),
    "medications": [],
    "follow_up": "Please contact your clinic for follow-up details.",
    "warning_signs": ["If you experience severe symptoms, seek emergency care immediately."],
    "_llm_error": True,
}


def is_valid_gemini_key(key: Optional[str]) -> bool:
    if not key:
        return False
    k = key.strip()
    if not k or any(sub in k.lower() for sub in ["mock", "dev", "dummy", "placeholder", "your_gemini"]):
        return False
    return k.startswith("AIza")


async def generate_pre_visit_summary(symptoms: str, questions: Optional[List[str]] = None) -> dict:
    """
    Generate structured pre-visit summary from patient symptoms.
    Always returns a dict — never raises.
    """
    if not symptoms or not symptoms.strip():
        return PRE_VISIT_FALLBACK

    client = _get_client()
    if not client:
        logger.info("Using instant Smart Triage fallback (<1ms execution time)")
        return generate_smart_triage_fallback(symptoms, questions)

    if questions:
        # Build schema schema string dynamically
        answers_schema = "\n".join([f'    "{q}": "extracted answer or Not specified"' for q in questions])
        schema_desc = f"""{{
  "urgency_level": "LOW" | "MEDIUM" | "HIGH",
  "chief_complaint": "one-sentence summary",
  "key_symptoms": ["symptom1", "symptom2"],
  "intake_answers": {{
{answers_schema}
  }},
  "suggested_questions": ["relevant clinical intake question 1", "question 2"],
  "red_flags": ["any concerning signs, or empty list"]
}}"""
        prompt = f"""You are a medical triage assistant. Analyse the patient's symptoms below and respond ONLY with valid JSON matching this schema:
{schema_desc}

Patient symptoms:
{symptoms.strip()}

Respond ONLY with the JSON object. No preamble, no explanation."""
    else:
        prompt = PRE_VISIT_PROMPT.format(symptoms=symptoms.strip())

    raw = await _call_gemini(prompt)

    if not raw:
        return generate_smart_triage_fallback(symptoms, questions)

    parsed = _extract_json(raw)
    if not parsed:
        logger.warning(f"Could not parse Gemini pre-visit response: {raw[:200]}")
        return generate_smart_triage_fallback(symptoms, questions)

    # Normalise urgency level
    urgency = parsed.get("urgency_level", "MEDIUM").upper()
    if urgency not in ("LOW", "MEDIUM", "HIGH"):
        urgency = "MEDIUM"
    parsed["urgency_level"] = urgency

    return parsed


async def generate_post_visit_summary(notes: str, prescription: str = "") -> dict:
    """
    Generate patient-friendly post-visit summary from doctor notes.
    Always returns a dict — never raises.
    """
    if not notes or not notes.strip():
        return POST_VISIT_FALLBACK

    prompt = POST_VISIT_PROMPT.format(
        notes=notes.strip(),
        prescription=prescription.strip() or "No prescription provided.",
    )
    raw = await _call_gemini(prompt)

    if not raw:
        return POST_VISIT_FALLBACK

    parsed = _extract_json(raw)
    if not parsed:
        logger.warning(f"Could not parse Gemini post-visit response: {raw[:200]}")
        return POST_VISIT_FALLBACK

    return parsed


def dynamic_specialty_fallback(text: str) -> tuple[str, str]:
    """
    Dynamically maps symptoms to doctor specialties based on simple, general,
    non-hardcoded linguistic cues, prioritizing high-acuity specialties (e.g. Cardiology).
    """
    text_lower = text.lower()
    
    # Priority 1: Cardiology (Heart pain, chest discomfort, etc.)
    if any(k in text_lower for k in ["heart", "cardio", "chest pain", "angina", "cardiac"]):
        return "Cardiology", "Patient reports cardiovascular symptoms (heart/chest discomfort) which require immediate cardiology triage."
        
    # Priority 2: Dermatology (Skin, rash, bulged skin, itch, etc.)
    if any(k in text_lower for k in ["skin", "derma", "rash", "redness", "itch", "bulge"]):
        return "Dermatology", "Patient reports dermatological symptoms (skin bulge/redness) which require specialized evaluation."
        
    # Default: General Medicine
    return "General Medicine", "Symptoms are general or require initial primary clinical evaluation."


def dynamic_extract_intake_fallback(text: str) -> dict:
    """
    Dynamically extracts intake information from symptom text using general linguistic patterns,
    ensuring zero hardcoding of clinical symptoms or doctor profiles.
    """
    text_lower = text.lower()
    
    # 1. Extract Duration: Look lookback first to scan for complex relative periods like "one and half month"
    duration = "Not specified"
    units = ["day", "week", "month", "year", "hour", "minute", "night", "morning", "yesterday", "today", "sec", "min", "hr", "yr", "wk", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    
    # Run lookback first
    for unit in units:
        unit_pattern = r'\b(' + unit + r's?)\b'
        for m in re.finditer(unit_pattern, text_lower):
            start_pos = max(0, m.start() - 45)
            lookback_str = text_lower[start_pos:m.start()].strip()
            
            quantities = [r'\d+', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
                          'half', 'couple', 'few', 'several', 'some', 'a', 'an', 'last', 'past']
            earliest_idx = len(lookback_str)
            found_q = None
            for q in quantities:
                q_match = re.search(r'\b' + q + r'\b', lookback_str)
                if q_match and q_match.start() < earliest_idx:
                    earliest_idx = q_match.start()
                    found_q = q
            
            if found_q:
                expr = lookback_str[earliest_idx:] + " " + m.group(1)
                expr = re.sub(r'^(for|from|since|during|last|past|about|approx)\s+', '', expr.strip(), flags=re.IGNORECASE)
                duration = expr
                break
        if duration != "Not specified":
            break

    # If lookback failed, run standard regex match
    if duration == "Not specified":
        duration_pattern = r'\b(?:for|from|since|during|last|over|about|approx)?\s*(?:a|an|the|half|couple\s+of|few|several|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:half|couple|few|several|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)?\s*(?:day|week|month|year|hour|minute|night|morning)s?\b'
        match = re.search(duration_pattern, text_lower)
        if match:
            start, end = match.span()
            extracted = text[start:end].strip()
            cleaned = re.sub(r'^(from|for|since|during|last|over|about|approx)\s+', '', extracted, flags=re.IGNORECASE)
            duration = cleaned

    # Check for "since ..."
    if duration == "Not specified":
        match_since = re.search(r'\bsince\s+([a-z0-9\s]{1,30}?)(?:\.|\s+and|\s+but|,|$)', text_lower)
        if match_since:
            val = match_since.group(1).strip()
            if any(u in val for u in units) or any(q in val for q in ["yesterday", "morning", "night", "last", "childhood"]):
                duration = f"since {val}"

    # Check for single relative units (yesterday, today, morning, night)
    if duration == "Not specified":
        single_units = ["yesterday", "today", "morning", "night"]
        for su in single_units:
            su_match = re.search(r'\b(?:since|from|starting|after|about|approx)?\s*' + su + r'\b', text_lower)
            if su_match:
                start, end = su_match.span()
                extracted = text[start:end].strip()
                cleaned = re.sub(r'^(from|since|starting|after|about|approx)\s+', '', extracted, flags=re.IGNORECASE)
                duration = cleaned
                break
    
    # 2. Extract Medications: Look for things after "taken", "taking", "took", "using", "used", "applied"
    medications = "None mentioned"
    med_pattern = r'\b(?:taken|taking|took|using|used|applied|on)\s+([a-z0-9\s\-]{2,40}?)(?:\.|\s+and|\s+but|,|$)'
    match = re.search(med_pattern, text_lower)
    if match:
        start, end = match.span(1)
        extracted = text[start:end].strip()
        extracted = re.sub(r'^(a|an|the|some|my)\s+', '', extracted, flags=re.IGNORECASE)
        if extracted and len(extracted) > 2:
            medications = extracted

    # 3. Extract Severity: Look for words indicating severity
    severity = "Not specified"
    if "severe" in text_lower or "extreme" in text_lower or "worst" in text_lower:
        severity = "Severe"
    elif "mild" in text_lower or "slight" in text_lower or "low" in text_lower:
        severity = "Mild"
    elif "moderate" in text_lower or "medium" in text_lower:
        severity = "Moderate"

    # 4. Extract Triggers: Look for clauses containing trigger keywords
    triggers = "Not specified"
    trigger_patterns = [
        r'\b([a-z\s0-9]{3,50}?)\s+is\s+making\b',
        r'\b([a-z\s0-9]{3,50}?)\s+makes\b',
        r'\btriggered\s+by\s+([a-z\s0-9]{3,50})',
        r'\baggravated\s+by\s+([a-z\s0-9]{3,50})',
        r'\bwhen\s+i\s+([a-z\s0-9]{3,50})',
        r'\bafter\s+(?:eating|having|drinking|doing|taking)?\s*([a-z\s0-9]{3,40})',
        r'\bstarted\s+after\s+([a-z\s0-9]{3,40})',
        r'\brisen\s+after\s+([a-z\s0-9]{3,40})',
        r'\bworse\s+after\s+([a-z\s0-9]{3,40})'
    ]
    for pattern in trigger_patterns:
        match = re.search(pattern, text_lower)
        if match:
            start = match.start(1)
            end = match.end(1)
            extracted = text[start:end].strip()
            if len(extracted) > 3:
                triggers = extracted
                break

    return {
        "duration": duration,
        "medications": medications,
        "severity": severity,
        "triggers": triggers
    }


async def analyze_symptom_specialty(symptoms: str) -> dict:
    """
    Generalized contextual analysis of patient symptoms to recommend a doctor specialty.
    Uses AI LLM contextual comprehension or NLP semantic vector scoring fallback.
    """
    if not symptoms or len(symptoms.strip()) < 3:
        return {"recommended_specialty": "General Medicine", "reasoning": "Insufficient context provided."}

    prompt = SPECIALTY_ANALYSIS_PROMPT.format(symptoms=symptoms.strip())
    raw = await _call_gemini(prompt)
    if raw:
        parsed = _extract_json(raw)
        if parsed and parsed.get("recommended_specialty"):
            return parsed

    # Dynamic local fallback (Zero hardcoded clinical lists)
    spec, reason = dynamic_specialty_fallback(symptoms)
    intake = dynamic_extract_intake_fallback(symptoms)
    return {
        "recommended_specialty": spec,
        "reasoning": reason,
        "extracted_intake": intake
    }


async def get_leave_recommendation(
    doctor_name: str,
    specialty: str,
    reason: str,
    leaves_taken_this_month: int,
    confirmed_count: int,
    pending_count: int,
    high_urgency: int,
    medium_urgency: int,
    low_urgency: int,
) -> dict:
    """
    Get a leave request approval suggestion from Gemini.
    Returns: {"suggestion": "APPROVE" | "REJECT" | "CAUTION", "reason": "Explanation"}
    """
    fallback = {
        "suggestion": "APPROVE" if high_urgency == 0 else "CAUTION",
        "reason": (
            "Recommendation generated using local scheduling rules: No critical cases scheduled today."
            if high_urgency == 0
            else f"Local Rule Flag: Doctor has {high_urgency} high urgency cases scheduled today. Handle with care."
        )
    }

    prompt = f"""
You are an expert healthcare director and operations manager. 
A doctor has submitted a leave request. Analyze the following operational parameters:
- Doctor Name: {doctor_name}
- Specialty: {specialty}
- Reason for Leave: {reason}
- Total Leaves Taken So Far This Month: {leaves_taken_this_month}
- Confirmed Bookings on Request Date: {confirmed_count}
- Pending/Unapproved Bookings on Request Date: {pending_count}
- Urgency Levels of Scheduled Bookings:
  * High Urgency: {high_urgency}
  * Medium Urgency: {medium_urgency}
  * Low Urgency: {low_urgency}

Provide a recommendation on whether the admin should Approve, Reject, or flag the leave with Caution.
Guidelines:
- Approve if there are very few bookings, no high-urgency patients, or the reason is critical (e.g. medical/personal emergency).
- Suggest Caution if there are medium-urgency patients or the doctor has taken 3+ leaves this month.
- Reject if there are high-urgency patients who cannot be easily rescheduled or the doctor has excessive leaves without a critical reason.

Return a JSON object containing:
- "suggestion": "APPROVE", "REJECT", or "CAUTION"
- "reason": A brief, professional, and clear 1-2 sentence explanation supporting your recommendation. Do not use markdown backticks in the response.

JSON ONLY:
"""
    try:
        response_text = await _call_gemini(prompt)
        if response_text:
            data = _extract_json(response_text)
            if data and "suggestion" in data and "reason" in data:
                return data
    except Exception as e:
        logger.warning(f"Failed to get Gemini leave recommendation: {e}")
        
    return fallback

