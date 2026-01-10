/**
 * Feedback Analyzer Worker
 *
 * Routes:
 * - POST /interactions  - Discord slash commands handler
 * - POST /ingest        - HTTP API for ingesting raw feedback
 * - POST /ask           - HTTP API for querying feedback
 * - POST /digest        - HTTP API for generating daily digests
 */

import { upsertFeedback, getDailyStats, getFeedbackCount, getHighUrgencySample } from './domain/feedback';
import { storeFeedbackInR2 } from './storage/r2';
import { normalizeFeedback, type RawFeedbackInput } from './ai/normalize';
import { queryAiSearch, generateDigest, summarizeForDiscord } from './ai/search';
import {
	type DiscordInteraction,
	InteractionType,
	createPongResponse,
	createMessageResponse,
	createEphemeralResponse,
	createDeferredResponse,
	editOriginalResponse,
	getStringOption,
} from './discord/types';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;
		const method = request.method;

		// Simple router
		try {
			if (method === 'POST' && pathname === '/interactions') {
				return handleDiscordInteraction(request, env, ctx);
			}

			if (method === 'POST' && pathname === '/ingest') {
				return handleIngest(request, env);
			}

			if (method === 'POST' && pathname === '/ask') {
				return handleAsk(request, env);
			}

			if (method === 'POST' && pathname === '/digest') {
				return handleDigest(request, env);
			}

			// Health check
			if (method === 'GET' && pathname === '/') {
				return Response.json({
					status: 'ok',
					service: 'feedback-analyzer',
					endpoints: ['/interactions', '/ingest', '/ask', '/digest'],
				});
			}

			return Response.json({ error: 'Not found' }, { status: 404 });
		} catch (error) {
			console.error('Request error:', error);
			return Response.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;

/**
 * Handle Discord interactions (slash commands).
 * Uses deferred responses for slow commands to avoid Discord's 3-second timeout.
 */
async function handleDiscordInteraction(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	let interaction: DiscordInteraction;
	try {
		interaction = (await request.json()) as DiscordInteraction;
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	const commandName = interaction.data?.name?.toLowerCase();

	// Handle PING (Discord verification)
	if (interaction.type === InteractionType.PING) {
		return Response.json(createPongResponse());
	}

	// Handle APPLICATION_COMMAND
	if (interaction.type === InteractionType.APPLICATION_COMMAND) {
		switch (commandName) {
			case 'ask':
				return handleAskCommand(interaction, env, ctx);
			case 'digest':
				return handleDigestCommand(interaction, env, ctx);
			default:
				return Response.json(createEphemeralResponse(`Unknown command: ${commandName}`));
		}
	}

	return Response.json(createEphemeralResponse('Unsupported interaction type'));
}

/**
 * Handle /ask slash command.
 * Uses deferred response pattern to avoid Discord's 3-second timeout.
 */
function handleAskCommand(interaction: DiscordInteraction, env: Env, ctx: ExecutionContext): Response {
	const query = getStringOption(interaction, 'query');

	if (!query) {
		return Response.json(createEphemeralResponse('Please provide a query using the `query` option.'));
	}

	// Immediately return a deferred response (shows "Flare is thinking...")
	// Then do the slow work in the background and edit the message
	ctx.waitUntil(
		(async () => {
			try {
				const searchResult = await queryAiSearch(env.AI, env.AI_SEARCH_NAME, query);
				const formattedResponse = await summarizeForDiscord(env.AI, env.MODEL_SUMMARIZE, searchResult, { query });
				await editOriginalResponse(interaction.application_id, interaction.token, formattedResponse);
			} catch (error) {
				console.error('Ask command error:', error);
				await editOriginalResponse(
					interaction.application_id,
					interaction.token,
					'Sorry, I encountered an error while searching. Please try again.'
				);
			}
		})()
	);

	return Response.json(createDeferredResponse());
}

/**
 * Handle /digest slash command.
 * Uses deferred response pattern to avoid Discord's 3-second timeout.
 */
function handleDigestCommand(interaction: DiscordInteraction, env: Env, ctx: ExecutionContext): Response {
	const dateOption = getStringOption(interaction, 'date');
	const date = dateOption || new Date().toISOString().split('T')[0]; // Default to today (UTC)

	// Immediately return a deferred response (shows "Flare is thinking...")
	// Then do the slow work in the background and edit the message
	ctx.waitUntil(
		(async () => {
			try {
				// Get semantic digest from AI Search
				const searchResult = await generateDigest(env.AI, env.AI_SEARCH_NAME, date);

				// Get deterministic stats from D1
				const stats = await getDailyStats(env.DB, date);
				const totalCount = await getFeedbackCount(env.DB, date);
				const highUrgency = await getHighUrgencySample(env.DB, 3);

				// Format the digest response
				let digestContent = `**📊 Feedback Digest for ${date}**\n\n`;

				if (totalCount > 0) {
					digestContent += `**Total feedback:** ${totalCount}\n\n`;

					// Add stats breakdown if available
					if (stats.length > 0) {
						digestContent += '**Breakdown by source & sentiment:**\n';
						const grouped: Record<string, { pos: number; neu: number; neg: number }> = {};
						for (const stat of stats) {
							if (!grouped[stat.source]) {
								grouped[stat.source] = { pos: 0, neu: 0, neg: 0 };
							}
							if (stat.sentiment === 'positive') grouped[stat.source].pos += stat.count;
							else if (stat.sentiment === 'negative') grouped[stat.source].neg += stat.count;
							else grouped[stat.source].neu += stat.count;
						}
						for (const [source, counts] of Object.entries(grouped)) {
							digestContent += `• ${source}: 👍${counts.pos} 😐${counts.neu} 👎${counts.neg}\n`;
						}
						digestContent += '\n';
					}

					// Add AI-generated summary
					digestContent += '**Key Themes:**\n';
					digestContent += searchResult.answer.substring(0, 800);

					// Add high-urgency samples if available
					if (highUrgency.length > 0) {
						digestContent += '\n\n**🔴 High-Urgency Items:**\n';
						for (const item of highUrgency) {
							const excerpt = item.body_text.substring(0, 100);
							digestContent += `• "${excerpt}..."\n`;
						}
					}
				} else {
					digestContent += 'No feedback recorded for this date.';
				}

				// Truncate for Discord
				if (digestContent.length > 1900) {
					digestContent = digestContent.substring(0, 1897) + '...';
				}

				await editOriginalResponse(interaction.application_id, interaction.token, digestContent);
			} catch (error) {
				console.error('Digest command error:', error);
				await editOriginalResponse(
					interaction.application_id,
					interaction.token,
					'Sorry, I encountered an error generating the digest. Please try again.'
				);
			}
		})()
	);

	return Response.json(createDeferredResponse());
}

/**
 * Handle POST /ingest - HTTP API for ingesting raw feedback.
 */
async function handleIngest(request: Request, env: Env): Promise<Response> {
	const rawInput: RawFeedbackInput = await request.json();

	// Normalize raw input using Workers AI
	const feedback = await normalizeFeedback(env.AI, env.MODEL_NORMALIZE, rawInput);

	// Store in R2
	const r2Key = await storeFeedbackInR2(env.BUCKET, feedback);

	// Store in D1
	await upsertFeedback(env.DB, feedback, r2Key);

	console.log(`Ingested feedback: ${feedback.id} -> ${r2Key}`);

	return Response.json({
		success: true,
		id: feedback.id,
		created_at: feedback.created_at,
		r2_key: r2Key,
		normalized: {
			source: feedback.source,
			product_area: feedback.product_area,
			sentiment: feedback.sentiment,
			urgency: feedback.urgency,
			title: feedback.title,
			tags: feedback.tags,
		},
	});
}

/**
 * Handle POST /ask - HTTP API for querying feedback.
 */
async function handleAsk(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { query?: string };
	const query = body.query;

	if (!query) {
		return Response.json({ error: 'Missing required field: query' }, { status: 400 });
	}

	const searchResult = await queryAiSearch(env.AI, env.AI_SEARCH_NAME, query);
	const summary = await summarizeForDiscord(env.AI, env.MODEL_SUMMARIZE, searchResult, { query });

	return Response.json({
		query,
		answer: summary,
		citations: searchResult.citations,
		debug: {
			raw_response: searchResult.raw,
		},
	});
}

/**
 * Handle POST /digest - HTTP API for generating daily digests.
 */
async function handleDigest(request: Request, env: Env): Promise<Response> {
	const body = (await request.json()) as { date?: string };
	const date = body.date || new Date().toISOString().split('T')[0]; // Default to today (UTC)

	// Get semantic digest from AI Search
	const searchResult = await generateDigest(env.AI, env.AI_SEARCH_NAME, date);

	// Get deterministic stats from D1
	const stats = await getDailyStats(env.DB, date);
	const totalCount = await getFeedbackCount(env.DB, date);
	const highUrgency = await getHighUrgencySample(env.DB, 3);

	return Response.json({
		date,
		total_feedback: totalCount,
		stats_by_source_sentiment: stats,
		high_urgency_samples: highUrgency,
		ai_summary: searchResult.answer,
		citations: searchResult.citations,
	});
}
