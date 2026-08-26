# Flue persistence on Catalyst (`src/db.ts`)

Flue keeps its own runtime state — canonical agent-conversation streams, durable
submission lifecycle, and attachment payloads — behind a `PersistenceAdapter` it
discovers at `src/db.ts`. Without one, the Node target uses in-memory SQLite and
loses all of it on exit. This project default-exports a **Catalyst-backed
adapter** so that state survives AppSail restarts and redeploys.

This is separate from the per-user auth stores in [auth.md](auth.md): that is
*our* application data; this is *Flue's* engine state.

## Backend selection

`src/db.ts` picks the adapter by `STORE_BACKEND`:

- `catalyst` — the Catalyst adapter (NoSQL + Stratus). Production.
- anything else (`memory`) — Flue's built-in in-memory `sqlite()`, so local/CI
  boots do no Catalyst round-trips (matches the prior no-`db.ts` behavior).

## Service mapping

Flue's three stores map onto Catalyst by access pattern (`RunStore` and
`EventStreamStore` were removed from the persistence contract in Flue 2 along
with workflows — this app never re-created their tables):

| Flue store | Catalyst service | Why |
|---|---|---|
| `conversationStreamStore` | NoSQL (`FlueConvStreams` meta + `FlueConvBatches`) | append-only stream; each batch is one indivisible item under one offset; producer epoch fences a replaced coordinator |
| `submissionStore` | NoSQL (`FlueSubmissions`) | durable submission lifecycle (including turn-boundary joins and settlement leases); state transitions are conditional-update compare-and-set |
| `attachmentStore` | **Stratus** (bytes) + NoSQL (`FlueAttachments` metadata) | immutable payloads belong in object storage; metadata/conflict checks in NoSQL |
| format version | NoSQL (`FlueMeta`) | one-row format marker; boot fails loudly on an unsupported version |

Data Store is deliberately **not** used here: Flue's own SQL adapters rely on
transactions + row locking, which Catalyst Data Store has none of, and its
300-row ZCQL ceiling is a poor fit for unbounded append-only streams. NoSQL's
conditional writes express the required atomic compare-and-set directly.

## Durability, not active-active

The Catalyst adapter makes Flue state **durable across restart/redeploy**. It
does **not** enable active-active scaling: Flue requires one live owner routed
per agent instance regardless of backend (its own Postgres guidance says the
same), and AppSail offers no sticky routing. So the deployment stays pinned to
one instance — see [deploy-catalyst.md](deploy-catalyst.md). The producer-epoch
fence and lease/compare-and-set transitions still protect correctness during the
brief owner overlap of a failover/redeploy.

## Console setup

Create these in the Catalyst console (NoSQL tables and indexes are Console-only —
the CLI/SDK cannot make them). Partition/sort keys are **String** unless noted.

| Table | Partition key | Sort key | Notes |
|---|---|---|---|
| `FlueConvStreams` | `Path` | — | — |
| `FlueConvBatches` | `Path` | `Seq` (Number) | — |
| `FlueSubmissions` | `Scope` | `Id` | holds submissions, attempt markers, and a sequence counter under distinct `Scope` values |
| `FlueAttachments` | `StreamPath` | `AttachmentId` | metadata only; bytes live in Stratus |
| `FlueMeta` | `Key` | — | format-version marker |

Plus one **Stratus bucket** (globally-unique name) for attachment bytes. Set
`CATALYST_STRATUS_BUCKET` to its name and `CATALYST_STRATUS_OBJECT_URL` to the
bucket's object host copied from the console (the Development environment appends
`-development`, e.g. `https://myapp-flue-development.zohostratus.com`).

The service-account refresh token must carry NoSQL scopes
(`ZohoCatalyst.nosql.item.{CREATE,READ,UPDATE}`) and Stratus object scopes
(`ZohoCatalyst.buckets.objects.{CREATE,READ,DELETE}`).

## Wire-format validation

The NoSQL REST client (`src/store/catalyst/nosql-client.ts`) is unit-tested
against an in-memory fake that encodes this repo's reading of the doc-ambiguous
parts of the NoSQL API — the query response envelope, the conditional-write /
`attribute_not_exists` shape, and duplicate-key collision behavior. Before
trusting production, run the probe against a scratch table to confirm those
behaviors on your DC:

```bash
NOSQL_PROBE_TABLE=<scratch-table-with-Id-partition-key> node scripts/nosql-probe.mjs
```

Reconcile any `CHECK`/`INFO` lines it prints with the `@remarks validate` notes
in `nosql-client.ts`.
