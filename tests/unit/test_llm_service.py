"""
Unit Tests — LLM Service
========================
Tests that the service:
  - Returns correct structure from valid Gemini response
  - Falls back gracefully when Gemini is unavailable
  - Handles malformed JSON from the API
  - Normalises urgency_level enum value
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from server.services.llm_service import (
    generate_pre_visit_summary,
    generate_post_visit_summary,
    PRE_VISIT_FALLBACK,
    POST_VISIT_FALLBACK,
    _extract_json,
)


# ─── _extract_json unit tests ────────────────────────────────────────────────

def test_extract_json_clean():
    raw = '{"urgency_level": "HIGH", "chief_complaint": "chest pain"}'
    result = _extract_json(raw)
    assert result["urgency_level"] == "HIGH"


def test_extract_json_with_markdown_fence():
    raw = '```json\n{"urgency_level": "LOW"}\n```'
    result = _extract_json(raw)
    assert result["urgency_level"] == "LOW"


def test_extract_json_embedded_in_text():
    raw = 'Here is the response: {"urgency_level": "MEDIUM"} done.'
    result = _extract_json(raw)
    assert result is not None


def test_extract_json_invalid_returns_none():
    result = _extract_json("this is not json at all")
    assert result is None


# ─── generate_pre_visit_summary tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_pre_visit_summary_empty_input_returns_fallback():
    result = await generate_pre_visit_summary("")
    assert result == PRE_VISIT_FALLBACK


@pytest.mark.asyncio
async def test_pre_visit_summary_no_client_returns_fallback():
    """When Gemini client is not initialised (no API key), return fallback."""
    with patch("server.services.llm_service._get_client", return_value=None):
        result = await generate_pre_visit_summary("I have a headache")
    assert result.get("_llm_error") is True


@pytest.mark.asyncio
async def test_pre_visit_summary_success():
    """Simulate a valid Gemini API response."""
    mock_response = MagicMock()
    mock_response.text = '''{
        "urgency_level": "HIGH",
        "chief_complaint": "Severe chest pain with shortness of breath",
        "key_symptoms": ["chest pain", "shortness of breath"],
        "suggested_questions": ["When did it start?"],
        "red_flags": ["possible cardiac event"]
    }'''
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("server.services.llm_service._get_client", return_value=mock_client):
        result = await generate_pre_visit_summary("Chest pain and shortness of breath")

    assert result["urgency_level"] == "HIGH"
    assert result["chief_complaint"] == "Severe chest pain with shortness of breath"
    assert "chest pain" in result["key_symptoms"]
    assert "_llm_error" not in result


@pytest.mark.asyncio
async def test_pre_visit_summary_invalid_urgency_defaults_to_medium():
    """Invalid urgency level is normalised to MEDIUM."""
    mock_response = MagicMock()
    mock_response.text = '{"urgency_level": "CRITICAL", "chief_complaint": "test", "key_symptoms": [], "suggested_questions": [], "red_flags": []}'
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("server.services.llm_service._get_client", return_value=mock_client):
        result = await generate_pre_visit_summary("Some symptom")

    assert result["urgency_level"] == "MEDIUM"


@pytest.mark.asyncio
async def test_pre_visit_summary_api_exception_returns_fallback():
    """API exception (e.g. quota exceeded) returns fallback after retries."""
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = Exception("API quota exceeded")

    with patch("server.services.llm_service._get_client", return_value=mock_client):
        with patch("server.services.llm_service.BASE_RETRY_DELAY", 0):  # Skip sleeps in tests
            result = await generate_pre_visit_summary("I feel sick")

    assert result.get("_llm_error") is True


# ─── generate_post_visit_summary tests ───────────────────────────────────────

@pytest.mark.asyncio
async def test_post_visit_summary_empty_notes_returns_fallback():
    result = await generate_post_visit_summary("")
    assert result == POST_VISIT_FALLBACK


@pytest.mark.asyncio
async def test_post_visit_summary_success():
    mock_response = MagicMock()
    mock_response.text = '''{
        "patient_summary": "You had a routine check-up. Everything looks fine.",
        "medications": [{"name": "Aspirin", "dosage": "75mg", "instructions": "Once daily", "purpose": "Blood thinner"}],
        "follow_up": "In 4 weeks",
        "warning_signs": ["Chest pain", "Difficulty breathing"]
    }'''
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("server.services.llm_service._get_client", return_value=mock_client):
        result = await generate_post_visit_summary(
            "Patient is stable. Blood pressure normal.",
            "Aspirin 75mg daily"
        )

    assert "patient_summary" in result
    assert len(result["medications"]) == 1
    assert result["medications"][0]["name"] == "Aspirin"
    assert "_llm_error" not in result
