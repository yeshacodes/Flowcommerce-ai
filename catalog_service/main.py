import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from shared.auth import TokenData, get_current_user
from shared.db import get_pool

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("catalog-service")


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: str = ""
    price_cents: int


class ProductResponse(BaseModel):
    sku: str
    name: str
    description: str
    price_cents: int
    stock_available: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    log.info("catalog-service started")
    yield


app = FastAPI(title="Catalog Service", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/products", response_model=list[ProductResponse])
async def list_products():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT p.sku, p.name, p.description, p.price_cents, COALESCE(i.available, 0) AS stock_available "
            "FROM products p LEFT JOIN inventory i ON i.sku = p.sku "
            "ORDER BY p.name"
        )
    return [dict(r) for r in rows]


@app.get("/products/{sku}", response_model=ProductResponse)
async def get_product(sku: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT p.sku, p.name, p.description, p.price_cents, COALESCE(i.available, 0) AS stock_available "
            "FROM products p LEFT JOIN inventory i ON i.sku = p.sku "
            "WHERE p.sku = $1",
            sku,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return dict(row)


@app.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(
    req: ProductCreate,
    _: TokenData = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT sku FROM products WHERE sku=$1", req.sku)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already exists")
        await conn.execute(
            "INSERT INTO products(sku, name, description, price_cents) VALUES($1,$2,$3,$4)",
            req.sku,
            req.name,
            req.description,
            req.price_cents,
        )
        row = await conn.fetchrow(
            "SELECT p.sku, p.name, p.description, p.price_cents, COALESCE(i.available, 0) AS stock_available "
            "FROM products p LEFT JOIN inventory i ON i.sku = p.sku WHERE p.sku=$1",
            req.sku,
        )
    return dict(row)


@app.delete("/products/{sku}", status_code=204)
async def delete_product(sku: str, _: TokenData = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM products WHERE sku=$1", sku)
    if result == "DELETE 0":
        return Response(status_code=404)
    return Response(status_code=204)
