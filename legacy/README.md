# Legacy — Pre-Migration Express Server

`server.js` is the original Node.js/Express backend for the OSB platform,
deployed on Railway until the 2025 infrastructure migration.

**It is not deployed and is not executed by anything in this repository.**

## What replaced it

The API now runs as a Supabase Edge Function (`osb-api`). The frontend
reaches it exclusively through `osb-fetch.js`. The static site is served by
Cloudflare Workers as assets only — `wrangler.toml` defines no `main`, so no
Node code executes at the edge.

## Why it is retained

Reference implementation for the Edge Function: endpoint contracts, admin
auth middleware, rate limiting, and circuit-breaker behaviour.

## Do not reinstate as-is

The original `package.json` and lockfile were removed deliberately. They
pinned dependency versions carrying known CVEs. Any revival of this server
must start from a fresh dependency install against current versions.
