/**
 * Script to ingest sample feedback data for testing.
 *
 * Usage:
 *   npx tsx scripts/ingest-sample.ts [WORKER_URL]
 *
 * Examples:
 *   npx tsx scripts/ingest-sample.ts http://localhost:8787
 *   npx tsx scripts/ingest-sample.ts https://feedback-analyzer.juelzlax.workers.dev
 */

const sampleFeedback = [
	{
		source: 'discord',
		source_url: 'https://discord.com/channels/123/456/789',
		author: 'user_alice',
		thread_id: 'thread-001',
		content:
			'The Workers AI response times have been really slow lately. Sometimes it takes 5+ seconds to get a response from Llama. This is blocking our production deployment.',
		timestamp: new Date().toISOString(),
	},
	{
		source: 'github',
		source_url: 'https://github.com/cloudflare/workers-sdk/issues/1234',
		author: 'developer_bob',
		title: 'D1 query timeout on large result sets',
		body: 'When running queries that return more than 1000 rows, D1 sometimes times out. We need better pagination support or higher limits for batch operations.',
		created_at: new Date().toISOString(),
	},
	{
		source: 'support',
		source_url: 'https://support.cloudflare.com/ticket/12345',
		author: 'enterprise_customer',
		message:
			'We love R2! The S3 compatibility has made migration super smooth. Would be great to have better event notifications though - the current system is a bit limited for our real-time sync needs.',
	},
	{
		source: 'twitter',
		source_url: 'https://twitter.com/user/status/123456789',
		author: '@cloudflare_fan',
		text: "Just tried the new AI Gateway and it's amazing! The caching feature alone saved us 40% on API costs. Great work Cloudflare team! 🎉",
	},
	{
		source: 'email',
		author: 'feedback@example.com',
		content:
			"The billing dashboard is confusing. I can't figure out how to see my Workers usage breakdown vs R2 vs D1. Please add better cost attribution.",
	},
	{
		source: 'discord',
		source_url: 'https://discord.com/channels/123/456/999',
		author: 'user_charlie',
		thread_id: 'thread-002',
		content:
			'URGENT: Our auth service using Workers is returning 500 errors after the latest update. This is a P1 for us - affecting all user logins!',
		timestamp: new Date().toISOString(),
	},
	{
		source: 'github',
		source_url: 'https://github.com/cloudflare/wrangler/issues/5678',
		author: 'contributor_dave',
		title: 'Feature request: Better local D1 emulation',
		body: 'The local D1 development experience could be improved. Would love to see better SQLite compatibility and the ability to seed test data easily.',
	},
];

async function ingestSamples(workerUrl: string) {
	console.log(`Ingesting ${sampleFeedback.length} sample feedback items to ${workerUrl}\n`);

	for (let i = 0; i < sampleFeedback.length; i++) {
		const feedback = sampleFeedback[i];
		console.log(`[${i + 1}/${sampleFeedback.length}] Ingesting from ${feedback.source}...`);

		try {
			const response = await fetch(`${workerUrl}/ingest`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(feedback),
			});

			if (!response.ok) {
				const error = await response.text();
				console.error(`  ❌ Failed: ${response.status} - ${error}`);
				continue;
			}

			const result = (await response.json()) as {
				id: string;
				normalized?: { sentiment: string; urgency: string; product_area: string };
			};
			console.log(`  ✅ ID: ${result.id}`);
			if (result.normalized) {
				console.log(
					`     Sentiment: ${result.normalized.sentiment}, Urgency: ${result.normalized.urgency}, Area: ${result.normalized.product_area}`
				);
			}
		} catch (error) {
			console.error(`  ❌ Error: ${error}`);
		}
	}

	console.log('\n✅ Done ingesting samples!');
	console.log('\nYou can now test the /ask and /digest endpoints:');
	console.log(
		`  curl -X POST ${workerUrl}/ask -H "Content-Type: application/json" -d '{"query": "What are the main issues with Workers AI?"}'`
	);
	console.log(`  curl -X POST ${workerUrl}/digest -H "Content-Type: application/json" -d '{}'`);
}

// Get worker URL from command line or default to localhost
const workerUrl = process.argv[2] || 'http://localhost:8787';
ingestSamples(workerUrl);
