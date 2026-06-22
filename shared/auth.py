from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from .settings import settings

_bearer = HTTPBearer()

ALGORITHM = "HS256"


class TokenData(BaseModel):
    user_id: str
    customer_id: str
    email: str
    is_admin: bool = False


def create_access_token(
    user_id: str, customer_id: str, email: str, is_admin: bool = False
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload = {
        "sub": user_id,
        "customer_id": customer_id,
        "email": email,
        "is_admin": is_admin,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> TokenData:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return TokenData(
            user_id=payload["sub"],
            customer_id=payload["customer_id"],
            email=payload["email"],
            is_admin=bool(payload.get("is_admin", False)),
        )
    except (JWTError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
