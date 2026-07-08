// AppSail entrypoint: Catalyst assigns the real listen port via
// X_ZOHO_CATALYST_LISTEN_PORT at runtime; Flue's built server (dist/server.mjs)
// reads PORT. Map one to the other, then hand off to the generated server —
// it does not load .env, so all config must already be in process.env
// (set via Catalyst Console -> AppSail -> Environment Variables).
process.env.PORT ||= process.env.X_ZOHO_CATALYST_LISTEN_PORT || '3000';

await import('../dist/server.mjs');
