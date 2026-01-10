import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// Typed request helper
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Feedback Analyzer Worker', () => {
	describe('GET /', () => {
		it('returns health check status', async () => {
			const request = new IncomingRequest('http://example.com/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toMatchObject({
				status: 'ok',
				service: 'feedback-analyzer',
				endpoints: expect.arrayContaining(['/interactions', '/ingest', '/ask', '/digest']),
			});
		});
	});

	describe('POST /interactions (Discord)', () => {
		it('responds to Discord PING with PONG', async () => {
			const request = new IncomingRequest('http://example.com/interactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 1, // PING
					id: 'test-interaction-id',
					application_id: 'test-app-id',
					token: 'test-token',
					version: 1,
				}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toMatchObject({
				type: 1, // PONG
			});
		});

		it('handles unknown commands gracefully', async () => {
			const request = new IncomingRequest('http://example.com/interactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 2, // APPLICATION_COMMAND
					id: 'test-interaction-id',
					application_id: 'test-app-id',
					token: 'test-token',
					version: 1,
					data: {
						id: 'cmd-id',
						name: 'unknown_command',
					},
				}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
			expect(body.data.content).toContain('Unknown command');
		});

		it('handles /ask command without query', async () => {
			const request = new IncomingRequest('http://example.com/interactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 2, // APPLICATION_COMMAND
					id: 'test-interaction-id',
					application_id: 'test-app-id',
					token: 'test-token',
					version: 1,
					data: {
						id: 'cmd-id',
						name: 'ask',
						options: [], // No query provided
					},
				}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.type).toBe(4);
			expect(body.data.content).toContain('query');
		});
	});

	describe('POST /ask (HTTP API)', () => {
		it('returns error when query is missing', async () => {
			const request = new IncomingRequest('http://example.com/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('query');
		});
	});

	describe('POST /digest (HTTP API)', () => {
		it('accepts request with default date', async () => {
			const request = new IncomingRequest('http://example.com/digest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			// Should return 200 with empty stats
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toHaveProperty('date');
			expect(body).toHaveProperty('total_feedback');
		}, 30000); // 30s timeout for AI Search calls

		it('accepts request with specific date', async () => {
			const request = new IncomingRequest('http://example.com/digest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date: '2026-01-09' }),
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.date).toBe('2026-01-09');
		}, 30000); // 30s timeout for AI Search calls
	});

	describe('404 handling', () => {
		it('returns 404 for unknown routes', async () => {
			const request = new IncomingRequest('http://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
		});
	});
});
