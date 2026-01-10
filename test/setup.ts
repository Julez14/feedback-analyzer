/**
 * Global test setup for Vitest (Workers pool).
 * Creates the D1 table used by the worker so tests do not fail on missing schema.
 * We inline the migration SQL to avoid Node fs usage (not available in the worker runtime).
 */

import { env } from 'cloudflare:test';

const CREATE_TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS feedback (' +
  'id TEXT PRIMARY KEY,' +
  'created_at TEXT NOT NULL,' +
  'source TEXT NOT NULL,' +
  'source_url TEXT,' +
  'product_area TEXT NOT NULL,' +
  'title TEXT,' +
  'author TEXT,' +
  'thread_id TEXT,' +
  'body_text TEXT NOT NULL,' +
  'sentiment TEXT NOT NULL,' +
  'urgency TEXT NOT NULL,' +
  'tags_json TEXT,' +
  'confidence_json TEXT,' +
  'r2_key TEXT NOT NULL' +
  ');';

await (async () => {
  try {
    await env.DB.exec(CREATE_TABLE_SQL);
  } catch (err) {
    console.log('Setup: could not create feedback table', err);
  }
})();
