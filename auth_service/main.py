import logging
from contextlib import asynccontextmanager
from uuid import uuid4

import bcrypt as _bcrypt

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from shared.auth import TokenData, create_access_token, get_current_user
from shared.cors import add_cors
from shared.db import get_pool
from shared.logging_config import configure_logging
from shared.observability import attach_observability

SERVICE = "auth-service"
configure_logging(SERVICE)
log = logging.getLogger(SERVICE)

limiter = Limiter(key_func=get_remote_address)


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    # Migrate existing DBs that pre-date the is_admin column.
    async with pool.acquire() as conn:
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false"
        )
    log.info("auth-service started")
    yield


app = FastAPI(title="Auth Service", lifespan=lifespan)
app.state.limiter = limiter
add_cors(app)


attach_observability(app, SERVICE, deps=["postgres"])


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — please slow down and try again shortly."},
        headers={"Retry-After": "60"},
    )


@app.post("/auth/register", status_code=201)
@limiter.limit("10/minute")
async def register(request: Request, req: RegisterRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT user_id FROM users WHERE email=$1", req.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

        user_id = str(uuid4())
        customer_id = str(uuid4())
        hashed = _hash_password(req.password)
        await conn.execute(
            "INSERT INTO users(user_id, customer_id, email, name, hashed_password) VALUES($1,$2,$3,$4,$5)",
            user_id,
            customer_id,
            req.email,
            req.name,
            hashed,
        )

    token = create_access_token(
        user_id=user_id, customer_id=customer_id, email=req.email, is_admin=False
    )
    log.info("registered user %s", req.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "customer_id": customer_id,
        "is_admin": False,
    }


@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, customer_id, hashed_password, is_admin FROM users WHERE email=$1",
            req.email,
        )

    if not row or not _verify_password(req.password, row["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    is_admin = bool(row["is_admin"])
    token = create_access_token(
        user_id=row["user_id"],
        customer_id=row["customer_id"],
        email=req.email,
        is_admin=is_admin,
    )
    log.info("login %s (admin=%s)", req.email, is_admin)
    return {
        "access_token": token,
        "token_type": "bearer",
        "customer_id": row["customer_id"],
        "is_admin": is_admin,
    }


@app.get("/auth/me")
async def me(current_user: TokenData = Depends(get_current_user)):
    return current_user
