import os
import sys
import time
import urllib.error
import urllib.request

import cronitor

MONITOR_KEY = os.environ.get("CRONITOR_MONITOR_KEY", "zee-reel-website-10m")
WEBSITE_URL = os.environ.get("WEBSITE_URL", "https://zee-reel-downloader.onrender.com/")


def main() -> int:
    api_key = os.environ.get("CRONITOR_API_KEY")
    if not api_key:
        print("CRONITOR_API_KEY is not configured", file=sys.stderr)
        return 2

    cronitor.api_key = api_key
    monitor = cronitor.Monitor(MONITOR_KEY)
    try:
        cronitor.Monitor.put(key=MONITOR_KEY, type="job", schedule="*/10 * * * *")
    except Exception as error:
        # The monitor may already exist; telemetry can still be sent.
        print(f"Cronitor monitor registration notice: {type(error).__name__}")

    monitor.ping(state="run")
    started = time.monotonic()
    request = urllib.request.Request(
        WEBSITE_URL,
        headers={"User-Agent": "ZEE-Website-Monitor/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            status = response.status
            response.read(1024)
        if status < 200 or status >= 400:
            raise RuntimeError(f"website returned HTTP {status}")
        duration_ms = int((time.monotonic() - started) * 1000)
        monitor.ping(state="complete", message=f"HTTP {status} in {duration_ms}ms")
        print(f"Website check passed: HTTP {status} in {duration_ms}ms")
        return 0
    except (urllib.error.URLError, TimeoutError, RuntimeError) as error:
        monitor.ping(state="fail", message=str(error))
        print(f"Website check failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
