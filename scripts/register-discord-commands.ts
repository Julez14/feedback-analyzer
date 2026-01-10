/**
 * Script to register Discord slash commands.
 * 
 * Usage:
 *   DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=xxx npx tsx scripts/register-discord-commands.ts
 * 
 * For guild-specific commands (faster updates during dev):
 *   DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=xxx npx tsx scripts/register-discord-commands.ts
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

interface SlashCommand {
	name: string;
	description: string;
	type?: number; // 1 = CHAT_INPUT (default)
	options?: Array<{
		name: string;
		description: string;
		type: number; // 3 = STRING, 4 = INTEGER, etc.
		required?: boolean;
	}>;
}

// Application Command Option Types
const OptionType = {
	STRING: 3,
	INTEGER: 4,
	BOOLEAN: 5,
} as const;

const commands: SlashCommand[] = [
	{
		name: 'ask',
		description: 'Ask a question about customer feedback',
		type: 1,
		options: [
			{
				name: 'query',
				description: 'Your question about the feedback',
				type: OptionType.STRING,
				required: true,
			},
		],
	},
	{
		name: 'digest',
		description: 'Get a summary of feedback for a specific date',
		type: 1,
		options: [
			{
				name: 'date',
				description: 'Date in YYYY-MM-DD format (defaults to today)',
				type: OptionType.STRING,
				required: false,
			},
		],
	},
];

async function registerCommands() {
	const appId = process.env.DISCORD_APP_ID;
	const botToken = process.env.DISCORD_BOT_TOKEN;
	const guildId = process.env.DISCORD_GUILD_ID; // Optional: for guild-specific commands

	if (!appId || !botToken) {
		console.error('Error: DISCORD_APP_ID and DISCORD_BOT_TOKEN environment variables are required.');
		console.error('\nUsage:');
		console.error('  DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=xxx npx tsx scripts/register-discord-commands.ts');
		process.exit(1);
	}

	// Use guild-specific endpoint for faster updates during development
	// or global endpoint for production
	const endpoint = guildId
		? `${DISCORD_API_BASE}/applications/${appId}/guilds/${guildId}/commands`
		: `${DISCORD_API_BASE}/applications/${appId}/commands`;

	console.log(`Registering ${commands.length} commands...`);
	console.log(`Endpoint: ${guildId ? `Guild ${guildId}` : 'Global'}\n`);

	try {
		const response = await fetch(endpoint, {
			method: 'PUT',
			headers: {
				'Authorization': `Bot ${botToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(commands),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error(`Failed to register commands: ${response.status} ${response.statusText}`);
			console.error(error);
			process.exit(1);
		}

		const result = await response.json();
		console.log('✅ Commands registered successfully!\n');
		console.log('Registered commands:');
		for (const cmd of result as Array<{ name: string; id: string }>) {
			console.log(`  - /${cmd.name} (ID: ${cmd.id})`);
		}

		if (!guildId) {
			console.log('\n⚠️  Note: Global commands can take up to 1 hour to propagate.');
			console.log('   For faster updates during development, set DISCORD_GUILD_ID.');
		}
	} catch (error) {
		console.error('Error registering commands:', error);
		process.exit(1);
	}
}

registerCommands();
