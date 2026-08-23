import pytest
from server.auth import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from server.config import settings

def test_password_hashing():
    password = "TestPassword123!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_access_token():
    payload_data = {"sub": "user-123", "email": "test@example.com", "role": "PATIENT"}
    token = create_access_token(payload_data)
    decoded = decode_token(token, settings.JWT_SECRET)
    
    assert decoded["sub"] == "user-123"
    assert decoded["email"] == "test@example.com"
    assert decoded["role"] == "PATIENT"
    assert decoded["type"] == "access"

def test_jwt_refresh_token():
    payload_data = {"sub": "user-123", "email": "test@example.com", "role": "PATIENT"}
    token = create_refresh_token(payload_data)
    decoded = decode_token(token, settings.JWT_REFRESH_SECRET)
    
    assert decoded["sub"] == "user-123"
    assert decoded["type"] == "refresh"
