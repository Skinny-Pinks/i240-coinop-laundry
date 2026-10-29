(function () {
  "use strict";

  // The customer browser NEVER requests private employee or payroll routes.
  // Only a separately published, sanitized, read-only status endpoint is allowed.
  const cfg = window.COINOP_SITE || {};
  const stateEl = document.getElementById("attendant-state");
  const nameEl = document.getElementById("attendant-name");
  const messageEl = document.getElementById("attendant-message");
  const clockInEl = document.getElementById("attendant-clockin");
  const openingEl = document.getElementById("opening-status");
  const updatedEl = document.getElementById("attendant-updated");
  if (!stateEl || !nameEl || !messageEl || !clockInEl || !openingEl || !updatedEl) return;

  const MAX_AGE_MS = 2 * 60 * 1000;
  const REFRESH_MS = 60 * 1000;
  const VALID_TIME = /^(?:[1-9]|1[0-2]):[0-5]\d (?:AM|PM)$/;
  const VALID_NAME = /^[A-Za-z][A-Za-z'-]{0,39}$/;
  const safeName = value => typeof value === "string" && VALID_NAME.test(value) ? value : null;
  const safeTime = value => typeof value === "string" && VALID_TIME.test(value) ? value : null;
  const phrase = value => typeof value === "string" ? value : "";

  function configuredUrl() {
    if (typeof cfg.publicAttendantStatusUrl !== "string" || !cfg.publicAttendantStatusUrl.trim()) return null;
    try {
      const url = new URL(cfg.publicAttendantStatusUrl);
      if (url.protocol !== "https:" || url.username || url.password ||
          !url.hostname.endsWith(".mccrarytechnology.com") ||
          ["coinopreports.mccrarytechnology.com", "transcript.mccrarytechnology.com"].includes(url.hostname) ||
          url.pathname !== "/v1/i240/attendant") return null;
      return url;
    } catch (_error) {
      return null;
    }
  }

  function setState(label, tone) {
    stateEl.textContent = label;
    stateEl.classList.toggle("is-live", tone === "live");
    stateEl.classList.toggle("is-warning", tone === "warning");
  }

  function setMain(name, message, recordedStart) {
    nameEl.textContent = name;
    messageEl.textContent = message;
    if (recordedStart) {
      clockInEl.textContent = recordedStart;
      clockInEl.hidden = false;
    } else {
      clockInEl.textContent = "";
      clockInEl.hidden = true;
    }
  }

  function neutral(message) {
    setState("STATUS UNAVAILABLE", "warning");
    setMain("Check before visiting", message ||
      "We can't confirm who's on duty right now. Call the store before bringing your laundry.", null);
    openingEl.textContent = "Opening and register status not currently available.";
    updatedEl.textContent = "";
    for (const shift of ["am", "pm"]) {
      document.getElementById("shift-" + shift).classList.remove("is-current");
      document.getElementById("shift-" + shift + "-name").textContent = "Today's schedule unavailable";
      document.getElementById("shift-" + shift + "-status").textContent = "Check-in details not available";
    }
  }

  function minuteOfDay(value) {
    const valid = safeTime(value);
    if (!valid) return null;
    const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(valid);
    if (!match) return null;
    return (Number(match[1]) % 12) * 60 + Number(match[2]) + (match[3] === "PM" ? 720 : 0);
  }

  function showOpening(opening, shifts) {
    if (!opening || typeof opening !== "object") {
      openingEl.textContent = "Morning register opening time not available.";
      return;
    }
    const time = safeTime(opening.recordedAt);
    const am = Array.isArray(shifts) ? shifts.find(item => item?.shift === "AM") : null;
    const scheduledTime = safeTime(am?.start) || "8:00 AM";
    if (opening.status === "register_checkin_recorded" && time) {
      const delay = minuteOfDay(time) - minuteOfDay(scheduledTime);
      if (Number.isFinite(delay) && delay > 0) {
        const duration = delay >= 60 ? Math.floor(delay / 60) + " hr" + (delay >= 120 ? "s" : "") +
          (delay % 60 ? " " + (delay % 60) + " min" : "") : delay + " min";
        openingEl.textContent = "Register opened today at " + time +
          " · Scheduled opening " + scheduledTime + " · " + duration + " late.";
      } else {
        openingEl.textContent = "Register opened today at " + time + ".";
      }
    } else if (opening.status === "not_confirmed") {
      openingEl.textContent = "No register opening check-in confirmed. Call before visiting.";
    } else if (opening.status === "before_scheduled_open") {
      openingEl.textContent = "Scheduled opening: " + scheduledTime + " · No check-in yet.";
    } else {
      openingEl.textContent = "Morning register opening information unavailable.";
    }
  }

  function showShifts(status) {
    const shifts = Array.isArray(status.todayShifts) ? status.todayShifts : [];
    for (const key of ["am", "pm"]) {
      const shiftName = key.toUpperCase();
      const row = shifts.find(item => item && item.shift === shiftName);
      const rowEl = document.getElementById("shift-" + key);
      const nameEl = document.getElementById("shift-" + key + "-name");
      const timeEl = document.getElementById("shift-" + key + "-hours");
      const statusEl = document.getElementById("shift-" + key + "-status");
      rowEl.classList.remove("is-current");
      if (!row) {
        nameEl.textContent = "Schedule unavailable";
        statusEl.textContent = "Check-in not verified";
        continue;
      }
      const scheduledName = safeName(row.scheduled);
      nameEl.textContent = scheduledName || "Attendant not listed";
      const start = safeTime(row.start), end = safeTime(row.end);
      if (start && end) timeEl.textContent = start + " – " + end;
      const currentWorkers = Array.isArray(status.current?.attendants) ? status.current.attendants : [];
      const worker = currentWorkers.find(item => item?.shift === shiftName && safeName(item?.name));
      const actualStart = safeTime(worker?.recordedStart) || safeTime(row.actualStart) ||
        (shiftName === "AM" ? safeTime(status.opening?.recordedAt) : null);
      const departure = safeTime(row.confirmedDeparture) ||
        (status.lastDeparture?.shift === shiftName ? safeTime(status.lastDeparture.recordedAt) : null);
      if (status.status === "on_duty" && worker) {
        nameEl.textContent = safeName(worker.name);
        rowEl.classList.add("is-current");
        statusEl.textContent = actualStart ? "Here now · checked in at " + actualStart : "Here now · active register check-in";
      } else if (row.attendance === "checked_in") {
        statusEl.textContent = status.status === "outside_hours" ?
          "Register record still open; outside posted hours" :
          "Register record still open; another shift is currently serving customers";
      } else if (row.attendance === "previously_checked_in") {
        statusEl.textContent = departure ? "Clocked out at " + departure :
          "Previously checked in; no active clock-in";
      } else {
        statusEl.textContent = "Scheduled · check-in not confirmed";
      }
    }
  }

  function showAttendance(data) {
    showShifts(data);
    showOpening(data.opening, data.todayShifts);

    const stamp = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
    }).format(new Date(data.checkedAt));
    updatedEl.textContent = "Store status checked " + stamp + " Central · updates about every minute";

    const currentRows = Array.isArray(data.current?.attendants) ? data.current.attendants : [];
    const names = currentRows.map(row => safeName(row?.name)).filter(Boolean).slice(0, 4);
    const first = currentRows[0];
    const clockIn = safeTime(first?.recordedStart);
    const shift = first?.shift === "AM" || first?.shift === "PM" ? first.shift : null;
    const shiftRows = Array.isArray(data.todayShifts) ? data.todayShifts : [];
    const currentShift = shiftRows.find(item => item?.shift === shift);
    const start = safeTime(currentShift?.start), end = safeTime(currentShift?.end);
    const scheduled = start && end ? " Scheduled " + shift + " shift: " + start + "–" + end + "." : "";

    if (data.status === "on_duty" && names.length) {
      setState("OPEN FOR LAUNDRY", "live");
      setMain(
        names.length === 1 ? names[0] + " is here!" : names.join(" & ") + " are here!",
        "Come on in! An attendant is on duty and ready to help with your laundry." + scheduled,
        clockIn ? (names.length === 1 ? names[0] + " checked in at " : "First recorded check-in: ") + clockIn : null
      );
    } else if (data.status === "not_confirmed") {
      setState("OPENING NOT CONFIRMED", "warning");
      const last = data.lastDeparture;
      const lastName = safeName(last?.name), outAt = safeTime(last?.recordedAt);
      if (lastName && outAt) {
        setMain(lastName + " clocked out at " + outAt,
          "Nobody is currently confirmed on duty. Please call the store before visiting.", null);
      } else {
        setMain("No attendant confirmed yet",
          "An employee may be scheduled, but nobody has a confirmed active register check-in. Call before making the trip.", null);
      }
    } else if (data.status === "outside_hours") {
      setState("CLOSED FOR TODAY", "warning");
      const lastName = safeName(data.lastDeparture?.name);
      const departure = safeTime(data.lastDeparture?.recordedAt);
      if (lastName && departure) {
        setMain(lastName + " clocked out at " + departure,
          "The store's posted hours have ended. We open at 8:00 AM tomorrow.", null);
      } else {
        setMain("See you tomorrow!",
          "Our posted hours are 8:00 AM–9:00 PM daily. Check back for tomorrow's attendant.", null);
      }
    } else {
      neutral("We couldn't confirm a current check-in. Please call before traveling.");
    }
  }

  let lastConfirmedAt = null;
  let requestId = 0;

  function expireOldClaim() {
    if (lastConfirmedAt !== null && Date.now() - lastConfirmedAt > MAX_AGE_MS) {
      lastConfirmedAt = null;
      neutral("The last check-in confirmation has expired. Call before visiting.");
    }
  }

  async function refresh() {
    const thisRequest = ++requestId;
    const url = configuredUrl();
    if (!url) {
      lastConfirmedAt = null;
      neutral("The live customer attendance feed hasn't been connected yet. Call the store for today's attendant.");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      url.searchParams.set("v", String(Date.now()));
      const response = await fetch(url.toString(), {
        method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: controller.signal
      });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (!data || data.version !== 1 || data.store !== "i240" ||
          !["on_duty", "not_confirmed", "outside_hours", "unavailable"].includes(data.status)) {
        throw new Error("invalid_status");
      }
      const checkedAt = Date.parse(data.checkedAt);
      const age = Date.now() - checkedAt;
      if (!Number.isFinite(checkedAt) || age < -120000 || age > MAX_AGE_MS) {
        throw new Error("stale_status");
      }
      if (thisRequest !== requestId) return;
      lastConfirmedAt = checkedAt;
      showAttendance(data);
    } catch (_error) {
      if (thisRequest === requestId) {
        lastConfirmedAt = null;
        neutral();
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(expireOldClaim, 5000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { expireOldClaim(); refresh(); }
  });
})();
