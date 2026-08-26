# Example Prompts

## assistant

`assistant`'s tools require a real signed-in session, so `flue run` doesn't
work for it (see [Commands](commands.md)). Try these against the running dev
server instead.

Easiest: `pnpm dev` + `pnpm chat`, then type any of the prompts below into
the chat UI at `http://localhost:5173`.

Or drive it directly with curl (`ENV=local` enables the dev-login seam — no
real Zoho OAuth needed):

```bash
curl -s -c /tmp/cookies.txt "http://localhost:3583/api/auth/dev-login?userId=demo&email=demo@example.com&name=Demo"
curl -s -b /tmp/cookies.txt -X POST http://localhost:3583/agents/assistant/demo-conv-1 \
  -H "Content-Type: application/json" \
  -d '{"kind":"user","body":"fetch all open leads from Zoho CRM and summarize them"}'
```

- "fetch all open leads from Zoho CRM and summarize them"
- "get the first page of contacts from Zoho CRM and count them"
- "what is 12 * 34?"

### KB search (requires the docs knowledge base connected)

Set `DOCS_OAUTH_CLIENT_ID`/`DOCS_OAUTH_CLIENT_SECRET` in `.env` (see
[Setup](setup.md)), then connect it per-user from Settings → Connections in
the chat UI — there is no shared, deployment-wide token to configure here.

- "search zoho docs for how to create a CRM custom function"
- "list all available zoho documentation products"
- "find zoho desk SLA configuration docs"
