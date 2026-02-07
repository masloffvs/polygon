import { z } from "zod";

// Example structure based on user request:
// "needs storage from which it will take data, for example a set of addresses"

export const PolyscanConfigSchema = z.object({
	enabled: z.boolean().default(true),
	// Addresses or users to monitor
	monitored_users: z.array(z.string()).default([]),
	// Filter thresholds
	whale_threshold_shares: z.number().default(1000),
	whale_threshold_usdc: z.number().default(500),
});

export const PizzaConfigSchema = z.object({
	enabled: z.boolean().default(true),
	places_of_interest: z.array(z.string()).default([]),
});

export const OKLinkAddressSchema = z.object({
	address: z.string(),
	alias: z.string(),
	chain: z.string().default("polygon"),
	description: z.string().optional(),
});

export const OKLinkConfigSchema = z.object({
	enabled: z.boolean().default(true),
	api_key: z.string().default("a2c903cc-b31e-4547-9299-b6d07b7631ab"),
	interval_ms: z.number().default(5000),
	addresses: z.array(OKLinkAddressSchema).default([]),
});

export const SolanaWatchdogSchema = z.object({
	name: z.string(),
	address: z.string(),
	description: z.string().optional(),
});

export const SolanaConfigSchema = z.object({
	enabled: z.boolean().default(true),
	rpc_url: z.string().default("https://api.mainnet-beta.solana.com"),
	commitment: z
		.enum(["processed", "confirmed", "finalized"])
		.default("confirmed"),
	watchdog: z.array(SolanaWatchdogSchema).default([]),
});

// Telegram Bot Configuration
export const TelegramBotSchema = z.object({
	id: z.string(), // Unique ID for referencing in nodes (e.g., "alerts-bot")
	token: z.string(), // Bot token from @BotFather
	name: z.string().optional(), // Friendly name
});

export const TelegramChatSchema = z.object({
	id: z.string(), // Unique ID for referencing (e.g., "main-channel")
	chatId: z.string(), // Telegram chat ID (can be negative for groups/channels)
	alias: z.string().optional(), // Friendly name
	defaultBotId: z.string().optional(), // Default bot to use for this chat
});

export const TelegramConfigSchema = z.object({
	enabled: z.boolean().default(true),
	bots: z.array(TelegramBotSchema).default([]),
	chats: z.array(TelegramChatSchema).default([]),
});

// The Global Configuration Object
export const SystemConfigSchema = z.object({
	polymarket: PolyscanConfigSchema.default({}),
	pizza_radar: PizzaConfigSchema.default({}),
	oklink: OKLinkConfigSchema.default({}),
	solana: SolanaConfigSchema.default({}),
	telegram: TelegramConfigSchema.default({}),
	// Generic key-value store for other dynamic needs
	globals: z.record(z.string(), z.any()).default({}),
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;
