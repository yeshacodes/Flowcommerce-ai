import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Response, status
from pydantic import BaseModel

from shared.auth import TokenData, require_admin
from shared.cors import add_cors
from shared.db import get_pool
from shared.logging_config import configure_logging
from shared.observability import attach_observability

SERVICE = "catalog-service"
configure_logging(SERVICE)
log = logging.getLogger(SERVICE)


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: str = ""
    price_cents: int
    stock_quantity: int = 0
    is_active: bool = True


class ProductUpdate(BaseModel):
    # All optional — only provided fields are changed.
    name: str | None = None
    description: str | None = None
    price_cents: int | None = None
    stock_quantity: int | None = None
    is_active: bool | None = None


class ProductResponse(BaseModel):
    sku: str
    name: str
    description: str
    price_cents: int
    stock_available: int
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


# Columns selected for every product response (joined with live inventory).
_SELECT = (
    "SELECT p.sku, p.name, p.description, p.price_cents, p.is_active, "
    "p.created_at, p.updated_at, COALESCE(i.available, 0) AS stock_available "
    "FROM products p LEFT JOIN inventory i ON i.sku = p.sku"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    # Idempotent migration for installs that pre-date these columns.
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true")
        await conn.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    log.info("catalog-service started")
    yield


app = FastAPI(title="Catalog Service", lifespan=lifespan)
add_cors(app)
attach_observability(app, SERVICE, deps=["postgres"])


@app.get("/products", response_model=list[ProductResponse])
async def list_products(include_inactive: bool = False):
    """Customers call this without auth and see active products only.
    Admin tooling passes include_inactive=true to manage the full catalog."""
    pool = await get_pool()
    where = "" if include_inactive else " WHERE p.is_active"
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"{_SELECT}{where} ORDER BY p.name")
    return [dict(r) for r in rows]


@app.get("/products/{sku}", response_model=ProductResponse)
async def get_product(sku: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"{_SELECT} WHERE p.sku = $1", sku)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return dict(row)


@app.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(req: ProductCreate, _: TokenData = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchval("SELECT sku FROM products WHERE sku=$1", req.sku)
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already exists")
            await conn.execute(
                "INSERT INTO products(sku, name, description, price_cents, is_active) "
                "VALUES($1,$2,$3,$4,$5)",
                req.sku, req.name, req.description, req.price_cents, req.is_active,
            )
            # Stock lives in the inventory table the saga reserves against.
            await conn.execute(
                "INSERT INTO inventory(sku, available, reserved) VALUES($1,$2,0) "
                "ON CONFLICT (sku) DO UPDATE SET available = EXCLUDED.available",
                req.sku, max(req.stock_quantity, 0),
            )
        row = await conn.fetchrow(f"{_SELECT} WHERE p.sku=$1", req.sku)
    log.info("product created: %s", req.sku)
    return dict(row)


@app.patch("/products/{sku}", response_model=ProductResponse)
async def update_product(sku: str, req: ProductUpdate, _: TokenData = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            exists = await conn.fetchval("SELECT sku FROM products WHERE sku=$1", sku)
            if not exists:
                raise HTTPException(status_code=404, detail="Product not found")

            sets, args = [], []
            for field in ("name", "description", "price_cents", "is_active"):
                value = getattr(req, field)
                if value is not None:
                    args.append(value)
                    sets.append(f"{field} = ${len(args)}")
            if sets:
                sets.append("updated_at = now()")
                args.append(sku)
                await conn.execute(f"UPDATE products SET {', '.join(sets)} WHERE sku = ${len(args)}", *args)

            if req.stock_quantity is not None:
                await conn.execute(
                    "INSERT INTO inventory(sku, available, reserved) VALUES($1,$2,0) "
                    "ON CONFLICT (sku) DO UPDATE SET available = EXCLUDED.available",
                    sku, max(req.stock_quantity, 0),
                )
        row = await conn.fetchrow(f"{_SELECT} WHERE p.sku=$1", sku)
    log.info("product updated: %s", sku)
    return dict(row)


@app.patch("/products/{sku}/deactivate", response_model=ProductResponse)
async def deactivate_product(sku: str, _: TokenData = Depends(require_admin)):
    """Soft-delete: keeps order history intact but hides the product from customers."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE products SET is_active = false, updated_at = now() WHERE sku=$1", sku
        )
        if result.endswith("0"):
            raise HTTPException(status_code=404, detail="Product not found")
        row = await conn.fetchrow(f"{_SELECT} WHERE p.sku=$1", sku)
    log.info("product deactivated: %s", sku)
    return dict(row)


@app.delete("/products/{sku}", status_code=204)
async def delete_product(sku: str, _: TokenData = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM products WHERE sku=$1", sku)
    if result == "DELETE 0":
        return Response(status_code=404)
    return Response(status_code=204)
