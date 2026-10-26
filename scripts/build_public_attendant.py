"""Publish only customer-safe I-240 attendant status.

The source schedule response may contain private operational information.
Never copy the source response into the GitHub Pages artifact or logs.
"""
import json
import re
import sys
from datetime import datetime, time, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

STORE_TZ = ZoneInfo("America/Chicago")
SOURCE = "https://coinopreports.mccrarytechnology.com/api/schedule"
MAX_BYTES = 1_000_000


def safe_base(now):
    return {
        "version": 1,
        "store": "i240",
        "status": "unavailable",
        "attendants": [],
        "checkedAt": now.astimezone(timezone.utc).isoformat(
            timespec="seconds"
        ).replace("+00:00", "Z"),
    }


def public_first_name(value):
    if not isinstance(value, str):
        return None
    parts = value.strip().split()
    if not parts:
        return None
    first = parts[0].strip(".,:;")
    if not re.fullmatch(r"[A-Za-z][A-Za-z'-]{0,39}", first):
        return None
    return first.title()


def time_value(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip().upper(), "%I:%M %p").time()
    except ValueError:
        return None


def project_attendance(payload, now):
    result = safe_base(now)
    local_now = now.astimezone(STORE_TZ)
    if not (time(8, 0) <= local_now.time() < time(21, 0)):
        result["status"] = "outside_hours"
        return result

    if not isinstance(payload, dict) or payload.get("ok") is not True:
        return result
    data = payload.get("data")
    store = data.get("I240") if isinstance(data, dict) else None
    rows = store.get("Schedule") if isinstance(store, dict) else None
    if not isinstance(rows, list):
        return result

    today = local_now.date().isoformat()
    current = []
    for row in rows:
        if not isinstance(row, dict) or row.get("Date") != today:
            continue
        start = time_value(row.get("StartTime"))
        end = time_value(row.get("EndTime"))
        if start is None or end is None or start >= end:
            continue
        if start <= local_now.time() < end:
            current.append(row)

    if len(current) != 1:
        return result
    workers = current[0].get("ActualWorkers")
    if not isinstance(workers, list):
        return result

    seen = set()
    names = []
    for worker in workers:
        if not isinstance(worker, dict):
            continue
        # For open rows, ClockOutTime may be a running-hours placeholder.
        # IsOpen and EndSource are the indicators of an actual close-out.
        if worker.get("IsOpen") is not True or str(worker.get("EndSource") or "").strip():
            continue
        if not time_value(worker.get("ClockInTime")):
            continue
        name = public_first_name(worker.get("EmployeeName"))
        if name and name.lower() not in seen:
            names.append(name)
            seen.add(name.lower())

    if names:
        result["status"] = "on_duty"
        result["attendants"] = names[:6]
    else:
        # Do NOT substitute DefaultEmployee when a clock-in is unconfirmed.
        result["status"] = "not_confirmed"
    return result


def fetch_attendance(now):
    local_date = now.astimezone(STORE_TZ).date().isoformat()
    request = Request(
        SOURCE + "?date=" + local_date,
        headers={
            "User-Agent": "CoinOpPublicAttendantPublisher/1.0",
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        },
    )
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError("Schedule request unsuccessful")
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("Schedule response exceeds safety limit")
    return json.loads(body)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build_public_attendant.py OUTPUT_JSON")
    now = datetime.now(timezone.utc)
    result = safe_base(now)
    try:
        result = project_attendance(fetch_attendance(now), now)
    except Exception:
        # Fail closed. Never print API responses or sensitive data.
        print("Schedule source unavailable; publishing neutral status")
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, ensure_ascii=True) + "\n",
                      encoding="utf-8")
    print("I-240 public attendant status:", result["status"])


if __name__ == "__main__":
    main()
