"""Independent, read-only, public I-240 attendant data service.

Only publishes whitelisted fields. Does not change the employee portal,
schedules, register or payroll. Binds on loopback, designed for an independently
routed Cloudflare hostname. Python 3.13, standard library only.
"""

import argparse
import json
import re
import sys
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

SOURCE_BASE = "http://127.0.0.1:8765/api/schedule"
HOST = "127.0.0.1"
PORT = 8767
CUSTOMER_ORIGIN = "https://skinny-pinks.github.io"
PATH = "/v1/i240/attendant"
CACHE_SECONDS = 20
MAX_INPUT_BYTES = 1024 * 1024
MAX_PUBLIC_WORKERS = 4
CLOCK_PATTERN = "%I:%M %p"


def clock(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip().upper(), CLOCK_PATTERN).time()
    except ValueError:
        return None


def label(value):
    """Never publish employee surnames, identifiers or free-form text."""
    if not isinstance(value, str) or not value.strip():
        return None
    first = value.strip().split()[0].strip(".,:;")
    if not re.fullmatch(r"[A-Za-z][A-Za-z'-]{0,39}", first):
        return None
    return first.title()


def public_time(value):
    parsed = clock(value)
    if parsed is None:
        return None
    return datetime.combine(datetime(2000, 1, 1).date(), parsed).strftime("%-I:%M %p") if sys.platform != "win32" else datetime.combine(datetime(2000, 1, 1).date(), parsed).strftime("%#I:%M %p")


def baseline(now):
    return {
        "version": 1,
        "store": "i240",
        "status": "unavailable",
        "attendants": [],
        "checkedAt": now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "current": None,
        "opening": {"status": "unknown", "recordedAt": None},
        "todayShifts": [],
    }


def project(source, now):
    """Project private schedule payload to a strict public-only JSON schema.

    'now' must be the store's local wall clock. It is never taken from source.
    A register check-in does not establish that the front door is unlocked.
    """
    out = baseline(now)
    day = now.date().isoformat()
    current_time = now.time().replace(tzinfo=None)
    if not isinstance(source, dict) or source.get("ok") is not True:
        return out
    data = source.get("data")
    store = data.get("I240") if isinstance(data, dict) else None
    shifts = store.get("Schedule") if isinstance(store, dict) else None
    if not isinstance(shifts, list):
        return out

    candidates = []
    morning_starts = []
    matching = []
    for row in shifts:
        if not isinstance(row, dict) or row.get("Date") != day:
            continue
        shift = row.get("ShiftName")
        if shift not in ("AM", "PM") or any(s["shift"] == shift for s in matching):
            continue
        start = clock(row.get("StartTime"))
        end = clock(row.get("EndTime"))
        if not start or not end or start >= end:
            continue
        workers = row.get("ActualWorkers")
        if not isinstance(workers, list):
            workers = []
        started = []
        active = []
        for worker in workers:
            if not isinstance(worker, dict):
                continue
            in_time = clock(worker.get("ClockInTime"))
            name = label(worker.get("EmployeeName"))
            if not name or in_time is None or in_time > current_time:
                continue
            entry = {"name": name, "recordedStart": public_time(worker.get("ClockInTime"))}
            started.append(entry)
            if shift == "AM" and str(worker.get("StartSource") or "").strip() == "Start Register Capture Time":
                morning_starts.append(in_time)
            if worker.get("IsOpen") is True and not str(worker.get("EndSource") or "").strip():
                active.append(entry)

        # Shift names and scheduled times are specifically approved for today's public display.
        matching.append({
            "shift": shift,
            "scheduled": label(row.get("DefaultEmployee")),
            "start": public_time(row.get("StartTime")),
            "end": public_time(row.get("EndTime")),
            "attendance": ("checked_in" if active else "previously_checked_in" if started else "not_confirmed"),
        })

        start_dt = datetime.combine(now.date(), start)
        end_dt = datetime.combine(now.date(), end)
        # Recognize early check-in (e.g. PM at 1:29 for a 2:00 start,
        # or AM at 7:45 for an 8:00 start). Do not select future staff
        # merely because they are scheduled.
        eligible = start_dt - timedelta(hours=2) <= now.replace(tzinfo=None) < end_dt
        if eligible and active:
            candidates.append((start, shift, active))

    out["todayShifts"] = sorted(matching, key=lambda r: 0 if r["shift"] == "AM" else 1)
    if morning_starts:
        first = min(morning_starts)
        out["opening"] = {
            "status": "register_checkin_recorded",
            "recordedAt": public_time(first.strftime(CLOCK_PATTERN)),
        }
    elif current_time >= datetime.strptime("8:00 AM", CLOCK_PATTERN).time():
        out["opening"] = {"status": "not_confirmed", "recordedAt": None}
    else:
        out["opening"] = {"status": "before_scheduled_open", "recordedAt": None}

    if current_time >= datetime.strptime("9:00 PM", CLOCK_PATTERN).time():
        out["status"] = "outside_hours"
    elif candidates:
        latest_start = max(item[0] for item in candidates)
        latest = [c for c in candidates if c[0] == latest_start]
        distinct = []
        seen = set()
        for _start, shift, workers in latest:
            for worker in workers:
                key = worker["name"].casefold()
                if key not in seen:
                    distinct.append({**worker, "shift": shift})
                    seen.add(key)
        distinct = distinct[:MAX_PUBLIC_WORKERS]
        out["status"] = "on_duty"
        out["attendants"] = [r["name"] for r in distinct]
        out["current"] = {"attendants": distinct}
    else:
        out["status"] = "not_confirmed" if matching else "unavailable"
    return out


