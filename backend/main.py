import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from core.config import settings
from core.database import Base, engine
from core.router import router as sessions_router
from core.ws_router import router as ws_router
from orders.router import router as orders_router
from core.handoff_router import router as handoff_router
from voice.router import router as voice_router, narrate_router
from core.webhooks_router import router as webhooks_router

# Ensure DB tables exist on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kiosk Vision AI Backend")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Include all API & WebSocket routers FIRST (takes priority over static catch-all)
app.include_router(sessions_router)
app.include_router(ws_router)
app.include_router(orders_router)
app.include_router(handoff_router)
app.include_router(voice_router)
app.include_router(narrate_router)
app.include_router(webhooks_router)

@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}

# 2. Single-Service Deployment: Static file mounting & SPA catch-all route
BASE_DIR = Path(__file__).resolve().parent
# Check potential locations for built frontend dist folder:
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = BASE_DIR / "static"

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # Allow requests to API endpoints to pass through if unmatched (avoid masking 404s for API)
        if full_path.startswith("api/") or full_path.startswith("ws"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # Check if requested path is an existing static file (e.g. favicon.ico, images)
        target_file = FRONTEND_DIST / full_path
        if full_path and target_file.exists() and target_file.is_file():
            return FileResponse(str(target_file))

        # Fallback to SPA index.html for client-side routing (React Router)
        index_html = FRONTEND_DIST / "index.html"
        if index_html.exists():
            return FileResponse(str(index_html))

        return JSONResponse({"greeting": "Hey I am Shubham Sharma", "message": "Kiosk Vision AI Backend running"}, status_code=200)
else:
    @app.get("/")
    def root_fallback():
        return {"greeting": "Hey I am Shubham Sharma", "message": "Welcome to Kiosk Vision AI Backend"}