# Flightdroid

A Flighty-style map of every flight you've taken, built from the confirmation emails in your
Gmail — as a mobile web app, so it works on Android (or anything with a browser).

- **Map** of every route as great-circle arcs, airports sized by how often you've been there,
  past flights solid and upcoming ones dashed. Tap a route or airport to see its flights.
- **Flights** list grouped by year with times, durations and distances; tap for details, edit
  anything the parser got wrong, or add flights by hand.
- **Stats**: distance, hours aloft, airports, countries, airlines, longest/shortest flight, top
  routes, and how many times you've been around the Earth.
- Installable as a PWA (open it in Chrome → "Add to Home screen") and works offline once loaded.

## Privacy

There is no server. The app runs entirely in your browser: it signs in to Google with a
read-only Gmail token that is kept in memory only, reads matching emails directly from the Gmail
API, and stores the extracted flights in your browser's IndexedDB. Nothing is sent anywhere else
except map tile requests.

## How flights are found

1. Gmail is searched with a query for confirmation/itinerary/boarding-pass style subjects
   (editable under Settings → Advanced). Later syncs only read new emails.
2. Most airlines and booking sites embed [schema.org `FlightReservation`](https://developers.google.com/gmail/markup/reference/flight-reservation)
   markup (JSON-LD or microdata) — the same data Gmail uses for its trip cards. That is parsed
   first and trusted.
3. Emails without markup fall back to text heuristics (flight numbers, airport codes, dates and
   times). Those flights get a **check** badge until you review or edit them.
4. The same flight seen in several emails is merged; newer emails (schedule changes) win, and
   cancellations remove it. Flights you edit or delete are left alone by future syncs.

## Connect Gmail

Gmail access needs a free Google Cloud OAuth client ID that you own (one-time, ~5 minutes):

1. Open the [Google Cloud console](https://console.cloud.google.com/), create a project, and
   enable the **Gmail API** (APIs & Services → Library).
2. **OAuth consent screen** (Google Auth Platform → Branding/Audience): choose *External*, keep
   the app in **Testing**, and add your own Gmail address as a **test user**. Under Data Access
   add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized
   JavaScript origins* add the origin you'll use the app from, e.g.
   `https://robirahman.github.io` and `http://localhost:5173`. No redirect URIs are needed.
4. Copy the client ID into Flightdroid → Settings → Google OAuth client → Save, then tap
   **Sync Gmail**. Google will warn that the app is unverified — that's expected for your own
   testing-mode app; continue to grant read-only access.

Testing-mode tokens last an hour; just tap Sync again next time.

## Deploy to GitHub Pages

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Optional: add a repository variable `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables
   → Actions → Variables) to bake in your client ID. It isn't secret — OAuth client IDs for
   browser apps are public — but you can also just paste it into the app's Settings.
3. Push to `main`; `.github/workflows/deploy.yml` tests, builds and publishes to
   `https://<user>.github.io/flightdroid/`.

## Development

```sh
npm install
npm run dev          # http://localhost:5173/flightdroid/
npm test             # parser, geo and Gmail decoding unit tests
npm run test:e2e     # Playwright smoke test at phone size (builds first)
npm run build
```

`npm run airports` regenerates `src/data/airports.json` from
[OurAirports](https://ourairports.com/data/) (public domain) with time zones from
[mwgg/Airports](https://github.com/mwgg/Airports) (MIT). `npm run icons` re-renders the PWA icons.
Map tiles: Esri World Gray Canvas (© Esri, HERE, Garmin, © OpenStreetMap contributors).
