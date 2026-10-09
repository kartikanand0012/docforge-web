# DocForge web

The web app for [DocForge](https://github.com/kartikanand0012/docforge): review queue, document view
(the page with a box wherever a value was read, corrections, signing), chat with quotes, search,
documents, upload, knowledge bases, AI agents, webhooks, audit log, unanswered questions and evals.

Built from the Claude Design handoff in `design/` (README, tokens, prototype) on the backend contract
in `design/reference/` (the handover and OpenAPI). Next.js 16, React 19, plain CSS with the design's
tokens (`src/app/globals.css`), lucide-react.

## Run

```sh
npm install
DOCFORGE_API_URL=http://127.0.0.1:8000 npm run dev   # the API from the docforge repo (make api)
```

Against the demo stack (`docforge/.deploytest`, https://localhost), trust Caddy's local authority:

```sh
docker compose -f ../docforge/.deploytest/compose.yml exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > /tmp/caddy-root.crt
DOCFORGE_API_URL=https://localhost NODE_EXTRA_CA_CERTS=/tmp/caddy-root.crt npm run dev -- -p 3100
```

## How it talks to the API

The browser only ever calls this app (`/api/v1/...`). The route handler adds `Authorization:
Bearer` from the HttpOnly `df_session` cookie, so page scripts never see a token
(`src/app/api/v1/[...path]/route.ts`, `src/app/api/session/route.ts`). `src/proxy.ts` sends a page
without a session to `/login`; every API call is still checked by the API.

## Checks

```sh
npm run check   # typecheck, lint, unit tests, production build
```

Tests are written first (a RED commit, then GREEN). Pure logic lives in `src/lib/` with tests in
`tests/unit/`.
