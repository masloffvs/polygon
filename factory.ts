#!/usr/bin/env bun

/**
 * Factory CLI for generating sources, adapters, stages, etc.
 *
 * Usage:
 *   bun ./factory.ts createSource <name>
 *
 * Example:
 *   bun ./factory.ts createSource test
 *   -> creates src/server/layers/sources/test.ts
 */

const args = Bun.argv.slice(2);
const command = args[0];
const name = args[1];

function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function toPascalCase(str: string): string {
	return str.split(/[-_]/).map(capitalize).join("");
}

function toKebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();
}

const sourceTemplate = (name: string) => {
	const className = `${toPascalCase(name)}Source`;
	const configName = `${toPascalCase(name)}Config`;
	const sourceId = `${toKebabCase(name)}-source`;

	return `import { logger } from "../../utils/logger";
import { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface ${configName} extends SourceConfig {
  // Add your custom config fields here
}

export class ${className} extends BaseSource {
  constructor(
    config: Omit<${configName}, "id" | "name" | "description"> &
      Partial<SourceConfig>,
    aggregator: AggregatorLayer,
  ) {
    super(
      {
        id: "${sourceId}",
        name: "${toPascalCase(name)} Data",
        description: "${toPascalCase(name)} data source",
        ...config,
      },
      aggregator,
    );
  }

  public async connect(): Promise<void> {
    logger.info({ source: this.id }, "Connecting to ${toPascalCase(name)}...");

    // TODO: Implement connection logic
    // Example WebSocket:
    // this.ws = new WebSocket(url);
    // this.ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   this.emit(data);
    // };

    logger.info({ source: this.id }, "${toPascalCase(name)} connection established");
  }

  public disconnect(): void {
    // TODO: Implement disconnect logic
    logger.info({ source: this.id }, "${toPascalCase(name)} disconnected");
  }
}
`;
};

async function createSource(name: string) {
	if (!name) {
		console.error("❌ Error: Source name is required");
		console.log("Usage: bun ./factory.ts createSource <name>");
		process.exit(1);
	}

	const fileName = toKebabCase(name);
	const filePath = `src/server/layers/sources/${fileName}.ts`;

	// Check if file already exists
	const file = Bun.file(filePath);
	if (await file.exists()) {
		console.error(`❌ Error: File already exists: ${filePath}`);
		process.exit(1);
	}

	const content = sourceTemplate(name);
	await Bun.write(filePath, content);

	console.log(`✅ Created source: ${filePath}`);
	console.log(`   Class: ${toPascalCase(name)}Source`);
	console.log(`   ID: ${toKebabCase(name)}-source`);
}

function showHelp() {
	console.log(`
Factory CLI - Generate boilerplate code

Commands:
  createSource <name>    Create a new source in src/server/layers/sources/

Examples:
  bun ./factory.ts createSource test
  bun ./factory.ts createSource myExchange
  bun ./factory.ts createSource my-data-feed

Options:
  --help, -h    Show this help message
`);
}

async function main() {
	if (!command || command === "--help" || command === "-h") {
		showHelp();
		process.exit(0);
	}

	switch (command) {
		case "createSource":
			await createSource(name);
			break;
		default:
			console.error(`❌ Unknown command: ${command}`);
			showHelp();
			process.exit(1);
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
