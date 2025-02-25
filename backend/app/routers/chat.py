from fastapi import APIRouter, WebSocket, Depends, HTTPException, Query, UploadFile, File
from typing import List, Optional
from pathlib import Path
import shutil
import os
from datetime import datetime

router = APIRouter()

# Create a directory for storing GIFs
GIFS_DIR = Path("chat_gifs")
GIFS_DIR.mkdir(exist_ok=True)

@router.post("/gifs/upload")
async def upload_gif(
    file: UploadFile = File(...),
):
    """Upload a GIF file"""
    if not file.content_type.startswith('image/gif'):
        raise HTTPException(status_code=400, detail="Only GIF files are allowed")

    try:
        # Create unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{file.filename}"
        file_path = GIFS_DIR / filename

        # Save file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "filename": filename,
            "file_path": str(file_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/gifs/list")
async def list_gifs():
    """List all available GIFs"""
    try:
        gifs = []
        for file in GIFS_DIR.glob("*.gif"):
            gifs.append({
                "filename": file.name,
                "file_path": str(file)
            })
        return gifs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 