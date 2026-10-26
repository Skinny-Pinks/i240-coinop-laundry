/**
 * I-240 Coin-Op Laundry — customer-facing, PUBLIC business configuration.
 * Hours, last-load rules and manager phone: confirmed by store sign supplied
 * October 26, 2026. Prices and free-drying offer: confirmed by store manager.
 *
 * Never put employee passwords, payroll, source CSV files, or private portal
 * tokens here. This entire file is publicly readable on the website.
 * Store address, directions link and main phone confirmed by owner October 26, 2026.
 */
window.COINOP_SITE = {
  name: "I-240 Coin-Op Laundry",
  timeZone: "America/Chicago",
  city: "South Oklahoma City, Oklahoma",
  address: "7700 S Douglas Ave, Oklahoma City, OK 73139",
  googleMapsUrl: "https://maps.app.goo.gl/kz5DJzgJ6n3pVNNr9",
  // Public main store line, separate from the after-hours manager number.
  storePhone: "405-631-0466",
  // Manager contact is printed on the public store-hours sign.
  managerPhone: "405-618-1416",
  // "Paid dryer" below is the precise term used on the store sign.
  // It is separate from the offer of free drying when customers wash here.
  lastWashLoad: "19:30",
  lastPaidDryerLoad: "20:00",
  allCustomersOutBy: "21:00",
  // Times use the store's local 24-hour clock, America/Chicago.
  hours: {
    monday: { open: "08:00", close: "21:00" },
    tuesday: { open: "08:00", close: "21:00" },
    wednesday: { open: "08:00", close: "21:00" },
    thursday: { open: "08:00", close: "21:00" },
    friday: { open: "08:00", close: "21:00" },
    saturday: { open: "08:00", close: "21:00" },
    sunday: { open: "08:00", close: "21:00" }
  },
  washerPrices: [
    { title: "Double loader", loadLabel: "2 LOADS", price: 5.25 },
    { title: "Triple loader", loadLabel: "3 LOADS", price: 9.00 },
    { title: "Quadruple loader", loadLabel: "4 LOADS", price: 11.25 }
  ],
  freeDryingWhenYouWashHere: true,
  // Reserved for Phase 2: a PUBLIC, sanitized data feed — NOT the private employee website URL.
  publicMachineStatusUrl: ""
};