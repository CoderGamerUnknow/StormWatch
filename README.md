# ⛈️ StormWatch — Live Weather Hazard Monitor

A **zero-backend, single-file** weather hazard monitor that runs entirely in the browser.
It fetches three global forecast models — `ecmwf_ifs025` (ECMWF), `gfs_seamless` (NOAA GFS)
and `icon_global` (DWD ICON) — in **one** request, fuses them into an on-device consensus,
classifies hazards against a latitude-aware climate baseline, and degrades *honestly* when
the network disappears instead of showing you a thunderstorm that ended an hour ago.

No build step, no server, no API key required. Optional keys (EmailJS email alerts, a
Supabase community feed) live in a **gitignored `config.local.js`**.

> **Disclaimer —** StormWatch is not an official emergency-alerting system. Treat CRITICAL
> statuses as advisory and follow your local meteorological agency for life-safety decisions.

## Overview

The thesis: the edge of the network can make safety-relevant judgments locally, if you
give it raw data and honest rules.

- **Zero backend** — consensus, classification, staleness and zone detection all run
  client-side; Open-Meteo is fetched directly.
- **Fail honest, not silent** — stale data is badged (`OFFLINE — LAST CHECKED 14:32`), and
  expired data *clears* warnings instead of freezing them.
- **Distrust any single signal** — three disagreeing models are information; a live
  precipitation reading can veto a lagging thunderstorm code.
- **Respect the battery** — ambient animation is compositor-only (`opacity`/`transform`),
  with no JS animation loops.
- **Degrade gracefully** — no GPS → clear error; no network → cache with a badge; no cache
  → neutral stale card; multi-model unsupported → single-model fallback.

## Features

**Multi-model consensus.** Temperatures and winds are averaged on-device; the weather code
takes the *most cautious* model. The collapsible panel shows the consensus values with a
per-metric **spread (max − min)** and how many models actually reported, then each model's
raw reading — so disagreement is visible rather than hidden inside an average.

