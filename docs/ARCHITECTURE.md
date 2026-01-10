# Feedback Analyzer (Discord + Cloudflare Workers) — Architecture

## Goals (MVP)

- **Aggregate** noisy feedback from multiple “sources” (simulated) into a single canonical format.
- **Analyze** sentiment/urgency/product-area with Workers AI and store both raw + normalized data.
- **Query** precisely (SQL) and semantically (RAG) from a **Discord bot via slash commands**.
- **Prototype-grade security** (good enough for demo + iteration).

## Cloudflare Products Used

- **Workers**: HTTP API + Discord interactions handler.
- **Workers AI**: normalize incoming feedback, refine user questions, and summarize search results.
- **D1**: structured storage + precise analytics queries (counts, trends, filters).
- **R2**: durable storage for normalized feedback payloads (RAG corpus).
- **AI Search (AutoRAG)**: index R2 objects into a vector index; semantic retrieval for `/ask` and `/digest`.

## High-Level Component Diagram (text)

- **Client(s)**
  - **Discord** (slash commands)
  - **Local test script** (calls HTTP endpoints directly)
- **Cloudflare Worker**
  - Routes: `POST /ingest`, `POST /ask`, `POST /digest`
  - Calls Workers AI (normalize/refine/summarize)
  - Writes to **D1** (rows) and **R2** (objects)
  - Queries **AutoRAG** (semantic retrieval)
- **Storage / Index**
  - **D1**: canonical row + query indexes
  - **R2**: JSON/NDJSON objects (AutoRAG indexing source)
  - **AutoRAG**: vector index built from R2 objects

## Canonical Feedback Schema

This is the normalized structure produced by Workers AI during ingestion and used throughout the system.

```json
{
	"id": "feedback-uuid-1234",
	"created_at": "2026-01-09T17:46:00Z",
	"source": "discord|github|support|twitter|email",
	"source_url": "https://discord.com/channels/...",
	"product_area": "auth|billing|workers|ai|workers-ai|d1|r2|other",
	"title": "Short, AI-generated headline",
	"author": "mock-user-123",
	"thread_id": "discord-thread-or-issue-id",
	"body_text": "Cleaned main feedback text (good for embedding)",
	"sentiment": "positive|neutral|negative",
	"urgency": "low|medium|high|p1",
	"tags": ["feature-request", "bug", "docs"],
	"confidence": {
		"product_area": 0.82,
		"sentiment": 0.74,
		"urgency": 0.63
	}
}
```

### Notes on the schema

- **`body_text`** should be the best “single string” representation for semantic search (concatenate title/body + minimal context).
- **`source_url`** enables linking back from Discord responses.
- **`confidence`** is optional but useful to communicate “model certainty” and to filter low-confidence classifications later.
- **`product_area`** includes an **`other`** escape hatch to avoid forced misclassification.

## Data Storage Design

### D1 tables (proposed)

**Table**: `feedback`

- **Purpose**: fast filters, counts, trends, and sampling queries.
- **Key columns**:
  - `id TEXT PRIMARY KEY`
  - `created_at TEXT` (ISO timestamp; can also store as UNIX epoch integer if preferred)
  - `source TEXT`
  - `source_url TEXT`
  - `product_area TEXT`
  - `title TEXT`
  - `author TEXT`
  - `thread_id TEXT`
  - `body_text TEXT`
  - `sentiment TEXT`
  - `urgency TEXT`
  - `tags_json TEXT` (JSON string array)
  - `confidence_json TEXT` (JSON string object)
  - `r2_key TEXT` (points to the R2 object containing the canonical JSON)

**Indexes** (based on your sample queries):

- `(created_at)`
- `(source, product_area, created_at DESC)`
- `(urgency, created_at)`

### R2 object layout (batched for effective RAG)

AutoRAG works best when documents are coherent and not overly huge. For an MVP, a good compromise is:

- **Daily batch objects** (primary for RAG):
  - `feedback/dt=YYYY-MM-DD/source=discord/batch-0001.ndjson`
  - Each line is **one canonical feedback JSON** (same schema as above).
  - Benefit: fewer objects, easy “index a day” mental model, good retrieval within a time slice.
- **Optional per-item objects** (debugging / direct linking; not required for MVP):
  - `feedback/items/{id}.json`

**Important**: Ensure each NDJSON line includes the full canonical JSON so AutoRAG has the text + metadata context.

## AutoRAG (AI Search) Indexing

- **Source of truth for semantic retrieval**: R2 `feedback/` prefix.
- **Index strategy**:
  - Index the daily NDJSON batch objects directly from R2.
  - Rely on AutoRAG chunking to break large daily files into semantically meaningful chunks.
- **Metadata**:
  - Include `source`, `product_area`, `sentiment`, `urgency`, `created_at` in the JSON so retrieved chunks preserve context.

## Discord UX (Slash Commands Only)

### Commands

- **`/ingest payload:<json>`**
  - Ingests simulated feedback (for demo/testing inside Discord).
- **`/ask query:<text>`**
  - Returns a summarized answer + citations (links back to `source_url`).
- **`/digest date:<YYYY-MM-DD?>`**
  - Default: today (UTC unless otherwise specified).
  - Returns a consistent “daily digest” summary.

