# W Medical — CKD Screening

Static single-page web app for urine-dipstick CKD screening at W Medical Hospital.
Hosted on GitHub Pages. Data is persisted in a Firebase Realtime Database.

## ⚠️ Security & deployment requirements

This app stores Protected Health Information (ชื่อ, เลขบัตร ปชช., เบอร์โทร,
โรคประจำตัว, BP, ผล dipstick). Before the app is used with real patients the
following checklist MUST be completed by the admin running the Firebase
project. The client code alone cannot enforce these.

### 1. Firebase Security Rules (REQUIRED)

With the default "test mode" rules, every patient record in the database is
world-readable and world-writable. Replace the rules of the realtime database
with the minimum below (or stricter):

```json
{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null",
    "records_v2": {
      "$rid": {
        ".validate": "newData.hasChildren(['id','createdAt','prot','glc'])"
      }
    }
  }
}
```

Then set up at least one Firebase Authentication identity (e.g. email/password
for each nurse, or Google Workspace SSO) and distribute per-user credentials.
Users sign in through the Firebase Auth JS SDK (outside the scope of this
bare-static app), obtain an ID token, and paste it into `localStorage` under
the key `ckd_fb_auth_token`. Every REST call from the app automatically appends
`?auth=<token>` so the rules can reject unauthenticated requests.

### 2. Anthropic API key handling

The AI Scan feature calls the Claude Vision API directly from the browser.
Shipping an API key to every kiosk is **not safe for production**:

- Any XSS or malicious browser extension on a staff device can exfiltrate it.
- Anyone who opens DevTools can read it.

The fix is to proxy the request through a tiny backend (Cloudflare Worker,
Vercel Function, or Firebase Function) that holds the key server-side and
authenticates the caller with a short-lived staff token. Until then:

- The app defaults to `sessionStorage` (cleared when the tab closes).
- The "persistent" checkbox opts into `localStorage` at the user's own risk.
- The key is never displayed; only its length is shown.

### 3. PIN lock

- Stored as PBKDF2-SHA256 with 200 000 iterations and a 128-bit random salt.
- Five consecutive wrong attempts trigger an escalating lockout (15s → 5min).
- Any legacy `ckd_pin_h` value from the previous (djb2) hashing scheme is
  deleted on first load; staff must re-enter a PIN.

The PIN gate is a local defence-in-depth measure only; authentication against
Firebase is still the source of truth.

## Data flow

- **Registration** and **Records** are stored under `records_v2/<id>` in
  Firebase Realtime Database (one path per record — writes are atomic and do
  not race).
- **Audit log** of AI scans is stored under `ckd_audit_wmedical` (last 500).
- **AI Scan** sends the compressed photo (jpeg, ≤1200 px wide) to
  `api.anthropic.com` only; the image is not persisted locally or remotely.

## Files

- `index.html` — the entire SPA.
- `manifest.json` / `icon-*.png` — PWA metadata (currently unused at runtime;
  kept for a future installable build).
- `README.md` — this file.

## Threats addressed in this revision

| Class                              | Mitigation                                              |
|------------------------------------|---------------------------------------------------------|
| XSS via record fields              | `h` tagged template auto-escapes every interpolation    |
| XSS via AI response                | Response is schema-validated and flag whitelist applied |
| CSV formula injection              | Cells starting with `= + - @ \t \r` get a `'` prefix    |
| Record ID collision                | `crypto.randomUUID()` + separate `createdAt` field      |
| Array-level write race             | Per-record Firebase paths + PATCH for status updates    |
| Weak PIN hash                      | PBKDF2-SHA256/200k + salt + lockout                     |
| Plaintext API key display          | Length-only badge; session-only default storage         |
| Popup blocker null deref           | `window.open()` result is checked on every print flow   |
| PWA cache staleness                | Old service-worker registrations are unregistered       |

## Threats NOT fixed in the client

These need server-side / Firebase Console action:

- Authenticating Firebase reads/writes (Security Rules above).
- Preventing brute-force of staff credentials (Firebase Auth lockout policy).
- Proxying the Anthropic API key (requires a backend).
- Preventing offline PIN brute-force by someone with physical access to a
  device (requires hardware-backed secure enclave).
