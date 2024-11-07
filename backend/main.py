from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import json
import shutil
import random
import string
import humanize
from datetime import datetime, timedelta
import asyncio
from typing import Dict
import magic
from pathlib import Path


class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


class DateTimeDecoder(json.JSONDecoder):
    def __init__(self, *args, **kwargs):
        json.JSONDecoder.__init__(
            self, object_hook=self.object_hook, *args, **kwargs)

    def object_hook(self, dct):
        for k, v in dct.items():
            if k in ['upload_time', 'expiry_time'] and isinstance(v, str):
                try:
                    dct[k] = datetime.fromisoformat(v)
                except ValueError:
                    pass
        return dct


async def lifespan(app: FastAPI):
    load_metadata()
    cleanup_task = asyncio.create_task(cleanup_expired_files())
    app.state.cleanup_task = cleanup_task
    yield

    save_metadata()
    cleanup_task.cancel()
    await cleanup_task

app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
CHUNK_DIR = Path("chunks")
METADATA_FILE = Path("metadata.json")
SITE_URL = "http://localhost:8000"
MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1GB
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.mp4', '.webm', '.pdf'}

UPLOAD_DIR.mkdir(exist_ok=True)
CHUNK_DIR.mkdir(exist_ok=True)

chunk_tracking: Dict[str, Dict[int, Path]] = {}
file_metadata: Dict[str, dict] = {}


def save_metadata():
    try:
        with METADATA_FILE.open('w') as f:
            json.dump(file_metadata, f, cls=DateTimeEncoder)
    except Exception as e:
        print(f"Error saving metadata: {e}")


def load_metadata():
    global file_metadata
    try:
        if METADATA_FILE.exists():
            with METADATA_FILE.open('r') as f:
                file_metadata = json.load(f, cls=DateTimeDecoder)
    except Exception as e:
        print(f"Error loading metadata: {e}")
        file_metadata = {}


def generate_short_id(length: int = 6) -> str:
    chars = string.ascii_letters + string.digits
    while True:
        short_id = ''.join(random.choices(chars, k=length))
        if not (UPLOAD_DIR / short_id).exists():
            return short_id


class CompleteUploadRequest(BaseModel):
    fileName: str
    totalChunks: int


def create_og_tags(file_id: str, metadata: dict) -> str:
    file_url = f"{SITE_URL}/files/{file_id}"
    is_image = metadata['mime_type'].startswith('image/')

    return f"""
    <meta property="og:title" content="{metadata['original_name']} - KeiranHost" />
    <meta property="og:description" content="File: {metadata['original_name']}
Size: {metadata['human_size']}
Uploaded: {metadata['upload_time'].strftime('%Y-%m-%d %H:%M:%S')}" />
    <meta property="og:image" content="{file_url if is_image else '/static/file-preview.png'}" />
    <meta property="og:url" content="{file_url}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    """


