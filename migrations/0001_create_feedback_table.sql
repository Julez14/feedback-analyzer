-- Create feedback table for storing normalized feedback data
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    product_area TEXT NOT NULL,
    title TEXT,
    author TEXT,
    thread_id TEXT,
    body_text TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    urgency TEXT NOT NULL,
    tags_json TEXT,
    confidence_json TEXT,
    r2_key TEXT NOT NULL
);

-- Index for time-based queries (daily digest, stats)
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

-- Composite index for filtering by source + product_area with time ordering
CREATE INDEX IF NOT EXISTS idx_feedback_source_product_time ON feedback(source, product_area, created_at DESC);

-- Index for urgency-based queries
CREATE INDEX IF NOT EXISTS idx_feedback_urgency_time ON feedback(urgency, created_at);
