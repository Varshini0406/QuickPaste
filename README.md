# QuickPaste

A small paste-sharing app. Guests can create shareable text pastes with optional time and view limits. Users can optionally create an account to view their email and manage their display name. Paste text is rendered as text (not HTML), and the server accepts content up to 1 MB.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Paste records are stored in `data/pastes.json`; set `DATA_DIR` to use another directory. To use Neon Auth locally, set `VITE_NEON_AUTH_URL` in the environment before running `npm start`.

## Security and privacy

The app applies a restrictive Content Security Policy and browser security headers, rejects cross-origin paste API requests, requires JSON for paste creation, validates paste options, and limits paste content to 1 MB. Paste content is displayed as plain text, not executable HTML.

Links are public to anyone who has them, and content is stored unencrypted in the configured data directory. Do not use QuickPaste for passwords or other sensitive secrets.

## Deploy

QuickPaste uses Vercel Functions and Neon Postgres:

1. Import this repository into Vercel and connect a Neon Postgres database. Set `POSTGRES_URL` or `DATABASE_URL` in the Vercel project. Do not commit database credentials.
2. In Neon Console, enable Managed Better Auth for the database branch. Enable email/password sign-up and require email verification; verification codes work with Neon’s shared email provider.
3. Add `https://quickpaste-sigma.vercel.app` to Neon Auth's trusted domains.
4. Add `VITE_NEON_AUTH_URL` in Vercel using the Auth Base URL from Neon, for Production and Preview. This is the public auth endpoint, not a database password.
5. Redeploy. The app creates its paste table on the first API request.

`vercel.json` builds and serves the bundled frontend from `dist` while retaining the Node API function. The Neon Auth client stores account data in the `neon_auth` schema; paste data and view limits are stored in `pastes`. Locally, paste data uses `data/pastes.json` unless `POSTGRES_URL` or `DATABASE_URL` is set. The dark-mode preference is saved in the browser.

Accounts are optional: guests can continue creating pastes. Anyone with a paste link can read it; the view limit counts successful opens of that link. Do not use QuickPaste for passwords or other sensitive secrets.
