# Example Prompts

## main

```bash
pnpm exec flue run main --input '{"message":"fetch all open leads from Zoho CRM and summarize them"}'
pnpm exec flue run main --input '{"message":"get the first page of contacts from Zoho CRM and count them"}'
pnpm exec flue run main --input '{"message":"what is 12 * 34?"}'
```

### KB search (requires `ZOHO_DOCS_BEARER_TOKEN`)

```bash
pnpm exec flue run main --input '{"message":"search zoho docs for how to create a CRM custom function"}'
pnpm exec flue run main --input '{"message":"list all available zoho documentation products"}'
pnpm exec flue run main --input '{"message":"find zoho desk SLA configuration docs"}'
```