### How Discord hits the Worker (routing detail)

Discord requires a single “Interactions endpoint” URL. For the MVP we will:

- Configure Discord’s Interactions endpoint to point at **`POST /interactions`**
  - The Worker will detect the slash command name (`ingest` vs `ask` vs `digest`) inside the interaction payload.
  - This is the standard pattern for Discord apps: one public interactions webhook URL, internal routing per command.

Separately, `POST /ingest`, `POST /ask`, and `POST /digest` remain callable HTTP endpoints for local test scripts and parity testing.

## API Endpoints (Worker)

### 0) `POST /interactions` (Discord only)

**Caller**: Discord Interactions webhook (all slash commands).

**Purpose**: single entrypoint required by Discord. This route:

- parses and validates the interaction payload (prototype-grade: validation optional)
- routes internally based on `command_name`:
  - `ingest` → same internal handler as `POST /ingest`
  - `ask` → same internal handler as `POST /ask`
  - `digest` → same internal handler as `POST /digest`
- returns a Discord Interaction response payload

### 1) `POST /ingest`

**Callers**:

- Local test script (direct HTTP)
- Discord (via `POST /interactions`)

**Flow**:

- Accept JSON payload representing “raw feedback” (format can vary by `source`).
- Call **Workers AI** to:
  - extract/clean the main text
  - map to canonical schema fields (source/product_area/sentiment/urgency/tags)
  - generate `title` and `confidence`
- Write to:
  - **D1**: `INSERT` canonical row (and store `r2_key`)
  - **R2**: append canonical JSON line to the day’s NDJSON batch (or write a new batch object)
- AutoRAG indexing:
  - AutoRAG will pick up the new/updated R2 object(s) and update the index (timing depends on AutoRAG configuration).

**Response**:

- `{ id, created_at, r2_key }` plus any debug fields (optional).

### 2) `POST /ask`

**Callers**:

- Local test script (direct HTTP)
- Discord (via `POST /interactions`)

**Flow (ask)**:

- If request is a Discord interaction:
  - verify signature (optional for prototype; recommended later)
  - extract `query` text from the slash command
- Use **Workers AI** to **refine the query** into:
  - a better semantic search query
  - optional filters (e.g., product_area=workers-ai, timeframe=last 7 days)
- Query **AutoRAG** with the refined query.
- Use **Workers AI** to **summarize** retrieved passages into a Discord-friendly answer:
  - short answer
  - bullets by theme
  - top citations with `source_url`
- Return:
  - to Discord: Interaction response payload
  - to test script: JSON `{ answer, citations, debug }`

### 3) `POST /digest`

**Callers**:

- Local test script (direct HTTP call, e.g. `{ "date": "YYYY-MM-DD" }`)
- Discord (via `POST /interactions`)

**Inputs**:

- `date` (defaults to “today”; use UTC for MVP).

**Flow**:

- Construct a fixed semantic query (example):
  - “Summarize the most important feedback for YYYY-MM-DD; emphasize high/p1 urgency; group by product_area; include representative citations.”
- Query **AutoRAG** scoped by date when possible (either via metadata in retrieved content or by including the date in the query).
- Optionally run D1 “sanity queries” for counts/trends to enrich the digest (fast + deterministic):
  - daily counts by `source/product_area/sentiment`
  - urgent item counts
- Use **Workers AI** to generate a consistent digest format:
  - headline themes
  - notable p1/high items
  - quick stats
  - citations

## D1 Query Examples (from requirements)

These queries are supported by the `feedback` table design above:

- Daily digest rollup:
  - `SELECT source, product_area, sentiment, COUNT(*) FROM feedback WHERE created_at >= ? GROUP BY source, product_area, sentiment`
- Trends (last 7 days):
  - `SELECT urgency, COUNT(*) FROM feedback WHERE created_at >= date('now', '-7 days') GROUP BY urgency`
- Filter:
  - `SELECT * FROM feedback WHERE source = ? AND product_area = ? ORDER BY created_at DESC LIMIT 20`
- Stats:
  - `SELECT COUNT(*) FROM feedback WHERE created_at >= ?`
- Sample:
  - `SELECT body_text, source_url FROM feedback WHERE urgency = 'high' ORDER BY RANDOM() LIMIT 5`

## Operational Notes (MVP)

- **Idempotency / dedupe**: accept `id` if provided; otherwise generate a UUID. For MVP, “last write wins” is fine.
- **Prototype-grade security**:
  - Allow a simple `X-API-Key` for `/ingest` and direct HTTP `/ask`/`/digest` calls.
  - Discord signature verification can be added later; for MVP can be skipped if needed.
- **Observability**:
  - Log the `id`, `source`, `product_area`, and timing for each route (avoid logging full body_text in production).

## Future Enhancements (post-MVP)

- **Scheduled digests** via Cron Triggers.
- **Workflows** to make ingestion + indexing + summarization resilient and retriable.
- **Metadata filtering** in semantic search (if/when supported by the chosen AI Search configuration).
- **Multi-tenant** partitioning by `guild_id` / `channel_id` (separate D1 rows and R2 prefixes).
