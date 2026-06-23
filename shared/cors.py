"""Shared CORS configuration for the FastAPI web services.

Local development origins (any localhost / 127.0.0.1 port) are always allowed via
a regex. The production frontend origin is added from FRONTEND_ORIGIN when set, so
the deployed Vercel app can call the Render services without code changes.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings

_LOCAL_ORIGIN_REGEX = r"http://(localhost|127\.0\.0\.1):\d+"


def add_cors(app: FastAPI) -> None:
    origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,                 # production frontend origin(s)
        allow_origin_regex=_LOCAL_ORIGIN_REGEX,  # local dev (any port)
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
