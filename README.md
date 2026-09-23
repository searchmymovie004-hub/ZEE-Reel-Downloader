# ZEE Reel Downloader

A mobile-first Flask web application for processing **publicly accessible Instagram Reel URLs** into temporary MP4 video and MP3 audio downloads.

## Features

- Real server-side extraction through `yt-dlp`; no fake or hardcoded download links.
- MP4 and MP3 output using the bundled `imageio-ffmpeg` binary.
- Canonical HTTPS Instagram Reel URL validation.
- In-memory per-client rate limiting, request-size limits, timeouts, retries, and friendly error responses.
- Tokenized media URLs that do not expose filesystem paths.
- Automatic cleanup of generated media after 30 minutes, plus cleanup on subsequent requests.
- Render Web Service configuration with Gunicorn.

## Local run

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:10000`. For production-like local execution:

```bash
gunicorn --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:10000 app:app
```

The server uses the Render-provided `PORT` variable when deployed and defaults to `10000` locally.

## Deploy to Render

1. Push the project to a GitHub repository.
2. In Render, create a new **Web Service** from that repository.
3. Render will use `render.yaml`, or set the build command to `pip install -r requirements.txt` and the start command to `gunicorn --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:$PORT app:app`.
4. Deploy and open the generated service URL.

The free Render filesystem is ephemeral, which is appropriate here because generated media is deliberately temporary. A single worker is recommended because the rate limiter is in-memory; for a multi-worker deployment, move rate limiting and job storage to a shared service.

## Usage and compliance

This application does not accept private links, login credentials, cookies, arbitrary URLs, or access-restricted media. Users are responsible for downloading only media they created or are authorized to save, and for following applicable law and Instagram's terms. Instagram may change its public delivery systems, which can make an otherwise valid public Reel temporarily unavailable.
