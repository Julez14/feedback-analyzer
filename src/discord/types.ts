/**
 * Discord Interaction types for slash command handling.
 * Based on Discord API v10.
 */

// Interaction Types
export const InteractionType = {
	PING: 1,
	APPLICATION_COMMAND: 2,
	MESSAGE_COMPONENT: 3,
	APPLICATION_COMMAND_AUTOCOMPLETE: 4,
	MODAL_SUBMIT: 5,
} as const;

// Interaction Response Types
export const InteractionResponseType = {
	PONG: 1,
	CHANNEL_MESSAGE_WITH_SOURCE: 4,
	DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
	DEFERRED_UPDATE_MESSAGE: 6,
	UPDATE_MESSAGE: 7,
	APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
	MODAL: 9,
} as const;

// Application Command Option Types
export const ApplicationCommandOptionType = {
	SUB_COMMAND: 1,
	SUB_COMMAND_GROUP: 2,
	STRING: 3,
	INTEGER: 4,
	BOOLEAN: 5,
	USER: 6,
	CHANNEL: 7,
	ROLE: 8,
	MENTIONABLE: 9,
	NUMBER: 10,
	ATTACHMENT: 11,
} as const;

export interface InteractionDataOption {
	name: string;
	type: number;
	value?: string | number | boolean;
	options?: InteractionDataOption[];
}

export interface InteractionData {
	id: string;
	name: string;
	type?: number;
	options?: InteractionDataOption[];
}

export interface DiscordInteraction {
	id: string;
	type: number;
	application_id: string;
	data?: InteractionData;
	guild_id?: string;
	channel_id?: string;
	member?: {
		user: {
			id: string;
			username: string;
		};
	};
	user?: {
		id: string;
		username: string;
	};
	token: string;
	version: number;
}

export interface InteractionResponse {
	type: number;
	data?: {
		content?: string;
		flags?: number;
		embeds?: Array<{
			title?: string;
			description?: string;
			color?: number;
			fields?: Array<{ name: string; value: string; inline?: boolean }>;
		}>;
	};
}

/**
 * Create a PONG response for Discord's PING.
 */
export function createPongResponse(): InteractionResponse {
	return { type: InteractionResponseType.PONG };
}

/**
 * Create a message response for Discord.
 */
export function createMessageResponse(content: string): InteractionResponse {
	return {
		type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
		data: { content },
	};
}

/**
 * Create an ephemeral (only visible to user) message response.
 */
export function createEphemeralResponse(content: string): InteractionResponse {
	return {
		type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			content,
			flags: 64, // EPHEMERAL flag
		},
	};
}

/**
 * Extract a string option value from interaction data.
 */
export function getStringOption(interaction: DiscordInteraction, name: string): string | undefined {
	const option = interaction.data?.options?.find((o) => o.name === name);
	return option?.value !== undefined ? String(option.value) : undefined;
}
