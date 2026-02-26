# SignFlow Pro

**Shareable links and QR codes for your Zoho Sign templates.**

Turn any Zoho Sign template into a permanent, shareable URL or QR code. Signers click the link, enter their name and email, and sign your document — no Zoho account required.

🔗 **Live:** [signflow.ink](https://signflow.ink)

## Features

- **Permanent signing links** — one URL that works forever, for unlimited signers
- **QR codes** — print-ready codes for posters, cards, and handouts
- **Branded landing pages** — your logo, colors, and company info
- **Analytics** — track visits, submissions, and conversion rates
- **5-minute setup** — connect Zoho Sign, pick a template, share

## Tech Stack

- React 19 + TypeScript + Vite
- Vercel Edge Functions (API)
- Supabase (auth, database)
- Zoho Sign API

## Development

```bash
npm install
cp .env.local.example .env.local  # Add your keys
npm run dev                        # Frontend on :5173
npm run dev:vercel                 # API on :3001
npm run dev:full                   # Both
npm test                           # Run tests
```

## Deployment

Deployed on Vercel. Push to `main` to deploy.

## License

Proprietary. All rights reserved.
