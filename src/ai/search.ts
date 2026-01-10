/**
 * AI Search (AutoRAG) helpers for semantic retrieval and summarization.
 */

export interface SearchResult {
	answer: string;
	citations: { text: string; source_url?: string }[];
	raw?: unknown;
}

export interface AiSearchResponse {
	response?: string;
	data?: {
		response?: string;
		sources?: Array<{
			content?: string;
			filename?: string;
			score?: number;
		}>;
	};
}

/**
 * Query AI Search for relevant feedback and get a generated response.
 */
export async function queryAiSearch(
	ai: Ai,
	ragName: string,
	query: string,
	options?: {
		maxResults?: number;
		scoreThreshold?: number;
	}
): Promise<SearchResult> {
	const maxResults = options?.maxResults ?? 5;
	const scoreThreshold = options?.scoreThreshold ?? 0.3;

	try {
		// Use the AI Search binding via env.AI.autorag()
		const result = await (ai as unknown as {
			autorag: (name: string) => {
				aiSearch: (opts: {
					query: string;
					max_num_results?: number;
					ranking_options?: { score_threshold?: number };
				}) => Promise<AiSearchResponse>;
			};
		}).autorag(ragName).aiSearch({
			query,
			max_num_results: maxResults,
			ranking_options: {
				score_threshold: scoreThreshold,
			},
		});

		// Extract the response
		const answer = result?.response ?? result?.data?.response ?? 'No results found.';
		
		// Extract citations from sources if available
		const sources = result?.data?.sources ?? [];
		const citations = sources.map((s) => ({
			text: s.content?.substring(0, 200) ?? '',
			source_url: s.filename, // R2 key acts as source reference
		}));

		return {
			answer,
			citations,
			raw: result,
		};
	} catch (error) {
		console.error('AI Search error:', error);
		return {
			answer: 'Unable to search feedback at this time.',
			citations: [],
			raw: { error: String(error) },
		};
	}
}

/**
 * Generate a digest using AI Search with a date-focused query.
 */
export async function generateDigest(
	ai: Ai,
	ragName: string,
	date: string
): Promise<SearchResult> {
	const digestQuery = `Summarize the most important customer feedback for ${date}. 
Emphasize any high urgency or p1 items. 
Group insights by product area when possible. 
Include representative examples and highlight common themes.`;

	return queryAiSearch(ai, ragName, digestQuery, {
		maxResults: 10,
		scoreThreshold: 0.2,
	});
}

/**
 * Summarize search results into a Discord-friendly format.
 */
export async function summarizeForDiscord(
	ai: Ai,
	model: string,
	searchResult: SearchResult,
	context: { query?: string; date?: string }
): Promise<string> {
	// If the AI Search already gave us a good answer, format it for Discord
	let content = searchResult.answer;

	// Add citations if available
	if (searchResult.citations.length > 0) {
		content += '\n\n**Sources:**';
		searchResult.citations.slice(0, 3).forEach((c, i) => {
			if (c.text) {
				content += `\n${i + 1}. ${c.text.substring(0, 100)}...`;
			}
		});
	}

	// Truncate for Discord (max 2000 chars)
	if (content.length > 1900) {
		content = content.substring(0, 1897) + '...';
	}

	return content;
}
