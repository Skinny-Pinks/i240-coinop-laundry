(function () {
  "use strict";
  const stateEl = document.getElementById("attendant-state");
  const nameEl = document.getElementById("attendant-name");
  const messageEl = document.getElementById("attendant-message");
  const updatedEl = document.getElementById("attendant-updated");
  if (!stateEl || !nameEl || !messageEl || !updatedEl) return;

  const MAX_AGE_MS = 30 * 60 * 1000;
  const POLL_MS = 3 * 60 * 1000;

  function show(label, name, message, stamp, isLive) {
    stateEl.textContent = label;
    stateEl.classList.toggle("is-live", !!isLive);
    nameEl.textContent = name;
    messageEl.textContent = message;
    updatedEl.textContent = stamp || "";
  }

  function unavailable() {
    show("Update unavailable", "Ask our attendant",
      "Call the store for today's staffing information.", "", false);
  }

  async function refresh() {
    try {
      const response = await fetch(
        "data/attendant.json?ref=" + Math.floor(Date.now() / 60000),
        { method: "GET", credentials: "omit", cache: "no-store" }
      );
      if (!response.ok) throw new Error("Attendant feed unavailable");
      const status = await response.json();
      if (!status || status.version !== 1 || status.store !== "i240") {
        return unavailable();
      }

      const checkedAt = Date.parse(status.checkedAt);
      const age = Date.now() - checkedAt;
      if (!Number.isFinite(checkedAt) || age < -120000 || age > MAX_AGE_MS) {
        return unavailable();
      }

      const stamp = "Checked " + new Intl.DateTimeFormat("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
      }).format(new Date(checkedAt)) + " (Central)";

      if (status.status === "on_duty") {
        if (!Array.isArray(status.attendants)) return unavailable();
        const names = status.attendants.filter(name =>
          typeof name === "string" && /^[A-Za-z][A-Za-z'-]{0,39}$/.test(name)
        ).slice(0, 6);
        if (!names.length) return unavailable();
        return show("Clock-in confirmed", names.join(" & "),
          names.length === 1
            ? "Your I-240 attendant is on duty."
            : "Your I-240 attendants are on duty.",
          stamp, true);
      }
      if (status.status === "not_confirmed") {
        return show("Check-in not confirmed", "Attendant status pending",
          "An employee may be scheduled, but we haven't confirmed their check-in yet.",
          stamp, false);
      }
      if (status.status === "outside_hours") {
        return show("Outside business hours", "See you tomorrow!",
          "We're open every day from 8:00 AM to 9:00 PM.", stamp, false);
      }
      unavailable();
    } catch (_error) {
      unavailable();
    }
  }

  refresh();
  setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });
})();
