# Contributing to OptiQra

Thank you for your interest in contributing to OptiQra! All forms of contributions are welcome. If you think OptiQra is missing something you could reach out to me to develop it or you could develop it yourself! If you don't know what to work on, you could also go and work on the next features (see the roadmap in [README.md](README.md)) or work on an issue in the issues page.

## Getting set up

```bash
git clone https://github.com/armin5872/OptiQra.git
cd OptiQra
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are required to run the app or its audits — see the "Environment variables" section in [README.md](README.md) if you want to wire up Sentry locally.

## Before opening a PR

```bash
npm run lint        # ESLint
npm run type-check  # TypeScript, check-only
npm test            # Playwright e2e suite
npm run build       # Make sure it still builds
```

Please keep the audit output shape consistent (see `src/lib/reportExport/model.ts`) if you touch anything under `src/lib`.

## Pull Requests

After you have fixed an issue or refactored the code or added something go ahead and create a pull request and I will go and sync it with the original.

## Security issues

If you find any security issues please refer to [SECURITY.md](./SECURITY.md)