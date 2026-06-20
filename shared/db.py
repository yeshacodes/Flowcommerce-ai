import asyncpg

from .settings import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.postgres_dsn, min_size=1, max_size=10)
    return _pool


def affected(status: str) -> int:
    """asyncpg execute() returns a command tag like 'UPDATE 1'. Return the row count."""
    try:
        return int(status.split()[-1])
    except (ValueError, IndexError):
        return 0
