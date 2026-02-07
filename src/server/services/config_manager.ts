import path from "node:path";
import { file, write } from "bun";
import yaml from "js-yaml";
import {
	type SystemConfig,
	SystemConfigSchema,
} from "../schemas/system_config";
import { logger } from "../utils/logger";

const CONFIG_PATH = path.resolve(process.cwd(), "user_files", "config.yaml");

export class ConfigManager {
	private static instance: ConfigManager;
	private config: SystemConfig | null = null;

	private constructor() {}

	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Load configuration from disk.
	 * If file doesn't exist, returns default config (and optionally writes it).
	 */
	public async load(): Promise<SystemConfig> {
		const f = file(CONFIG_PATH);
		const exists = await f.exists();

		if (!exists) {
			logger.info(
				{ path: CONFIG_PATH },
				"Config file not found, creating default.",
			);
			const defaultConfig = SystemConfigSchema.parse({});
			await this.save(defaultConfig);
			this.config = defaultConfig;
			return defaultConfig;
		}

		try {
			const text = await f.text();
			const raw = yaml.load(text);

			// Validate with Zod
			const result = SystemConfigSchema.safeParse(raw);
			if (!result.success) {
				logger.error(
					{ errors: result.error.format() },
					"Config validation failed",
				);
				throw new Error("Invalid configuration file");
			}

			this.config = result.data;
			return this.config;
		} catch (err) {
			logger.error({ err }, "Failed to load config");
			const defaultConfig = SystemConfigSchema.parse({});
			this.config = defaultConfig;
			return defaultConfig;
		}
	}

	/**
	 * Get current config (cached).
	 */
	public getConfig(): SystemConfig {
		if (!this.config) {
			throw new Error("Config not loaded. Call load() first.");
		}
		return this.config;
	}

	/**
	 * Save new configuration.
	 * Accepts raw YAML string or object.
	 */
	public async update(content: string | SystemConfig): Promise<SystemConfig> {
		let newConfig: SystemConfig;

		if (typeof content === "string") {
			// Parse YAML first
			const raw = yaml.load(content);
			newConfig = SystemConfigSchema.parse(raw);
		} else {
			newConfig = SystemConfigSchema.parse(content);
		}

		// Write to disk
		await this.save(newConfig);
		this.config = newConfig;

		logger.info("Configuration updated successfully");
		return this.config;
	}

	private async save(data: SystemConfig) {
		const yamlStr = yaml.dump(data, { indent: 2 });
		await write(CONFIG_PATH, yamlStr);
	}

	/**
	 * Get raw YAML string (for UI editor)
	 */
	public async getRawYaml(): Promise<string> {
		if (!this.config) await this.load();
		return yaml.dump(this.config, { indent: 2 });
	}
}

export const configManager = ConfigManager.getInstance();