**Hazard rules.** `classifyHazard()` applies a zero-precipitation override (current
precipitation of exactly `0 mm/h` hard-caps status at AMBER/CLEAR, so WMO codes 95/96/99
can't fake a storm — wind > 80 km/h is exempt), monsoon vs arid-urban baselines detected
from latitude (|lat| < 23.5°), a user zone override validated against trailing 7-day
rainfall, and hazard thresholds you can tune in Settings.

**Offline watchdog.** Network loss or a failed fetch badges the card `STALE DATA` with a
live count-up. A 30 s poll compares cache age against a 15-minute limit; expired data
clears active critical warnings and falls back to a neutral *"Offline — Data Stale"* card.
The browser `online` event force-syncs immediately. Sync cadence is adaptive: 10 min
normally, 5 min on WARNING, 2 min on CRITICAL.

**Alerting.** A sticky dismissible banner mirrors hazard state (green / amber / red) with
reduced-motion-respecting pulse, re-arming whenever status or wind changes. Email signup
delivers through the best available tier, auto-detected at send time: EmailJS REST →
browser notifications → prefilled `mailto:` draft.

**Radar & safety tools.** A collapsible [Windy.com](https://www.windy.com) radar iframe
(no key) that lazy-loads on first expand and recenters on the selected city, an
offline-available emergency checklist that persists ticked items, and saved-city chips
(localStorage, ~1 km dedupe, cap 6).

**Community reports.** A report form posts hazard type, severity and an optional 240-char
note to Supabase via PostgREST, merged into a feed with severity colour-coding and 45 s
visibility-gated polling. Without keys, reports stay on-device and are labelled *"this
device"* — same UI, zero infrastructure.

**QA harnesses.** `runTests()` runs 5 mocked-payload unit tests (zero-precip override,
extreme wind, missing fields, offline expiry, zone overrides). `runBenchmarks()` reports
rule-engine time, render time and state/cache footprint.

## How it works

```
geolocation ─► movement gate (reuse cache if moved < 1 km)
             ─► Open-Meteo (3 models, current + optional hourly)
             ─► consensus:  temp/wind = mean   code = most cautious
             ─► classifyHazard():  precip override · wind · climate zone
             ─► alert card (+ stale badge) · metric dashboard · atmosphere layer
             └► offline watchdog: localStorage cache + 15 min expiry
```

Ambient lighting is one fixed compositor layer that shifts with status (slate → amber →
slow pulse). Everything periodic — sync, countdown, watchdog — pauses on Page Visibility
and catches up on return; the progress bar is CSS-transition driven rather than JS-ticked.

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Vanilla JS (ES2020), one `index.html`, no build step |
| Weather | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) — free, key-less, multi-model |
| Geocoding | Open-Meteo Geocoding (GeoNames), free, key-less |
| Radar | Windy.com free iframe embed |
| Storage | `localStorage` + Cache Storage via the service worker |
| Offline | `sw.js`, network-first shell |
| Optional | EmailJS REST (alerts), Supabase PostgREST (community feed) |

## Getting started

Requirements: any modern browser with Geolocation.

```bash
# Option A — open it
start index.html           # Windows (open / xdg-open elsewhere)

# Option B — serve it (recommended: some browsers restrict geolocation on file://)
python3 -m http.server 8080   # → http://localhost:8080
```

Allow the location prompt on first run. The app syncs on load, then on an adaptive timer or
when you move more than 1 km; **Change Location** in the footer re-prompts GPS.

Deploy anywhere static files are served (GitHub Pages, Netlify, Cloudflare Pages) — it's
one HTML file plus `sw.js`, `manifest.json` and the icons.

### Optional keys

```bash
cp config.example.js config.local.js   # then fill in emailjs and/or supabase
```

`config.local.js` is gitignored and loaded before the app as
`window.STORMWATCH_CONFIG`. Precedence is file → saved localStorage → `null` (integration
off), and blank strings never disable a working saved value. The committed
`config.example.js` is the template.

| Key | Where from | Lock it down |
| --- | --- | --- |
| `emailjs.publicKey` + service/template IDs | [dashboard.emailjs.com](https://dashboard.emailjs.com) | Restrict **Allowed Domains** to your deployment; rate-limit the template |
| `supabase.anonKey` + project URL | Supabase → Settings → API | Enable **RLS** on `stormwatch_reports` with `select`/`insert` for `anon` only |

The anon key and EmailJS public key are public by design — there is no server to hide them.
Never put private/service-role keys, SMTP passwords or secrets in this repo. Before
pushing:

```bash
git check-ignore -v config.local.js   # must print a .gitignore rule
git status --porcelain                # config.local.js must NOT appear
```

## Benchmarks

Measured with the built-in `runBenchmarks()` harness (rule engine: 12 scenarios × 200
iterations).

| Metric | Target | Measured |
| --- | --- | --- |
| Rule-engine classification sweep | < 1 ms | ~0.03 ms |
| DOM render (card + metrics + grid + atmosphere) | < 16 ms | typically < 2 ms |
| State + cache footprint | — | ~0.5 KB |
| Network payload (3 models) | < 10 KB | compact JSON; hourly breakdown skipped in Data Saver |
| Runtime dependencies | 0 | 0 |

```js
runBenchmarks()   // rule engine ms · DOM render ms · memory KB
runTests()        // 5/5 mocked-payload unit tests
```

## Recent changes

- **Background sync actually re-fetches now** — GPS is sampled once, so the old
  movement-gate check on the timer was always false after the first cycle. The loop is a
  self-rescheduling timer.
- **Timers pause when hidden** (sync, countdown, watchdog) and catch up on return; the 1 Hz
  JS progress ticker became a CSS transition.
- **Adaptive sync** interval by hazard level, plus a **Data Saver** toggle (auto-detected
  from `navigator.connection.saveData`) that skips the per-model hourly breakdown and says
  so honestly instead of faking it.
- **Force Refresh** keeps `cache: 'no-store'`; routine syncs use normal HTTP caching.
- Added saved cities, hazard alert signup, community reports, the consensus spread row,
  the gitignored key file, and pinned the ICON leg to `icon_global`.

## License

[MIT](LICENSE) © 2026 CoderGamerUnknow · Data from [Open-Meteo](https://open-meteo.com).
