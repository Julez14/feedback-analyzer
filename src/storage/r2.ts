/**
 * R2 storage helpers for canonical feedback objects.
 * Objects are stored partitioned by date and source for effective RAG indexing.
 *
 * Key format: feedback/dt=YYYY-MM-DD/source=<source>/<id>.json
 */

import type { Feedback } from '../domain/feedback';

/**
 * Generate the R2 object key for a feedback item.
 * Partitioned by date (from created_at) and source for optimal RAG chunking.
 */
export function getFeedbackR2Key(feedback: Feedback): string {
	// Extract date portion from ISO timestamp (YYYY-MM-DD)
	const date = feedback.created_at.split('T')[0];
	return `feedback/dt=${date}/source=${feedback.source}/${feedback.id}.json`;
}

/**
 * Store a canonical feedback object in R2.
 */
export async function storeFeedbackInR2(bucket: R2Bucket, feedback: Feedback): Promise<string> {
	const key = getFeedbackR2Key(feedback);
	const body = JSON.stringify(feedback, null, 2);

	await bucket.put(key, body, {
		httpMetadata: {
			contentType: 'application/json',
		},
		customMetadata: {
			source: feedback.source,
			product_area: feedback.product_area,
			sentiment: feedback.sentiment,
			urgency: feedback.urgency,
			created_at: feedback.created_at,
		},
	});

	return key;
}

/**
 * Retrieve a feedback object from R2 by key.
 */
export async function getFeedbackFromR2(bucket: R2Bucket, key: string): Promise<Feedback | null> {
	const object = await bucket.get(key);
	if (!object) return null;

	const text = await object.text();
	return JSON.parse(text) as Feedback;
}

/**
 * List feedback objects for a specific date.
 */
export async function listFeedbackForDate(bucket: R2Bucket, date: string, source?: string): Promise<string[]> {
	const prefix = source ? `feedback/dt=${date}/source=${source}/` : `feedback/dt=${date}/`;

	const listed = await bucket.list({ prefix });
	return listed.objects.map((obj) => obj.key);
}