class CachedProjection:
    def __init__(self):
        self._lock = threading.Lock()
        self._deadline = 0.0
        self._data = None

    def get(self):
        with self._lock:
            if time.monotonic() < self._deadline and self._data is not None:
                return self._data
            now = datetime.now().astimezone()
            result = baseline(now)
            try:
                url = SOURCE_BASE + "?date=" + now.date().isoformat()
                request = Request(url, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
                with urlopen(request, timeout=5) as response:
                    if response.status != 200:
                        raise ValueError("Attendance source unavailable")
                    body = response.read(MAX_INPUT_BYTES + 1)
                if len(body) > MAX_INPUT_BYTES:
                    raise ValueError("Attendance response too large")
                result = project(json.loads(body), now)
            except Exception:
                # No private exception text, URL, or upstream body is logged or published.
                pass
            self._data = result
            self._deadline = time.monotonic() + CACHE_SECONDS
            return self._data


CACHE = CachedProjection()


class Handler(BaseHTTPRequestHandler):
    server_version = "CoinOpCustomerStatus/1.0"
    sys_version = ""

    def _respond(self, payload, http_status=200):
        content = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        self.send_response(http_status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'")
        self.send_header("Access-Control-Allow-Origin", CUSTOMER_ORIGIN)
        self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        clean_path = self.path.split("?", 1)[0]
        if clean_path == "/health":
            return self._respond({"ok": True})
        if clean_path != PATH:
            return self._respond({"error": "not_found"}, 404)
        return self._respond(CACHE.get())

    def do_OPTIONS(self):
        return self._respond({"error": "method_not_allowed"}, 405)

    def do_POST(self):
        return self._respond({"error": "method_not_allowed"}, 405)

    def log_message(self, format, *args):
        # Public HTTP query strings, referers and upstream fields are not logged.
        pass


class ProjectionTests(unittest.TestCase):
    @staticmethod
    def sample(am=None, pm=None, today="2026-10-26"):
        return {"ok": True, "data": {"I240": {"Schedule": [
            {"Date": today, "ShiftName": "AM", "DefaultEmployee": "John-Paul Redacted",
             "StartTime": "8:00 AM", "EndTime": "2:00 PM", "ActualWorkers": am or []},
            {"Date": today, "ShiftName": "PM", "DefaultEmployee": "MELVIN LEWIS",
             "StartTime": "2:00 PM", "EndTime": "9:00 PM", "ActualWorkers": pm or []},
        ], "EmployeeHourTotals": ["never_publish"]}}}

    @staticmethod
    def worker(name="John-Paul Redacted", in_at="8:00 AM", opened=True, end_source=""):
        return {"EmployeeName": name, "ClockInTime": in_at, "IsOpen": opened,
                "StartSource": "Start Register Capture Time", "EndSource": end_source,
                "PayrollRowID": "NEVER_PUBLISH", "Notes": "NEVER_PUBLISH"}

    @staticmethod
    def at(hour, minute):
        return datetime(2026, 10, 26, hour, minute).astimezone()

    def test_early_arrival_before_business_hours(self):
        src = self.sample(am=[self.worker(in_at="7:45 AM")])
        result = project(src, self.at(7, 50))
        self.assertEqual(result["status"], "on_duty")
        self.assertEqual(result["opening"]["recordedAt"], "7:45 AM")

    def test_opening_not_confirmed_at_830(self):
        result = project(self.sample(), self.at(8, 30))
        self.assertEqual(result["status"], "not_confirmed")
        self.assertEqual(result["opening"]["status"], "not_confirmed")

    def test_early_pm_preempts_am(self):
        src = self.sample(am=[self.worker()], pm=[self.worker(name="MELVIN LEWIS", in_at="1:29 PM")])
        result = project(src, self.at(13, 45))
        self.assertEqual(result["attendants"], ["Melvin"])
        self.assertEqual(result["current"]["attendants"][0]["recordedStart"], "1:29 PM")

    def test_pm_pending_before_checkin(self):
        result = project(self.sample(am=[self.worker(opened=False, end_source="Clock Out Capture Time")]), self.at(14, 20))
        self.assertEqual(result["status"], "not_confirmed")

    def test_invalid_source_fails_closed(self):
        self.assertEqual(project({"ok": False}, self.at(9, 0))["status"], "unavailable")

    def test_whitelist_never_contains_payroll(self):
        result = project(self.sample(am=[self.worker()]), self.at(12, 0))
        serialized = json.dumps(result)
        self.assertNotIn("NEVER_PUBLISH", serialized)
        self.assertNotIn("LEWIS", serialized)
        self.assertEqual(set(result), {"version", "store", "status", "attendants", "checkedAt", "current", "opening", "todayShifts"})

    def test_clocked_out_is_not_on_duty(self):
        result = project(self.sample(am=[self.worker(opened=False, end_source="Clock Out Capture Time")]), self.at(12, 5))
        self.assertEqual(result["status"], "not_confirmed")

    def test_9pm_has_no_on_duty_claim(self):
        result = project(self.sample(pm=[self.worker(name="MELVIN LEWIS", in_at="1:29 PM")]), self.at(21, 1))
        self.assertEqual(result["status"], "outside_hours")
        self.assertEqual(result["attendants"], [])


def main():
    parser = argparse.ArgumentParser(description="I-240 public-only attendant feed")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--serve", action="store_true", help="listen only on 127.0.0.1:8767")
    group.add_argument("--self-test", action="store_true", help="run offline privacy and shift tests")
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ProjectionTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        raise SystemExit(0 if result.wasSuccessful() else 1)
    print(f"Customer-only I-240 attendant endpoint listening on http://{HOST}:{PORT}{PATH}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
