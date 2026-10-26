# I-240 Coin-Op Laundry — Customer Website (launch starter)

A small, responsive static website for the I-240 store. No build tools, npm install, user accounts, backend, or employee data required. It can be hosted on GitHub Pages or any basic static-web host.

## What's in version 1

- **WASH HERE. DRY FREE.** promotion, explicitly conditional on washing in-store
- Double-loader wash: **$5.25**
- Triple-loader wash: **$9.00**
- Quadruple-loader wash: **$11.25**
- Washer type/size overview and dryer information
- Store hours, confirmed street address, Google Maps directions link, and tap-to-call store/manager numbers
- Mobile and desktop layouts, accessibility-focused markup, no third-party runtime dependencies

## Confirmed store hours & contact — updated October 26, 2026

The store provided a photograph of its posted **I-240 LAUNDROMAT Store Hours & Last Load Times** sign:

| Rule | Posted time |
| --- | --- |
| Open every day | **8:00 AM** |
| Last wash load | **7:30 PM** |
| Last paid dryer load | **8:00 PM** |
| Everybody out by (closing) | **9:00 PM** |
| Manager phone if the store is not open | **405-618-1416** |

The sign says **last paid dryer load**. Keep this distinct from the separately confirmed offer of **free drying when you wash here**. Don't silently change the sign's terminology.

`site-config.js` contains the complete seven-day **8:00 AM–9:00 PM** schedule, the three closing deadlines and the manager contact number. The hours panel and hero badge read this public configuration, with matching HTML fallback content. The site does not claim to know whether the store is open *right now* or whether a machine is currently available.

## Confirmed address, directions & customer phone — updated October 26, 2026

The store owner explicitly supplied these customer-facing details:

- **Address:** 7700 S Douglas Ave, Oklahoma City, OK 73139
- **Google Maps place link:** https://maps.app.goo.gl/kz5DJzgJ6n3pVNNr9
- **Main store phone:** 405-631-0466
- **Manager phone (posted sign, for failure to open):** 405-618-1416

The website displays the main store phone next to the address and links it with `tel:+14056310466`. The Google Maps directions button uses the precise place link provided by the owner, with an address-search fallback if that link is cleared. The manager phone remains in the hours section under its specific after-hours instruction; do not confuse the two numbers.

## Still needed before publication

1. Choose the customer-site hosting location and verify its public URL. Use a separate public repository, not the employee website/repository.
2. Review the updated local `index.html` and test on desktop and phone.
3. Reconfirm any special holiday schedule or exceptions before posting them.

If prices or hours change later, update `site-config.js` and redeploy the customer site.


## Deploy with GitHub Pages (example)

1. Create a *new public repository* just for this customer site. Do not reuse or expose the private employee app repository.
2. Upload the contents of this folder **at the repository root** (`index.html`, `site-config.js`, and `assets/`).
3. In GitHub repository Settings → Pages, choose **Deploy from a branch**, branch **main**, folder **/(root)**.
4. After GitHub confirms the published URL, visit it on desktop and phone. Configure a custom domain later if desired.

The files themselves do not publish a website. Publishing requires a hosting account and confirmed destination/domain.

## Connecting to your existing employee website — safe next phase

The customer site and employee site must remain **separate security surfaces**. Do not point the browser at employee-only data files, admin endpoints, secrets, internal CSVs, time records, or cash-register APIs.

**Safe target architecture:**

`CoinOp OS / employee backend → explicit public-data exporter or read-only API → public JSON feed → customer site`

The future API/export should contain only owner-approved fields, for example:

```json
{
  "storeId": "i240",
  "updatedAt": "2026-10-22T08:00:00-05:00",
  "machines": {
    "doubleLoad": { "total": 8, "available": null },
    "tripleLoad": { "total": 4, "available": null },
    "quadrupleLoad": { "total": 2, "available": null },
    "dryers": { "total": 10, "available": null }
  }
}
```

**Those quantities are illustrative placeholders only and are not connected to your machines.** Real-time availability cannot be inferred from the number of machines or from employee schedules. It needs reliable live machine telemetry or a clearly labeled manual update process. Never show example values as real counts.

The site config reserves `publicMachineStatusUrl` for a later, approved integration, but there is deliberately **no live machine-availability claim**. Attendant status uses a separate sanitized publication step; it does not mean washers or dryers are live-connected.

## What to avoid

- Don't host employee credentials or operational data in a public GitHub repository.
- Don't include `Transactions.csv`, `PayrollTimeLog.csv`, `Employees.txt`, `CurrentStore.txt`, or manager passcodes.
- Don't blend Britton and I-240 data; `i240` is the internal store key.
- Don't mark machines **available now** without a reliable and fresh data source.

## Files

- `index.html`: page structure, wording, SEO metadata
- `assets/styles.css`: site styling and responsiveness
- `assets/site.js`: safe rendering of config values
- `site-config.js`: owner-editable public business information
- `assets/favicon.svg`: simple vector icon

© I-240 Coin-Op Laundry. Public customer site hosted on GitHub Pages.

## Who's on duty — sanitized customer feed

This project includes a customer-facing attendant card and a scheduled GitHub Actions
publisher. **Activate it by changing GitHub Settings → Pages → Source from
"Deploy from a branch" to "GitHub Actions".** The feature is not verified
live until the first Pages workflow run deploys successfully.

- `scripts/build_public_attendant.py` reads the existing CoinOp scheduling API **in the GitHub runner**, not in visitors' browsers.
- Only the store key, status, approved first-name display, and time checked are written to `dist/data/attendant.json`.
- The exporter requires a worker in the current I-240 shift with `IsOpen: true`, a valid clock-in, and a blank `EndSource`. The API's `ClockOutTime` can be a moving elapsed-hours placeholder and is **not** proof of clock-out.
- A scheduled person is never labeled on duty solely because of `DefaultEmployee`.
- The browser reads only the sanitized file and switches to a neutral message when it is older than 30 minutes or unavailable.
- The workflow schedules refreshes about every 10 minutes, but GitHub Actions is not guaranteed to run precisely on schedule. Pages may take additional time to update.
- Offline tests cover confirmed, unconfirmed, closed, unavailable, and first-name-only cases.

The source API must be reachable from GitHub-hosted runners. If it becomes
authentication-protected, replace the anonymous source with a dedicated
read-only integration; never put portal credentials in `site-config.js` or public JS.
GitHub may disable recurring workflows in inactive public repositories after
60 days without repository activity; check workflow status or replace this
starter with a durable, sanitized portal endpoint for longer-term operation.

### Activation and verification

1. Open `https://github.com/Skinny-Pinks/i240-coinop-laundry/settings/pages`.
2. In **Build and deployment**, select **GitHub Actions** as Source.
3. Open **Actions → Refresh I-240 customer website**, run the workflow,
   and inspect its result. On failure, do not switch to publishing payroll data.
4. Check `https://skinny-pinks.github.io/i240-coinop-laundry/data/attendant.json`.
   It must contain **only** `version`, `store`, `status`, `attendants`, and
   `checkedAt`. Actual names appear only when clock-in is confirmed.



## Publishing source switch verification

On October 26, 2026, the owner confirmed GitHub Pages **Source: GitHub Actions**.
This commit is a controlled new publish trigger so that the custom `Refresh I-240 customer website`
workflow, instead of the former branch-based Pages builder, publishes the public
`data/attendant.json` file. Verify the actual public endpoint after deployment.
