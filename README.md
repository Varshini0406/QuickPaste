# QuickPaste

A small, account-free paste-sharing app. Create a text paste, copy its link, and optionally expire it after a set time or number of views. Paste text is rendered as text (not HTML), and the server accepts content up to 1 MB.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Paste records are stored in `data/pastes.json`; set `DATA_DIR` to use another directory. The store is created on first launch.

## Security and privacy

The app applies a restrictive Content Security Policy and browser security headers, rejects cross-origin paste API requests, requires JSON for paste creation, validates paste options, and limits paste content to 1 MB. Paste content is displayed as plain text, not executable HTML.

Links are public to anyone who has them, and content is stored unencrypted in the configured data directory. Do not use QuickPaste for passwords or other sensitive secrets.

## Deploy

QuickPaste can run on Vercel with Neon Postgres:

1. Import this repository into Vercel and create a Neon Postgres database.
2. Add the database connection string as the `POSTGRES_URL` environment variable in the Vercel project. Do not commit the connection string.
3. Deploy the project. The app creates its `pastes` table automatically on the first API request; the database role must be allowed to create tables.

The Vercel API uses Postgres so paste data and view limits are shared and durable across function instances. If `POSTGRES_URL` is missing on Vercel, API requests return a configuration error rather than writing to ephemeral storage. For local development, the app continues to use `data/pastes.json` unless `POSTGRES_URL` or `DATABASE_URL` is set.

The app has no user accounts or paste-management screen. Anyone with a paste link can read it; the view limit counts successful opens of that link.
