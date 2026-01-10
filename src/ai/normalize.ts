/**
 * Workers AI helpers for normalizing raw feedback into the canonical schema.
 */

import type { Feedback, FeedbackSource, ProductArea, Sentiment, Urgency } from '../domain/feedback';

/**
 * The prompt template for normalizing raw feedback into canonical JSON.
 */
const NORMALIZE_SYSTEM_PROMPT = `You are a feedback normalizer. Given raw feedback data, extract and normalize it into the following JSON structure. Output ONLY valid JSON, no explanation.

Required fields:
- id: Use the provided id or generate a UUID-like string
- created_at: ISO 8601 timestamp (use current time if not provided)
- source: One of: discord, github, support, twitter, email
- source_url: Original URL if available, otherwise null
- product_area: One of: auth, billing, workers, ai, workers-ai, d1, r2, other
- title: A short summary headline (max 100 chars)
- author: Username or identifier if available
- thread_id: Thread/issue ID if available
- body_text: The main feedback text, cleaned and concatenated
- sentiment: One of: positive, neutral, negative
- urgency: One of: low, medium, high, p1
- tags: Array of relevant tags like: feature-request, bug, docs, performance, security
- confidence: Object with product_area, sentiment, urgency scores (0-1)

Analyze the content to determine sentiment, urgency, and product area. Be conservative - use "other" for product_area if uncertain.`;

/**
 * Raw input that can come from various sources.
 */
export interface RawFeedbackInput {
	id?: string;
	source?: string;
	source_url?: string;
	author?: string;
	thread_id?: string;
	content?: string;
	body?: string;
	text?: string;
	message?: string;
	title?: string;
	timestamp?: string;
	created_at?: string;
	[key: string]: unknown;
}

/**
 * Normalize raw feedback using Workers AI.
 */
export async function normalizeFeedback(
	ai: Ai,
	model: string,
	rawInput: RawFeedbackInput
): Promise<Feedback> {
	const userPrompt = `Normalize this raw feedback into the canonical JSON format:\n\n${JSON.stringify(rawInput, null, 2)}`;

	const response = await ai.run(model as BaseAiTextGenerationModels, {
		messages: [
			{ role: 'system', content: NORMALIZE_SYSTEM_PROMPT },
			{ role: 'user', content: userPrompt },
		],
		max_tokens: 1024,
	});

	// Extract the response text
	let responseText: string;
	if (typeof response === 'object' && response !== null && 'response' in response) {
		responseText = (response as { response: string }).response;
	} else {
		throw new Error('Unexpected AI response format');
	}

	// Parse JSON from response (handle markdown code blocks)
	let jsonStr = responseText.trim();
	if (jsonStr.startsWith('```json')) {
		jsonStr = jsonStr.slice(7);
	} else if (jsonStr.startsWith('```')) {
		jsonStr = jsonStr.slice(3);
	}
	if (jsonStr.endsWith('```')) {
		jsonStr = jsonStr.slice(0, -3);
	}
	jsonStr = jsonStr.trim();

	const parsed = JSON.parse(jsonStr);

	// Validate and coerce to Feedback type
	return validateFeedback(parsed);
}

/**
 * Validate and coerce parsed JSON to Feedback type.
 */
function validateFeedback(data: Record<string, unknown>): Feedback {
	const validSources: FeedbackSource[] = ['discord', 'github', 'support', 'twitter', 'email'];
	const validProductAreas: ProductArea[] = ['auth', 'billing', 'workers', 'ai', 'workers-ai', 'd1', 'r2', 'other'];
	const validSentiments: Sentiment[] = ['positive', 'neutral', 'negative'];
	const validUrgencies: Urgency[] = ['low', 'medium', 'high', 'p1'];

	const id = String(data.id || crypto.randomUUID());
	const created_at = String(data.created_at || new Date().toISOString());

	const source = validSources.includes(data.source as FeedbackSource)
		? (data.source as FeedbackSource)
		: 'email'; // default fallback

	const product_area = validProductAreas.includes(data.product_area as ProductArea)
		? (data.product_area as ProductArea)
		: 'other';

	const sentiment = validSentiments.includes(data.sentiment as Sentiment)
		? (data.sentiment as Sentiment)
		: 'neutral';

	const urgency = validUrgencies.includes(data.urgency as Urgency)
		? (data.urgency as Urgency)
		: 'medium';

	const tags = Array.isArray(data.tags)
		? data.tags.filter((t): t is string => typeof t === 'string')
		: [];

	return {
		id,
		created_at,
		source,
		source_url: typeof data.source_url === 'string' ? data.source_url : undefined,
		product_area,
		title: typeof data.title === 'string' ? data.title : undefined,
		author: typeof data.author === 'string' ? data.author : undefined,
		thread_id: typeof data.thread_id === 'string' ? data.thread_id : undefined,
		body_text: String(data.body_text || data.content || data.body || data.text || ''),
		sentiment,
		urgency,
		tags,
		confidence:
			typeof data.confidence === 'object' && data.confidence !== null
				? {
						product_area: typeof (data.confidence as Record<string, unknown>).product_area === 'number' 
							? (data.confidence as Record<string, unknown>).product_area as number 
							: undefined,
						sentiment: typeof (data.confidence as Record<string, unknown>).sentiment === 'number' 
							? (data.confidence as Record<string, unknown>).sentiment as number 
							: undefined,
						urgency: typeof (data.confidence as Record<string, unknown>).urgency === 'number' 
							? (data.confidence as Record<string, unknown>).urgency as number 
							: undefined,
					}
				: undefined,
	};
}
