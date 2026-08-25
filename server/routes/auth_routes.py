from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from server.database.connection import get_db
from server.repositories.user_repository import UserRepository
from server.schemas.auth_schemas import (
    RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, UserResponse,
    SendOTPRequest, VerifyOTPRequest, ForgotPasswordRequest, ResetPasswordRequest
)
from server.auth import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, get_current_user
)
from server.config import settings
from server.database.models import User
from server.services.otp_service import generate_and_send_otp, verify_otp_code

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/send-otp")
async def send_email_otp(data: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    """Generate and email a 6-digit OTP code."""
    purpose_val = data.purpose or "Registration"
    if purpose_val == "Registration":
        user_repo = UserRepository(db)
        existing = await user_repo.get_by_email(data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address already exists"
            )

    otp_code, is_sim = await generate_and_send_otp(
        db=db,
        email=data.email,
        full_name=data.full_name or "User",
        purpose=purpose_val
    )
    await db.commit()
    return {
        "message": f"Verification OTP code sent to {data.email}",
        "status": "success",
        "simulation": is_sim,
        "simulated_otp": otp_code if is_sim else None
    }

@router.post("/verify-otp")
async def verify_email_otp(data: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    """Verify a 6-digit OTP code."""
    consume = (data.purpose != "Password Reset")
    await verify_otp_code(
        db=db,
        email=data.email,
        otp_code=data.otp_code,
        purpose=data.purpose or "Registration",
        consume=consume
    )
    return {"message": "OTP verified successfully!", "status": "success"}

@router.post("/forgot-password/request")
async def request_password_reset_otp(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Request a password reset 6-digit OTP sent to registered email."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(data.email)
    if not user:
        # Prevent account enumeration attack by returning generic success
        return {"message": f"If an account with {data.email} exists, a reset OTP code has been sent.", "status": "success"}
    
    otp_code, is_sim = await generate_and_send_otp(
        db=db,
        email=user.email,
        full_name=user.full_name,
        purpose="Password Reset"
    )
    await db.commit()
    return {
        "message": f"Password reset OTP code sent to {data.email}",
        "status": "success",
        "simulation": is_sim,
        "simulated_otp": otp_code if is_sim else None
    }

@router.post("/forgot-password/reset")
async def reset_password_with_otp(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Verify reset OTP code and update user's password."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(data.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found")

    await verify_otp_code(
        db=db,
        email=data.email,
        otp_code=data.otp_code,
        purpose="Password Reset"
    )
    
    await user_repo.update_password(user.id, data.new_password)
    await db.commit()
    return {"message": "Password reset successfully! You can now log in with your new password.", "status": "success"}

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new patient user account with OTP email verification."""
    user_repo = UserRepository(db)
    
    # Check if user exists
    existing = await user_repo.get_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )
        
    # Verify OTP code if provided
    if data.otp_code:
        await verify_otp_code(
            db=db,
            email=data.email,
            otp_code=data.otp_code,
            purpose="Registration"
        )
        
    user = await user_repo.create_user(
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        phone=data.phone,
        country=data.country or "India",
        role=data.role or User.role.default
    )
    
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    
    user_resp = UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        country=user.country,
        role=user.role,
        has_google_calendar=bool(user.google_access_token),
        created_at=user.created_at
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_resp
    )

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with email and password."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(data.email)
    
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    
    user_resp = UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        country=user.country,
        role=user.role,
        has_google_calendar=bool(user.google_access_token),
        created_at=user.created_at
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_resp
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a valid refresh token for a new access & refresh token pair."""
    payload = decode_token(data.refresh_token, settings.JWT_REFRESH_SECRET)
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type, expected refresh token"
        )
        
    user_id = payload.get("sub")
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists"
        )
        
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    
    user_resp = UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        country=user.country,
        role=user.role,
        has_google_calendar=bool(user.google_access_token),
        created_at=user.created_at
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_resp
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get profile details of authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        country=current_user.country,
        role=current_user.role,
        has_google_calendar=bool(current_user.google_access_token),
        created_at=current_user.created_at
    )

from server.schemas.auth_schemas import ProfileUpdateRequest

@router.put("/profile", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update profile details (name, phone, country) for current user."""
    user_repo = UserRepository(db)
    updated_user = await user_repo.update_user_profile(
        user_id=current_user.id,
        full_name=data.full_name,
        phone=data.phone,
        country=data.country
    )
    await db.commit()
    return UserResponse(
        id=updated_user.id,
        email=updated_user.email,
        full_name=updated_user.full_name,
        phone=updated_user.phone,
        country=updated_user.country,
        role=updated_user.role,
        has_google_calendar=bool(updated_user.google_access_token),
        created_at=updated_user.created_at
    )


@router.get("/google/connect")
async def google_connect(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Generate Google OAuth 2.0 URL for linking Google Calendar."""
    # Dynamically determine the redirect URI matching the client request host
    scheme = request.url.scheme
    netloc = request.url.netloc
    if "127.0.0.1" in netloc:
        netloc = netloc.replace("127.0.0.1", "localhost")
    if "localhost" not in netloc:
        scheme = "https"
    redirect_uri = f"{scheme}://{netloc}/api/auth/google/callback"

    # Encode state with user identity to authenticate browser redirects securely
    from jose import jwt
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    state_payload = {
        "sub": current_user.id,
        "exp": int((now + timedelta(minutes=10)).timestamp()),
        "type": "google_oauth_state"
    }
    state = jwt.encode(state_payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)

    # Allow passing custom state in authorization URL
    if not settings.GOOGLE_CLIENT_ID:
        return {"url": None, "message": "Google OAuth is unconfigured or in development mode."}

    try:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=["https://www.googleapis.com/auth/calendar.events"],
            redirect_uri=redirect_uri,
        )
        auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline", state=state)
        return {"url": auth_url}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[CalendarService] Error generating OAuth URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate Google OAuth URL: {str(e)}"
        )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db)
):
    """Exchange Google OAuth authorization code for tokens and save to user profile."""
    from jose import jwt
    from fastapi.responses import RedirectResponse
    
    # 1. Decode & verify state token
    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "google_oauth_state":
            raise ValueError("Invalid state payload type")
        user_id = payload.get("sub")
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Google callback state verification failed: {e}")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/patient/settings?google_error=invalid_state")

    # 2. Fetch the corresponding user
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(user_id)
    if not user:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/patient/settings?google_error=user_not_found")

    # 3. Exchange authorization code with same dynamic redirect URI
    scheme = request.url.scheme
    netloc = request.url.netloc
    if "127.0.0.1" in netloc:
        netloc = netloc.replace("127.0.0.1", "localhost")
    if "localhost" not in netloc:
        scheme = "https"
    redirect_uri = f"{scheme}://{netloc}/api/auth/google/callback"

    from server.services.calendar_service import exchange_code_for_tokens
    tokens = exchange_code_for_tokens(code, redirect_uri=redirect_uri)
    if not tokens:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/patient/settings?google_error=exchange_failed")

    # 4. Save credentials
    user.google_access_token = tokens["access_token"]
    if tokens.get("refresh_token"):
        user.google_refresh_token = tokens["refresh_token"]

    await db.commit()
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/patient/settings?google_connected=true")

# --- In-App Notifications ---

from typing import List
from server.schemas.doctor_schemas import InAppNotificationResponse

@router.get("/notifications", response_model=List[InAppNotificationResponse])
async def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all in-app notifications for the authenticated user."""
    from server.database.models import InAppNotification
    from sqlalchemy import select
    stmt = select(InAppNotification).where(InAppNotification.user_id == current_user.id).order_by(InAppNotification.created_at.desc())
    res = await db.execute(stmt)
    notifications = res.scalars().all()
    return notifications

@router.put("/notifications/{id}/read")
async def mark_notification_read(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a specific in-app notification as read."""
    from server.database.models import InAppNotification
    from sqlalchemy import select
    stmt = select(InAppNotification).where(InAppNotification.id == id, InAppNotification.user_id == current_user.id)
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"success": True}

@router.put("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all in-app notifications as read for the authenticated user."""
    from server.database.models import InAppNotification
    from sqlalchemy import update
    stmt = update(InAppNotification).where(InAppNotification.user_id == current_user.id).values(is_read=True)
    await db.execute(stmt)
    await db.commit()
    return {"success": True}

