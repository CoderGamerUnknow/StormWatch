# ⛈️ StormWatch — Live Weather Hazard Monitor

A **zero-backend, single-file** weather hazard monitor that runs entirely in the browser. It fetches three independent global forecast models **simultaneously** in one request — `ecmwf_ifs025` (ECMWF IFS 0.25°), `gfs_seamless` (NOAA GFS) and `icon_global` (DWD ICON) — fuses them into an on-device consensus, classifies hazard levels against a latitude-aware climate baseline, and degrades *honestly* when the network disappears — instead of silently showing you a thunderstorm that ended an hour ago.

No build step. No server. No API key **required** — Open-Meteo is free and key-less. Optional keys (EmailJS alert email, Supabase community feed) live in a **gitignored `config.local.js`** that never enters version control (see [Locking up your keys](#6-locking-up-your-keys-configlocaljs)).

---

## 1. Project Overview & Philosophy — *Zero-API Edge Intelligence*

StormWatch follows a simple thesis: **the edge of the network (your phone, your browser) is capable of making safety-relevant judgments locally, if you give it the raw data and honest rules.**

The principles that fall out of that thesis:

| Principle | What it means in practice |
|---|---|
| **Zero backend** | All logic — consensus, classification, staleness tracking, zone detection — runs client-side. Open-Meteo is fetched directly; nothing is proxied, stored, or computed server-side. |
| **Fail honest, not silent** | A stale or offline app must never look like a live app. Offline states are badged (`OFFLINE — LAST CHECKED 14:32`), and expired data **clears** hazard warnings rather than freezing them. |
| **Distrust any single signal** | A WMO grid code can lag reality by an hour. Three models disagreeing is information; averaging them is the forecast. Ground-truth signals (live precipitation rate) can veto stale signals (thunderstorm codes). |
| **Respect the battery** | All ambient animation is compositor-only (`opacity` / `transform`). No JS animation loops. No layout thrash. |
| **Degrade gracefully** | No GPS → clear error. No network → cache with a badge. No cache → neutral stale card. Multi-model unsupported → legacy single-model fallback. |

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          index.html (single file)                    │
│                                                                      │
│  ┌────────────────┐   coords    ┌─────────────────────────────────┐  │
│  │  Geolocation   ├────────────►│   MOVEMENT GATE                 │  │
│  │  (navigator)   │             │   Haversine > 1 km? else re-run │  │
│  └────────────────┘             │   rules on cached STATE         │  │
│                                 └───────────────┬─────────────────┘  │
│                                                 │ fetch (no-store)   │
│                                                 ▼                    │
│                     ┌───────────────────────────────────┐            │
│   Open-Meteo API ──►│  FETCH LAYER                      │            │
│   ecmwf_ifs025 ·    │  current=is_day,precipitation,    │            │
│   gfs_seamless ·    │  rain,showers,weather_code +      │            │
│   icon_global       │  temperature/wind per model       │            │
│                     └───────┬───────────────────────────┘            │
│                             │ payload                                │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  CONSENSUS ENGINE (on-device)                                │    │
│  │  temp = mean(models)   wind = mean(models)                   │    │
│  │  code = max(models)  ← most cautious                         │    │
│  │  precip = current.precipitation  (live gauge wins over       │    │
│  │           hourly grid series — fixes forecast lag)           │    │
│  └───────┬──────────────────────────────────────────────────────┘    │
│          │                                                           │
│          ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  RULE ENGINE — classifyHazard()                              │    │
│  │  • ZERO-PRECIP OVERRIDE: precipitation === 0 mm/h hard-caps  │    │
│  │    status to AMBER/CLEAR, vetoing lagging storm codes 95-99  │    │
│  │  • wind > 80 km/h           → CRITICAL (always)              │    │
│  │  • monsoon baseline (|lat|<23.5°): rain 61-65 → AMBER max    │    │
│  │  • arid baseline: heavy rain / ≥15 mm/hr → CRITICAL          │    │
│  │  • user zone override w/ 7-day rainfall sanity check         │    │
│  └───────┬──────────────────────────────────────────────────────┘    │
│          │ status: CLEAR | WARNING | CRITICAL                        │
│          ▼                                                           │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ ALERT CARD     │  │ METRIC DASHBOARD │  │ ATMOSPHERE LAYER      │ │
│  │ + stale badge  │  │ + model panel    │  │ GPU-only lighting:    │ │
│  │ + Share (API)  │  │ + WMO grid       │  │ slate / amber / pulse │ │
│  └────────────────┘  └──────────────────┘  └───────────────────────┘ │
│                                                                      │
│  ┌──────────────────────── OFFLINE WATCHDOG ─────────────────────┐   │
│  │ online/offline events • 30 s staleness poll                   │   │
│  │ fetch fail → STALE badge + OFFLINE — LAST CHECKED [timestamp] │   │
│  │ cache age > 15 min → CLEAR all critical warnings,             │   │
│  │                      card → neutral "Offline — Data Stale"    │   │
│  │ localStorage cache (stormwatch_cache_v1)                      │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  console APIs:  runTests() · runBenchmarks()                         │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Core Features

### Saved cities (LocalStorage quick access)
Every city a user searches is remembered on-device (localStorage, newest first, deduped within ~1 km) and rendered as tappable chips under the search bar. Tapping a chip loads that city through the exact same `applyCitySelection()` pipeline as a fresh search; the × removes it. Caps at 6 cities; degrades silently when storage is unavailable.

### Hazard alert signup (EmailJS-ready, zero-backend fallbacks)
A signup panel collects an email and arms alerts through the best available delivery tier, auto-detected at send time:
1. **EmailJS REST** — if credentials are present (preferred: `{serviceId, templateId, publicKey}` in the gitignored `config.local.js`; alternatively `stormwatch_alerts_emailjs_v1` in localStorage), alerts are delivered as real email (SMS gateways reachable via EmailJS service integrations).
2. **Browser notifications** — when Notification permission is granted, hazard alerts fire locally while the tab is open (free, no account).
3. **mailto: draft** — honest last-resort fallback that opens a prefilled email draft.

The signup persists locally so the form survives reloads with no server round-trip.

### Community hazard reports & live feed
A report form (hazard type, severity, optional 240-char note) posts to a **Supabase** table via its PostgREST interface and a live feed section renders all reports with severity colour-coding, location labels and relative timestamps, polling every 45 s (visibility-gated). Two modes, auto-detected:
- **Cloud mode** — put your `{url, anonKey, table}` in `config.local.js` (preferred; see [Locking up your keys](#6-locking-up-your-keys-configlocaljs)) or set `stormwatch_community_db_v1` in localStorage, and create the table with the SQL in `index.html` (public read + insert policies). Reports sync to the cloud and merge into the feed.
- **Local mode (default)** — no config needed: reports stay in localStorage, labelled honestly as *"this device"* in the feed. Same UI, zero infrastructure.

### Client-side multi-model consensus
Three global grids are requested **simultaneously in a single Open-Meteo request** (`models=ecmwf_ifs025,gfs_seamless,icon_global` — one HTTP round-trip, no sequential fan-out) for any searched city worldwide. Temperatures and winds are averaged **on-device** into the consensus values the dashboard uses, while the weather code takes the *most cautious* value across models. The collapsible **Multi-Model Consensus** panel shows: a summary row (consensus temp/wind with per-metric **spread = max − min**, and an honest "avg of N models" count reflecting how many actually reported), followed by each model's raw reading — so disagreement is visible rather than hidden inside an average.

### Interactive radar & storm map
A collapsible panel embedding the free **Windy.com radar iframe** (no API key): drag & zoom to track storm movement across rain, clouds, thunder and wind layers. The map re-centers automatically on the selected city or GPS fix, lazy-loads only on first expand (no iframe cost until asked for), shows a skeleton shimmer while loading, and is suppressed with an honest overlay in Data Saver mode.

### Emergency alert banner
A **sticky, dismissible banner** pinned to the top of the page that reflects the live hazard state: green (all clear), amber (moderate hazard or wind above your threshold), or red (severe hazard — storm codes, wind > 80 km/h, heavy rain), with reduced-motion-respecting pulse animations for amber/red. Thresholds are **user-configurable** in Settings (wind km/h, precipitation mm/h, and whether advisories show amber or full red); the banner re-arms automatically whenever the hazard state or wind speed changes.

### Emergency safety checklist
A collapsible, tap-to-complete checklist covering thunderstorms, power outages, extreme wind and emergency-kit essentials. Completed items persist in localStorage across reloads and strike through as done — practical guidance that is available even fully offline (cached app shell).

### Offline watchdog (stale-state lock prevention)
- **Immediate badge:** on network loss or fetch failure, the alert card gets an `OFFLINE — LAST CHECKED [TIMESTAMP]` / `STALE DATA` badge with a live count-up.
- **15-minute expiration:** a 30-second watchdog compares cache age against a 15-minute threshold. Expired data **clears active critical warnings** and transitions the card to a neutral *"Offline — Data Stale"* state — the app never advertises a thunderstorm it can no longer see.
- **Instant recovery:** the browser `online` event triggers an immediate force-sync.

### Zero-precipitation override (weather-code lag fix)
Open-Meteo's hourly grid can lag a real-time clearing event (rain stops, the storm code doesn't). StormWatch requests live `current=…,precipitation,rain,showers,…` fields and applies a hard rule:

> **If current precipitation is exactly `0 mm/h`, the status is capped at AMBER or CLEAR — a lagging WMO thunderstorm code (95/96/99) cannot produce a CRITICAL alert.**

Wind hazards (>80 km/h) are exempt: a windstorm doesn't care whether it's raining. A manual **Force Refresh** button clears the response cache (`cache: 'no-store'`) and hits the live network for users who just watched the sky clear.

### Climate-zone intelligence
Tropical rain is seasonal-normal; the same rainfall in an arid zone is a flash-flood emergency. StormWatch auto-detects the baseline from latitude (|lat| < 23.5°), lets the user override it (Auto / Monsoon / Arid-Urban), and validates an "Arid" override against the trailing 7-day rainfall total — rejecting the override if the location is factually wet.

### Dynamic atmosphere lighting
A single fixed compositor layer shifts the entire page's ambient light with the hazard status: deep-slate glow when CLEAR, a subtle amber highlight when WARNING, and a slow low-intensity pulse when CRITICAL. **All animation is `opacity`/`transform` only** — no repaint, no layout, battery-friendly. Light/dark color schemes are both handled.

### Built-in QA & benchmark harnesses
- `runTests()` — 5 unit tests with mocked Open-Meteo payloads (zero-precip override, extreme wind, missing fields, offline expiry, zone overrides) printed as a clean console table.
- `runBenchmarks()` — rule-engine execution time, DOM render time, and estimated state/cache memory.

## 4. Setup & Installation

**Requirements:** any modern browser with Geolocation. Nothing else.

```bash
# Option A — just open it
open index.html            # macOS
start index.html          # Windows
xdg-open index.html       # Linux

# Option B — serve it (recommended; some browsers restrict geolocation on file://)
python3 -m http.server 8080
# → http://localhost:8080
```

**Optional — unlock EmailJS alerts & the Supabase community feed** (the app runs fully without this):

```bash
cp config.example.js config.local.js   # then edit config.local.js with your keys
```

`config.local.js` is **gitignored** — it will never be committed or pushed. Leaving keys as `null` keeps the zero-backend defaults. See [Locking up your keys](#6-locking-up-your-keys-configlocaljs) below.

Deploy anywhere static files are served (GitHub Pages, Netlify, Cloudflare Pages — the whole app is one file):

```bash
git init && git add index.html sw.js manifest.json README.md && git commit -m "StormWatch"
git push origin main       # then enable Pages / drag-drop the folder
```

**First run:** allow the location prompt. The app acquires GPS, syncs, and re-syncs every 5 minutes or when you move >1 km. "Change Location" in the footer re-prompts GPS.

## 5. Performance Benchmarks

Design targets and measured results (measured via the built-in `runBenchmarks()` harness; rule-engine figure from a 12-scenario × 200-iteration Node/Chrome-class run):

| Metric | Target | Measured |
|---|---|---|
| Rule-engine execution (full classification sweep) | **< 1 ms** | **~0.03 ms** |
| DOM render (alert card + metrics + WMO grid + atmosphere) | < 16 ms (1 frame) | typically < 2 ms (after first successful sync) |
| App state + persisted cache footprint | — | ~0.5 KB (grows only with model breakdown) |
| Network payload (Open-Meteo, 3 models, 2 h horizon) | **< 10 KB** | compact JSON; `current` fields always included, `hourly` model breakdown optional (Data Saver mode skips it) |
| Runtime dependencies | 0 | 0 — no framework, no CDN, no build |
| Ambient animation cost | compositor-only | `opacity`/`transform` keyframes only |

Reproduce any time in the browser console:

```js
runBenchmarks()   // ⚡ grouped report: rule engine ms · DOM render ms · memory KB
runTests()        // 🧪 5/5 mocked-payload unit tests
```

---

**Data source:** [Open-Meteo](https://open-meteo.com) — free, no account, no API key. StormWatch is not an official emergency-alerting system; treat CRITICAL statuses as advisory and follow your local meteorological agency for life-safety decisions.

---

## 6. Locking up your keys (config.local.js)

All optional credentials live in **one gitignored file**: `config.local.js`. It is loaded by `index.html` via a `<script src>` tag *before* the main script and read through `window.STORMWATCH_CONFIG`. The committed `config.example.js` is the placeholder template.

```bash
cp config.example.js config.local.js
# edit config.local.js → fill in emailjs and/or supabase keys
```

**How the lock works**

| Layer | Protection |
|---|---|
| `.gitignore` | `config.local.js` is listed explicitly — `git add .` / `git commit -a` can never pick it up. Verify any time with `git check-ignore -v config.local.js` (prints the matching rule) or `git status --ignored`. |
| File absence | No file? The `<script onerror>` handler sets `window.STORMWATCH_CONFIG = null` and the app runs 100% key-less. |
| Precedence | `config.local.js` value → previously-saved localStorage value → `null` (integration off). Blank strings in the file never disable a working saved value. |
| Runtime | Only values present in the file are ever mirrored into localStorage (keys `stormwatch_alerts_emailjs_v1` / `stormwatch_community_db_v1`) so the optional readers see one consistent source. |
| Service worker | `config.local.js` is fetched **network-first** — edited keys reach the client without a cache-version bump, and a 404 is never cached. |

**⚠️ What must NEVER go in the file (or anywhere in this repo):** private keys, secret API keys, service-role keys, SMTP passwords. There is no server here to hide them in — everything in a front-end file is readable by the browser.

**What goes in the file is safe-by-design to ship to a browser, but lock it down at the provider:**

| Key | Where from | How to lock it down |
|---|---|---|
| `emailjs.publicKey` (+ service/template IDs) | [dashboard.emailjs.com](https://dashboard.emailjs.com) → Account → API keys | Add your deployment domain to **Allowed Domains** in the EmailJS dashboard so only your site can call it; rate-limit the template. |
| `supabase.anonKey` (+ project URL) | Supabase → Project Settings → API | The anon key is public by design — the real lock is **Row Level Security**: enable RLS on `stormwatch_reports` and add only `select`/`insert` policies for `anon`. Never grant `update`/`delete` to anon. |

If a key ever leaks: rotate it at the provider (EmailJS: reset public key; Supabase: rotate JWT secret / anon key), and it was never in git history to begin with because the file is ignored.

**Pre-flight check before pushing to GitHub:**

```bash
git check-ignore -v config.local.js   # must print a .gitignore rule
git status --porcelain                # config.local.js must NOT appear
```

---

## 7. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Vanilla JS (ES2020), single `index.html` | Zero build step, zero dependencies, loads instantly from any static host |
| Weather data | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Free, key-less, multi-model: `ecmwf_ifs025` + `gfs_seamless` + `icon_global` in one request |
| Geocoding | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | Worldwide city search (GeoNames), free, key-less |
| Radar map | Windy.com free iframe embed | Interactive global radar with no API key |
| Storage | `localStorage` + Cache Storage (via SW) | Saved cities, checklist, offline weather cache, app shell — all on-device |
| Offline | Service worker (`sw.js`), network-first shell | Fresh deploys reach users; cached shell covers offline |
| Alert email (optional) | EmailJS REST API | Server-less transactional email from the browser |
| Community DB (optional) | Supabase (PostgREST) | Hosted Postgres with RLS; anon read/insert only |
| Security | Gitignored `config.local.js` + `window.STORMWATCH_CONFIG` | Secrets never committed; precedence file → localStorage → disabled |

---

## 8. Changelog — Community & Consensus Pass

**New features**
- **Saved Cities** — searched locations persist as quick-access chips (LocalStorage, ~1 km dedupe, newest first, cap 6).
- **Hazard Alert Signup** — EmailJS-ready email form with browser-notification and mailto: fallbacks; delivery tier auto-detected at send time.
- **Community Hazard Reports** — Supabase-ready report form + live community feed (45 s polling, severity colour-coding); localStorage fallback keeps it fully functional with zero backend.
- **Consensus summary row** — the multi-model panel now leads with the averaged temperature/wind the dashboard uses, plus per-metric **spread (max − min)** across ECMWF/GFS/ICON so model disagreement is quantified at a glance.
- **Locked secrets file** — optional keys moved into a gitignored `config.local.js` (template: `config.example.js`); the app still runs 100% key-less without it.
- **Model set pinned to `icon_global`** — the ICON leg now requests DWD's explicit global model instead of the `icon_seamless` regional blend (`ecmwf_ifs025,gfs_seamless,icon_global`), per spec.

---

## 9. Changelog — Battery & Data Pass

A round of fixes and features aimed specifically at not draining the phone it's running on:

**Bug fixes**
- **Background sync was silently never re-fetching.** GPS is sampled once (not watched continuously), so the old movement-gate check on the periodic timer was always false after the first cycle — the "auto resync every 5 minutes" claim wasn't actually happening; the app just re-ran the rule engine on the same stale numbers. The sync loop is now a self-rescheduling timer that always fetches on schedule.
- **The sync status/icon got stuck on "Fetching…"** forever after the first successful sync (and again after an offline-with-cache error) because nothing ever reset it back to "synced". Fixed.

**Battery**
- Replaced the always-on 1Hz countdown + 200ms (5Hz) progress-bar JS timers — which never paused, even with the tab hidden or the screen off — with a single 1Hz countdown and a CSS-transition-driven progress bar that needs no JS ticking at all.
- Added Page Visibility handling: every periodic timer (sync, countdown, staleness watchdog) now pauses completely while the tab/screen is hidden, and either resumes in place or fires one immediate catch-up sync when you look at it again.
- Sync cadence is now **adaptive**: 10 min when conditions are normal, 5 min once something's brewing (WARNING), 2 min under an active CRITICAL — instead of a flat 5 minutes regardless of what's actually happening.
- The CRITICAL pulse animation now respects `prefers-reduced-motion`, falling back to a static high-alert tint.
- Trimmed the heaviest `backdrop-filter: blur()` (14px → 10px on the primary alert card) for a lighter compositor/GPU load, especially on mid/low-end mobile devices.

**Data**
- New **Data Saver** toggle (Settings, or auto-detected from the browser's own Data Saver / `navigator.connection.saveData` setting): widens every sync interval further and skips the per-model hourly breakdown fetch entirely, requesting only current-conditions fields. The model panel shows an honest "skipped in Data Saver mode" notice rather than faking a breakdown from repeated current values.
- `cache: 'no-store'` is now reserved for the explicit **Force Refresh** button. Routine background syncs use normal HTTP caching instead of forcing a full bypass on every single check.

