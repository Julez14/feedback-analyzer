# Design decisions (Q&A)

Below are some design decisions I made through chatting with my AI assistant.

## Q: Should the daily digest be scheduled or manual for MVP?

**Decision:** Implement `/digest` as a manual command now, with a note “cron scheduled next.”
**Why:** Scheduling adds complexity and isn’t required to demonstrate the core product value in an MVP.

## Q: Should I use AI Search or build directly on a vector DB?

**Decision:** Use Cloudflare AI Search for the MVP.
**Why:** It reduces “vector plumbing” and makes it easier to ship a reliable RAG demo quickly, while still allowing differentiation via your standardization step and PM-style outputs.

## Q: Does AI Search automatically convert D1 rows into embeddings?

**Decision:** No—treat D1 and AI Search as separate layers and explicitly index documents into AI Search (via its configured data source).
**Why:** AI Search indexes content from connected sources (not “watching” D1 tables by default), so you need an ingestion/indexing path that feeds the RAG corpus.

## Q: Should I skip standardization and just store raw JSON in R2 as the source of truth?

**Decision:** Don’t skip it—do standardization (or “standardization-lite”) even if R2 is your main store.
**Why:** Without standardization, analytics and even RAG quality become inconsistent because the “true feedback text” lives in different fields across platforms; standardization is also the core product insight of the prompt.

## Q: What write format should I use in R2 (per-item JSON vs daily NDJSON)?

**Decision:** Use per-item JSON objects with date/source prefixes for MVP.
**Why:** NDJSON “append” patterns introduce concurrency coordination (often requiring a serializer), while per-item objects are simpler and safer under parallel ingestion.

## Q: Should the Discord bot use mentions or slash commands?

**Decision:** Use slash commands for the MVP.  
**Why:** It’s simpler and more reliable to implement within the timebox; mentions add extra moving parts and risk.

## Q: What should the system architecture look like?

**Decision:** One Cloudflare Worker hosts the Discord interaction handler and the HTTP API routes, and it talks to bound services (Workers AI + D1 + R2 + AI Search).
**Why:** A single Worker keeps deployment and debugging simple and makes the architecture screenshot/description clearer for the submission.

## Q: What are my D1 querying needs (to design tables + indexes)?

**Decision:** Optimize D1 for time-window queries and breakdowns used by digests and PM analytics (by date, source, product area, sentiment, urgency), plus fast “recent items” retrieval.
**Why:** RAG is handled by AI Search, while D1 powers deterministic counts/trends and “what changed” style analysis that makes the tool feel PM-built.
