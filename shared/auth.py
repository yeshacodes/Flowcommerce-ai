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


def create_access_token(user_id: str, customer_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload = {
        "sub": user_id,
        "customer_id": customer_id,
        "email": email,
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
        )
    except (JWTError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
