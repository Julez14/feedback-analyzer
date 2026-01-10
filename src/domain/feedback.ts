/**
 * Canonical feedback schema — the normalized structure used throughout the system.
 * Produced by Workers AI during ingestion and stored in D1 + R2.
 */

export type FeedbackSource = 'discord' | 'github' | 'support' | 'twitter' | 'email';
export type ProductArea = 'auth' | 'billing' | 'workers' | 'ai' | 'workers-ai' | 'd1' | 'r2' | 'other';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Urgency = 'low' | 'medium' | 'high' | 'p1';

export interface FeedbackConfidence {
	product_area?: number;
	sentiment?: number;
	urgency?: number;
}

export interface Feedback {
	id: string;
	created_at: string; // ISO timestamp
	source: FeedbackSource;
	source_url?: string;
	product_area: ProductArea;
	title?: string;
	author?: string;
	thread_id?: string;
	body_text: string;
	sentiment: Sentiment;
	urgency: Urgency;
	tags: string[];
	confidence?: FeedbackConfidence;
}

/**
 * The shape of a row in the D1 `feedback` table.
 * JSON fields are stored as strings.
 */
export interface FeedbackRow {
	id: string;
	created_at: string;
	source: string;
	source_url: string | null;
	product_area: string;
	title: string | null;
	author: string | null;
	thread_id: string | null;
	body_text: string;
	sentiment: string;
	urgency: string;
	tags_json: string | null;
	confidence_json: string | null;
	r2_key: string;
}

/**
 * Convert a Feedback object to a FeedbackRow for D1 insertion.
 */
export function feedbackToRow(feedback: Feedback, r2Key: string): FeedbackRow {
	return {
		id: feedback.id,
		created_at: feedback.created_at,
		source: feedback.source,
		source_url: feedback.source_url ?? null,
		product_area: feedback.product_area,
		title: feedback.title ?? null,
		author: feedback.author ?? null,
		thread_id: feedback.thread_id ?? null,
		body_text: feedback.body_text,
		sentiment: feedback.sentiment,
		urgency: feedback.urgency,
		tags_json: feedback.tags.length > 0 ? JSON.stringify(feedback.tags) : null,
		confidence_json: feedback.confidence ? JSON.stringify(feedback.confidence) : null,
		r2_key: r2Key,
	};
}

/**
 * Convert a FeedbackRow from D1 back to a Feedback object.
 */
export function rowToFeedback(row: FeedbackRow): Feedback & { r2_key: string } {
	return {
		id: row.id,
		created_at: row.created_at,
		source: row.source as FeedbackSource,
		source_url: row.source_url ?? undefined,
		product_area: row.product_area as ProductArea,
		title: row.title ?? undefined,
		author: row.author ?? undefined,
		thread_id: row.thread_id ?? undefined,
		body_text: row.body_text,
		sentiment: row.sentiment as Sentiment,
		urgency: row.urgency as Urgency,
		tags: row.tags_json ? JSON.parse(row.tags_json) : [],
		confidence: row.confidence_json ? JSON.parse(row.confidence_json) : undefined,
		r2_key: row.r2_key,
	};
}

/**
 * Insert or replace a feedback row into D1.
 */
export async function upsertFeedback(db: D1Database, feedback: Feedback, r2Key: string): Promise<void> {
	const row = feedbackToRow(feedback, r2Key);

	await db
		.prepare(
			`INSERT OR REPLACE INTO feedback 
       (id, created_at, source, source_url, product_area, title, author, thread_id, body_text, sentiment, urgency, tags_json, confidence_json, r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			row.id,
			row.created_at,
			row.source,
			row.source_url,
			row.product_area,
			row.title,
			row.author,
			row.thread_id,
			row.body_text,
			row.sentiment,
			row.urgency,
			row.tags_json,
			row.confidence_json,
			row.r2_key
		)
		.run();
}

/**
 * Get daily digest stats for a given date (YYYY-MM-DD).
 */
export async function getDailyStats(
	db: D1Database,
	date: string
): Promise<{ source: string; product_area: string; sentiment: string; count: number }[]> {
	const result = await db
		.prepare(
			`SELECT source, product_area, sentiment, COUNT(*) as count 
       FROM feedback 
       WHERE created_at >= ? AND created_at < date(?, '+1 day')
       GROUP BY source, product_area, sentiment`
		)
		.bind(date, date)
		.all();

	return (result.results ?? []) as { source: string; product_area: string; sentiment: string; count: number }[];
}

/**
 * Get urgency breakdown for the last N days.
 */
export async function getUrgencyTrends(db: D1Database, days: number = 7): Promise<{ urgency: string; count: number }[]> {
	const result = await db
		.prepare(
			`SELECT urgency, COUNT(*) as count 
       FROM feedback 
       WHERE created_at >= date('now', '-' || ? || ' days')
       GROUP BY urgency`
		)
		.bind(days)
		.all();

	return (result.results ?? []) as { urgency: string; count: number }[];
}

/**
 * Get total feedback count since a given date.
 */
export async function getFeedbackCount(db: D1Database, sinceDate: string): Promise<number> {
	const result = await db.prepare(`SELECT COUNT(*) as count FROM feedback WHERE created_at >= ?`).bind(sinceDate).first();

	return (result?.count as number) ?? 0;
}

/**
 * Get a sample of high-urgency feedback items.
 */
export async function getHighUrgencySample(db: D1Database, limit: number = 5): Promise<{ body_text: string; source_url: string | null }[]> {
	const result = await db
		.prepare(
			`SELECT body_text, source_url 
       FROM feedback 
       WHERE urgency IN ('high', 'p1')
       ORDER BY RANDOM() 
       LIMIT ?`
		)
		.bind(limit)
		.all();

	return (result.results ?? []) as { body_text: string; source_url: string | null }[];
}
