# CI/CD setup

Two workflows were added:

- **`.github/workflows/ci.yml`** — runs on every push to `main` and every pull request:
  lint → type-check → build, plus Playwright e2e tests in parallel. PRs only run this;
  nothing is deployed from a PR.
- **`.github/workflows/deploy.yml`** — triggers automatically once `CI` finishes
  successfully on `main`, and runs two jobs in parallel:
  - `deploy-vercel`: production deploy via the Vercel CLI
  - `docker-build-push`: builds the existing `Dockerfile` and pushes to
    GitHub Container Registry as `ghcr.io/<owner>/<repo>:latest` and `:<short-sha>`

## Required GitHub secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Run `vercel link` locally once, then read `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Same file, `.vercel/project.json` |

`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are read by `vercel pull` via the standard
`.vercel/project.json` file it creates — you can also export them as repo
**variables** (not secrets) named the same way if you'd rather not run `vercel link`
locally; the Vercel CLI picks up `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from the
environment automatically.

No secret is needed for the Docker push — it uses the automatically-provided
`GITHUB_TOKEN`, scoped to `packages: write` in the workflow.

## Optional: Sentry source maps in CI

If you want release source maps uploaded during the Vercel build, also add
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` as secrets and reference
them as build-time env vars in `vercel.json` or your Vercel project settings —
the CI workflow itself doesn't need to touch these since Vercel injects them.

## First-time local setup (only needed once, to link the Vercel project)

```bash
npm install --global vercel
vercel link
cat .vercel/project.json   # copy orgId / projectId into the secrets above
```

## Making the GHCR image public (optional)

By default a pushed package is private. To make `ghcr.io/<owner>/<repo>` pullable
without auth: go to the package page on GitHub → Package settings → Change visibility.