@app.post("/upload/chunk")
async def upload_chunk(
    chunk: UploadFile = File(...),
    fileName: str = Form(...),
    chunkIndex: int = Form(...),
    totalChunks: int = Form(...)
):
    file_ext = Path(fileName).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")

    file_id = generate_short_id() if chunkIndex == 0 else next(
        (k for k, v in chunk_tracking.items() if fileName in str(v)), None)

    if not file_id:
        raise HTTPException(status_code=400, detail="Upload session not found")

    chunk_path = CHUNK_DIR / f"{file_id}_{chunkIndex}{file_ext}"
    try:
        with chunk_path.open("wb") as buffer:
            shutil.copyfileobj(chunk.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save chunk: {str(e)}")

    if fileName not in chunk_tracking:
        chunk_tracking[fileName] = {}
    chunk_tracking[fileName][chunkIndex] = chunk_path

    return {"chunkId": str(chunk_path), "success": True}


@app.post("/upload/complete")
async def complete_upload(request: CompleteUploadRequest):
    if request.fileName not in chunk_tracking:
        raise HTTPException(status_code=400, detail="No chunks found")

    chunks = chunk_tracking[request.fileName]
    if len(chunks) != request.totalChunks:
        raise HTTPException(status_code=400, detail="Missing chunks")

    file_id = generate_short_id()
    file_ext = Path(request.fileName).suffix.lower()
    output_path = UPLOAD_DIR / f"{file_id}{file_ext}"

    try:
        with output_path.open("wb") as outfile:
            for i in range(request.totalChunks):
                chunk_path = chunks[i]
                with chunk_path.open("rb") as chunk:
                    shutil.copyfileobj(chunk, outfile)
                chunk_path.unlink()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to combine chunks: {str(e)}")

    del chunk_tracking[request.fileName]

    file_size = output_path.stat().st_size
    mime_type = magic.from_file(str(output_path), mime=True)

    file_metadata[file_id] = {
        'original_name': request.fileName,
        'mime_type': mime_type,
        'size': file_size,
        'human_size': humanize.naturalsize(file_size),
        'upload_time': datetime.now(),
        'expiry_time': datetime.now() + timedelta(hours=24),
        'extension': file_ext
    }

    save_metadata()

    return {
        "fileId": file_id,
        "shareLink": f"/files/{file_id}{file_ext}"
    }


@app.get("/files/{file_id}")
async def get_file(file_id: str, request: Request):
    base_file_id = file_id.split('.')[0]

    metadata = file_metadata.get(base_file_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="File not found")

    if datetime.now() > metadata['expiry_time']:
        raise HTTPException(status_code=410, detail="File has expired")

    file_path = UPLOAD_DIR / f"{base_file_id}{metadata['extension']}"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Check if it's a direct file request (for preview or download)
    if request.headers.get('accept', '').startswith('image/') or \
       request.headers.get('accept', '').startswith('video/') or \
       request.query_params.get('raw') == 'true':
        return FileResponse(
            file_path,
            media_type=metadata['mime_type'],
            filename=metadata['original_name']
        )

    file_url = f"/files/{base_file_id}{metadata['extension']}?raw=true"

    is_image = metadata['mime_type'].startswith('image/')
    is_video = metadata['mime_type'].startswith('video/')
    is_previewable = is_image or is_video

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{metadata['original_name']} - KeiranHost</title>

        <meta property="og:title" content="{metadata['original_name']} - KeiranHost" />
        <meta property="og:description" content="File: {metadata['original_name']}&#10;Size: {metadata['human_size']}&#10;Uploaded: {metadata['upload_time'].strftime('%Y-%m-%d %H:%M')}" />
        <meta property="og:image" content="{SITE_URL}{file_url if is_image else '/static/file-preview.png'}" />
        <meta property="og:url" content="{SITE_URL}{file_url}" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="KeiranHost" />
        <meta property="og:locale" content="en_GB" />
        <meta property="og:author" content="KeiranHost" />
        <meta name="twitter:card" content="summary_large_image" />

        <style>
            :root {{
                --accent-color: #3b82f6;
                --bg-color: #0f172a;
                --card-bg: #1e293b;
                --text-primary: #f8fafc;
                --text-secondary: #94a3b8;
            }}

            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}

            body {{
                background-color: var(--bg-color);
                color: var(--text-primary);
                font-family: system-ui, -apple-system, sans-serif;
                line-height: 1.5;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                padding: 1.5rem;
            }}

            .container {{
                max-width: 1024px;
                width: 100%;
                margin: 0 auto;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }}

            .header {{
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem;
                background-color: var(--card-bg);
                border-radius: 0.75rem;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }}

            .header h1 {{
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--text-primary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }}

            .preview-container {{
                background-color: var(--card-bg);
                border-radius: 0.75rem;
                padding: 1.5rem;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 400px;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }}

            .preview-content {{
                max-width: 100%;
                max-height: 70vh;
                object-fit: contain;
                border-radius: 0.5rem;
            }}

            .metadata {{
                background-color: var(--card-bg);
                border-radius: 0.75rem;
                padding: 1.5rem;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 1rem;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }}

            .metadata-item {{
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }}

            .metadata-label {{
                color: var(--text-secondary);
                font-size: 0.875rem;
            }}

            .metadata-value {{
                color: var(--text-primary);
                font-weight: 500;
            }}

            .button {{
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
                background-color: var(--accent-color);
                color: white;
                text-decoration: none;
                border-radius: 0.5rem;
                font-weight: 500;
                font-size: 0.875rem;
                transition: all 0.2s ease;
                border: none;
                cursor: pointer;
            }}

            .button:hover {{
                opacity: 0.9;
                transform: translateY(-1px);
            }}

            .button-secondary {{
                background-color: transparent;
                border: 1px solid var(--accent-color);
                color: var(--accent-color);
            }}

            .button-secondary:hover {{
                background-color: var(--accent-color);
                color: white;
            }}

            .actions {{
                display: flex;
                gap: 0.75rem;
            }}

            .no-preview {{
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1rem;
                color: var(--text-secondary);
                text-align: center;
                padding: 2rem;
            }}

            .no-preview svg {{
                width: 4rem;
                height: 4rem;
                opacity: 0.5;
            }}

            @media (max-width: 640px) {{
                body {{
                    padding: 1rem;
                }}

                .metadata {{
                    grid-template-columns: 1fr;
                }}

                .header {{
                    flex-direction: column;
                    gap: 1rem;
                    text-align: center;
                }}

                .actions {{
                    width: 100%;
                    justify-content: center;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <header class="header">
                <h1>{metadata['original_name']}</h1>
                <div class="actions">
                    <a href="{file_url}&download=true" class="button" download="{metadata['original_name']}">
                        Download
                    </a>
                </div>
            </header>

            <main class="preview-container">
                {generate_preview_html(
        metadata, file_url, is_previewable, is_image, is_video)}
            </main>

            <section class="metadata">
                <div class="metadata-item">
                    <span class="metadata-label">File Size</span>
                    <span class="metadata-value">{metadata['human_size']}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Upload Date</span>
                    <span class="metadata-value">{metadata['upload_time'].strftime('%d/%m/%Y')}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Expires</span>
                    <span class="metadata-value">{metadata['expiry_time'].strftime('%d/%m/%Y')}</span>
                </div>
            </section>
        </div>
    </body>
    </html>
    """

    return HTMLResponse(content=html_content)


def generate_preview_html(metadata, file_url, is_previewable, is_image, is_video):
    if not is_previewable:
        return '''
        <div class="no-preview">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No preview available for this file type</p>
            <p>Click the download button above to access the file</p>
        </div>
        '''

    if is_image:
        return f'<img src="{file_url}" alt="{metadata["original_name"]}" class="preview-content" loading="lazy" />'

    if is_video:
        return f"""
        <video class="preview-content" controls>
            <source src="{file_url}" type="{metadata['mime_type']}">
            Your browser does not support the video tag.
        </video>
        """

    return '<div class="no-preview">No preview available for this file type</div>'


async def cleanup_expired_files():
    while True:
        try:
            now = datetime.now()
            expired_files = [
                file_id for file_id, metadata in file_metadata.items()
                if now > metadata['expiry_time']
            ]

            for file_id in expired_files:
                file_path = UPLOAD_DIR / \
                    f"{file_id}{file_metadata[file_id]['extension']}"
                if file_path.exists():
                    file_path.unlink()
                del file_metadata[file_id]

            save_metadata()

            for chunk_file in CHUNK_DIR.glob("*"):
                if chunk_file.stat().st_mtime < (now - timedelta(hours=24)).timestamp():
                    chunk_file.unlink()

            await asyncio.sleep(3600)
        except Exception as e:
            print(f"Error in cleanup task: {e}")
            await asyncio.sleep(3600)
