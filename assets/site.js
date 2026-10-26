(function () {
  "use strict";
  const cfg = window.COINOP_SITE;
  if (!cfg) return;

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const weekdayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const shortDay = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  const wordDay = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };

  document.getElementById("copyright-year").textContent = new Date().getFullYear();

  function newEl(tag, classes, text) {
    const e = document.createElement(tag);
    if (classes) e.className = classes;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Prices are rendered from the public config to avoid duplicated price constants.
  const grid = document.getElementById("washer-grid");
  if (grid && Array.isArray(cfg.washerPrices) && cfg.washerPrices.length) {
    grid.replaceChildren();
    cfg.washerPrices.forEach((washer, idx) => {
      if (!washer || typeof washer.price !== "number" || !Number.isFinite(washer.price)) return;
      const card = newEl("article", "washer-card" + (idx === 1 ? " featured" : ""));
      const top = newEl("div", "card-top");
      top.append(newEl("span", "load-tag", washer.loadLabel || "WASHER"));
      const machine = newEl("span", "simple-machine");
      machine.setAttribute("aria-hidden", "true");
      top.append(machine);
      card.append(top, newEl("h3", "", washer.title));
      const price = newEl("div", "price");
      price.append(document.createTextNode(currency.format(washer.price) + " "), newEl("span", "", "/ wash"));
      const foot = newEl("div", "card-foot", "Free drying with your wash");
      const arr = newEl("span", "", "↗");
      arr.setAttribute("aria-hidden", "true");
      foot.append(arr);
      card.append(price, foot);
      grid.append(card);
    });
  }

  // Business hours are owner-confirmed. No "open now" claim is calculated:
  // closure/holiday exceptions cannot be verified automatically.
  function validTime(str) {
    return typeof str === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
  }
  const allHoursVerified = weekdayOrder.every(day => {
    const h = cfg.hours?.[day];
    return !!h && (h.closed === true || (validTime(h.open) && validTime(h.close)));
  });
  function formatTime(t) {
    const [h, m] = t.split(":").map(Number);
    const suffix = h < 12 ? "AM" : "PM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
  }
  function intervalText(h) {
    return h.closed ? "Closed" : formatTime(h.open) + " – " + formatTime(h.close);
  }
  function sameHoursEveryDay() {
    if (!allHoursVerified) return false;
    const first = intervalText(cfg.hours[weekdayOrder[0]]);
    return weekdayOrder.every(day => intervalText(cfg.hours[day]) === first);
  }
  function formatSchedule() {
    const out = newEl("dl", "hours-list");
    weekdayOrder.forEach(day => {
      const row = newEl("div", "hours-row");
      row.append(newEl("dt", "", wordDay[day]), newEl("dd", "", intervalText(cfg.hours[day])));
      out.append(row);
    });
    return out;
  }
  function appendCutoff(list, title, time) {
    if (!validTime(time)) return;
    const row = newEl("div", "cutoff-row");
    row.append(newEl("span", "cutoff-label", title), newEl("strong", "", formatTime(time)));
    list.append(row);
  }
  const container = document.getElementById("hours-content");
  if (container && allHoursVerified) {
    const fragment = document.createDocumentFragment();
    if (sameHoursEveryDay() && !cfg.hours.monday.closed) {
      const daily = newEl("div", "daily-hours");
      daily.append(newEl("span", "daily-hours-label", "OPEN EVERY DAY"));
      const headline = newEl("strong", "", intervalText(cfg.hours.monday));
      daily.append(headline);
      fragment.append(daily);
    } else {
      fragment.append(formatSchedule());
    }
    const cutoffs = newEl("div", "cutoff-list");
    cutoffs.setAttribute("aria-label", "Last load and closing times");
    appendCutoff(cutoffs, "Last wash load", cfg.lastWashLoad);
    appendCutoff(cutoffs, "Last paid dryer load", cfg.lastPaidDryerLoad);
    appendCutoff(cutoffs, "Everybody out by", cfg.allCustomersOutBy);
    fragment.append(cutoffs);
    container.replaceChildren(fragment);
    document.getElementById("hours-note").textContent = "Thank you for helping us close on time!";
  }
  // Show confirmed hours in the hero without exposing any unverified "open now" state.
  const hero = document.querySelector(".hero-hours");
  if (hero) {
    if (allHoursVerified && sameHoursEveryDay() && !cfg.hours.monday.closed) {
      hero.querySelector("strong").textContent = "Open every day";
      hero.querySelector("span:last-child").textContent = intervalText(cfg.hours.monday);
    } else {
      hero.remove();
    }
  }
  // The manager phone number was provided on the public store-hours sign.
  const managerLink = document.getElementById("manager-phone-link");
  const managerPhone = typeof cfg.managerPhone === "string" ? cfg.managerPhone.trim() : "";
  if (managerLink) {
    if (/^\+?[\d\s().-]{7,24}$/.test(managerPhone)) {
      managerLink.href = "tel:" + managerPhone.replace(/[^+\d]/g, "");
      managerLink.setAttribute("aria-label", "Call the manager at " + managerPhone);
      managerLink.replaceChildren(document.createTextNode(managerPhone + " "), newEl("span", "", "↗"));
      managerLink.lastChild.setAttribute("aria-hidden", "true");
    } else {
      managerLink.closest(".manager-contact")?.remove();
    }
  }

  // Main store line is intentionally separate from the after-hours manager line.
  const storePhone = typeof cfg.storePhone === "string" ? cfg.storePhone.trim() : "";
  const storePhoneLink = document.getElementById("store-phone-link");
  if (storePhoneLink) {
    if (/^\+?[\d\s().-]{7,24}$/.test(storePhone)) {
      storePhoneLink.href = "tel:" + storePhone.replace(/[^+\d]/g, "");
      storePhoneLink.textContent = storePhone;
      storePhoneLink.setAttribute("aria-label", "Call I-240 Coin-Op Laundry at " + storePhone);
    } else {
      storePhoneLink.closest(".store-contact")?.remove();
    }
  }

  const addr = typeof cfg.address === "string" ? cfg.address.trim() : "";
  const directions = document.getElementById("directions-link");
  if (addr) {
    document.getElementById("address-content").textContent = addr;
    if (directions) {
      // Prefer the exact owner-supplied Google Maps place link. The fallback
      // works if the link is removed from public config in a later revision.
      let mapsUrl = "";
      if (typeof cfg.googleMapsUrl === "string" && cfg.googleMapsUrl.trim()) {
        try {
          const parsed = new URL(cfg.googleMapsUrl.trim());
          if (parsed.protocol === "https:" &&
              ["maps.app.goo.gl", "google.com", "www.google.com", "maps.google.com"].includes(parsed.hostname)) {
            mapsUrl = parsed.href;
          }
        } catch (_error) { /* Invalid URL: use the address search instead. */ }
      }
      directions.href = mapsUrl || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
      directions.hidden = false;
    }
  } else {
    document.getElementById("address-content").textContent = cfg.city || "Oklahoma City, Oklahoma";
    if (directions) directions.hidden = true;
  }
})();