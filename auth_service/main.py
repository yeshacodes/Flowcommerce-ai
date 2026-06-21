import logging
from contextlib import asynccontextmanager
from uuid import uuid4

import bcrypt as _bcrypt

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from shared.auth import TokenData, create_access_token, get_current_user
from shared.db import get_pool

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("auth-service")


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
    await get_pool()
    log.info("auth-service started")
    yield


app = FastAPI(title="Auth Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/auth/register", status_code=201)
async def register(req: RegisterRequest):
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

    token = create_access_token(user_id=user_id, customer_id=customer_id, email=req.email)
    log.info("registered user %s", req.email)
    return {"access_token": token, "token_type": "bearer", "customer_id": customer_id}


@app.post("/auth/login")
async def login(req: LoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, customer_id, hashed_password FROM users WHERE email=$1", req.email
        )

    if not row or not _verify_password(req.password, row["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(
        user_id=row["user_id"], customer_id=row["customer_id"], email=req.email
    )
    log.info("login %s", req.email)
    return {"access_token": token, "token_type": "bearer", "customer_id": row["customer_id"]}


@app.get("/auth/me")
async def me(current_user: TokenData = Depends(get_current_user)):
    return current_user
