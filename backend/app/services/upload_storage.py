"""Persist original upload bytes so downloads match what the user uploaded."""

from __future__ import annotations

import io
import re
import shutil
from pathlib import Path
from uuid import UUID

from openpyxl import Workbook

from app.config import get_settings

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._\- ()\[\]]+")


def upload_root() -> Path:
    settings = get_settings()
    root = Path(getattr(settings, "upload_storage_dir", "") or "data/uploads")
    if not root.is_absolute():
        # backend/ working directory when running uvicorn from backend/
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def batch_dir(batch_id: UUID | str) -> Path:
    path = upload_root() / str(batch_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_filename(name: str) -> str:
    cleaned = _SAFE_NAME.sub("_", (name or "upload.bin").strip()) or "upload.bin"
    return cleaned[:200]


def store_upload_bytes(batch_id: UUID | str, file_name: str, data: bytes) -> Path:
    target = batch_dir(batch_id) / safe_filename(file_name)
    target.write_bytes(data)
    return target


def find_stored_file(batch_id: UUID | str, file_name: str | None = None) -> Path | None:
    directory = upload_root() / str(batch_id)
    if not directory.is_dir():
        return None
    if file_name:
        candidate = directory / safe_filename(file_name)
        if candidate.is_file():
            return candidate
    files = sorted(p for p in directory.iterdir() if p.is_file())
    return files[0] if files else None


def delete_stored_upload(batch_id: UUID | str) -> None:
    directory = upload_root() / str(batch_id)
    if directory.is_dir():
        shutil.rmtree(directory, ignore_errors=True)


def media_type_for_name(file_name: str) -> str:
    lower = file_name.lower()
    if lower.endswith(".csv"):
        return "text/csv"
    if lower.endswith(".xls"):
        return "application/vnd.ms-excel"
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def rebuild_xlsx_bytes(
    file_name: str,
    headers: list[str],
    rows: list[list[object | None]],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
