from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from server.database.models import User, UserRole
from server.auth import hash_password

class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: str) -> Optional[User]:
        """Fetch user by primary key ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        """Fetch user by email address (case-insensitive)."""
        result = await self.db.execute(select(User).where(User.email == email.lower().strip()))
        return result.scalar_one_or_none()

    async def create_user(
        self,
        email: str,
        password: str,
        full_name: str,
        phone: Optional[str] = None,
        country: Optional[str] = "India",
        role: UserRole = UserRole.PATIENT
    ) -> User:
        """Create and persist a new user record."""
        user = User(
            email=email.lower().strip(),
            password_hash=hash_password(password),
            full_name=full_name.strip(),
            phone=phone.strip() if phone else None,
            country=country.strip() if country else "India",
            role=role
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update_user_profile(
        self,
        user_id: str,
        full_name: Optional[str] = None,
        phone: Optional[str] = None,
        country: Optional[str] = None
    ) -> Optional[User]:
        """Update user profile info (name, phone, country)."""
        user = await self.get_by_id(user_id)
        if user:
            if full_name is not None:
                user.full_name = full_name.strip()
            if phone is not None:
                user.phone = phone.strip() if phone else None
            if country is not None:
                user.country = country.strip() if country else "India"
            await self.db.flush()
            await self.db.refresh(user)
        return user

    async def update_password(self, user_id: str, new_password: str) -> Optional[User]:
        """Update password hash for user."""
        user = await self.get_by_id(user_id)
        if user:
            user.password_hash = hash_password(new_password)
            await self.db.flush()
            await self.db.refresh(user)
        return user

    async def update_google_tokens(self, user_id: str, access_token: str, refresh_token: Optional[str] = None) -> Optional[User]:
        """Update Google OAuth tokens for user."""
        user = await self.get_by_id(user_id)
        if user:
            user.google_access_token = access_token
            if refresh_token:
                user.google_refresh_token = refresh_token
            await self.db.flush()
            await self.db.refresh(user)
        return user

    async def list_users(self, role: Optional[UserRole] = None, skip: int = 0, limit: int = 100) -> List[User]:
        """List users with optional role filtering."""
        query = select(User)
        if role:
            query = query.where(User.role == role)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
