import ipaddress
import logging
import os
import re
import shutil
import threading
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

import yt_dlp

try:
    import imageio_ffmpeg
except ImportError:  # pragma: no cover
    imageio_ffmpeg = None

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

FILE_TTL_SECONDS = int(os.environ.get("FILE_TTL_SECONDS", "1800"))
MAX_DOWNLOAD_BYTES = int(os.environ.get("MAX_DOWNLOAD_BYTES", str(150 * 1024 * 1024)))
RATE_LIMIT_COUNT = int(os.environ.get("RATE_LIMIT_COUNT", "5"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "600"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # JSON request body limit.
app.config["JSON_SORT_KEYS"] = False

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("zee-reel-downloader")

_rate_lock = threading.Lock()
_rate_buckets = defaultdict(deque)

INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com"}
REEL_PATH = re.compile(r"^/reel/[A-Za-z0-9_-]+/?$")


def client_key() -> str:
    """Use the proxy-aware address only when explicitly trusted by deployment."""
    if os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true":
        return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limited(key: str) -> bool:
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets[key]
        while bucket and now - bucket[0] > RATE_LIMIT_WINDOW:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_COUNT:
            return True
        bucket.append(now)
        return False


def cleanup_expired() -> None:
    now = time.time()
    for item in DOWNLOAD_DIR.iterdir():
        if item.name == ".gitkeep":
            continue
        try:
            if now - item.stat().st_mtime > FILE_TTL_SECONDS:
                shutil.rmtree(item, ignore_errors=True) if item.is_dir() else item.unlink(missing_ok=True)
        except OSError:
            logger.debug("Could not inspect temporary item", exc_info=True)


def is_public_reel_url(value: object) -> bool:
    if not isinstance(value, str) or len(value) > 2048:
        return False
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return False
    if parsed.scheme != "https" or parsed.hostname not in INSTAGRAM_HOSTS:
        return False
    if parsed.username or parsed.password or parsed.port:
        return False
    if parsed.fragment:
        # Fragments are client-side only and are not needed for extraction.
        return False
    return bool(REEL_PATH.fullmatch(parsed.path))


def ffmpeg_path() -> str | None:
    if imageio_ffmpeg is None:
        return None
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def safe_media_path(token: str, kind: str) -> Path | None:
    if not re.fullmatch(r"[a-f0-9]{32}", token) or kind not in {"video", "audio"}:
        return None
    candidate = (DOWNLOAD_DIR / token / f"{kind}.{'mp4' if kind == 'video' else 'mp3'}").resolve()
    try:
        candidate.relative_to(DOWNLOAD_DIR.resolve())
    except ValueError:
        return None
    return candidate


def find_output(directory: Path, suffix: str) -> Path | None:
    matches = [p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == suffix]
    return max(matches, key=lambda p: p.stat().st_mtime) if matches else None


def process_reel(url: str, token: str) -> tuple[Path, Path]:
    work_dir = DOWNLOAD_DIR / token
    work_dir.mkdir(mode=0o700)
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("Media conversion is unavailable on this server.")

    options = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": str(work_dir / "video.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": False,
        "socket_timeout": 25,
        "retries": 1,
        "max_filesize": MAX_DOWNLOAD_BYTES,
        "writethumbnail": False,
        "cookiefile": None,
        "ffmpeg_location": ffmpeg,
        "merge_output_format": "mp4",
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        if not info:
            raise RuntimeError("No public media was found for this URL.")

    source = find_output(work_dir, ".mp4") or find_output(work_dir, ".webm") or find_output(work_dir, ".mkv")
    if not source or source.stat().st_size > MAX_DOWNLOAD_BYTES:
        raise RuntimeError("The media is unavailable or exceeds the size limit.")

    video_path = work_dir / "video.mp4"
    audio_path = work_dir / "audio.mp3"
    if source != video_path:
        source.replace(video_path)

    audio_options = {
        "format": "bestaudio/best",
        "outtmpl": str(work_dir / "audio_source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 25,
        "retries": 1,
        "max_filesize": MAX_DOWNLOAD_BYTES,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
        "ffmpeg_location": ffmpeg,
    }
    with yt_dlp.YoutubeDL(audio_options) as downloader:
        downloader.download([url])
    generated_audio = find_output(work_dir, ".mp3")
    if not generated_audio:
        raise RuntimeError("Audio conversion failed for this media.")
    if generated_audio != audio_path:
        generated_audio.replace(audio_path)
    for item in work_dir.iterdir():
        if item.name not in {"video.mp4", "audio.mp3"}:
            item.unlink(missing_ok=True)
    return video_path, audio_path


@app.get("/")
def index():
    cleanup_expired()
    return render_template("index.html")


@app.post("/api/download")
def api_download():
    cleanup_expired()
    if rate_limited(client_key()):
        return jsonify(success=False, error="Rate limit reached. Please try again in a few minutes."), 429
    payload = request.get_json(silent=True) or {}
    url = str(payload.get("url", "")).strip()
    if not is_public_reel_url(url):
        return jsonify(success=False, error="Enter a valid public Instagram Reel URL."), 400

    token = uuid.uuid4().hex
    try:
        process_reel(url, token)
    except yt_dlp.utils.DownloadError as exc:
        shutil.rmtree(DOWNLOAD_DIR / token, ignore_errors=True)
        message = str(exc).lower()
        if any(term in message for term in ("login", "private", "authentication")):
            error = "This Reel appears to be private or requires authentication. Only public Reels are supported."
        elif "timed out" in message or "timeout" in message:
            error = "Instagram took too long to respond. Please try again."
        else:
            error = "Unable to process this public Reel. Instagram may have changed its systems."
        logger.info("Public Reel processing failed: %s", type(exc).__name__)
        return jsonify(success=False, error=error), 422
    except Exception:
        shutil.rmtree(DOWNLOAD_DIR / token, ignore_errors=True)
        logger.exception("Unexpected media processing failure")
        return jsonify(success=False, error="The Reel could not be processed right now. Please try again."), 500

    return jsonify(
        success=True,
        video_url=f"/media/{token}/video",
        audio_url=f"/media/{token}/audio",
        expires_in=FILE_TTL_SECONDS,
    )


@app.get("/media/<token>/<kind>")
def media(token: str, kind: str):
    cleanup_expired()
    path = safe_media_path(token, kind)
    if not path or not path.is_file():
        return jsonify(success=False, error="This download has expired. Please process the Reel again."), 404
    return send_from_directory(path.parent, path.name, as_attachment=True, max_age=0)


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return jsonify(success=False, error="The request is too large."), 413


@app.errorhandler(404)
def not_found(_error):
    return jsonify(success=False, error="The requested resource was not found."), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
