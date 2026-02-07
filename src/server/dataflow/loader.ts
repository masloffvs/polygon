import fs from "node:fs/promises";
import path from "node:path";
import { DataFlowNode } from "./Node";
import type { NodeRegistry } from "./registry";
import type { NodeManifest } from "./types";

/**
 * recursive function to find all node directories
 */
async function findNodeDirectories(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const results: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// Check if this directory contains a schema.json
			const hasSchema = await fileExists(path.join(fullPath, "schema.json"));
			if (hasSchema) {
				results.push(fullPath);
			} else {
				// Recurse deeper
				results.push(...(await findNodeDirectories(fullPath)));
			}
		}
	}
	return results;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Main Loader Function.
 * Scans the directory, loads schemas, imports logic, and registers nodes.
 */
export async function loadDataFlowNodes(
	registry: NodeRegistry,
	rootPath: string,
): Promise<void> {
	console.log(`[NodeLoader] Scanning for nodes in: ${rootPath}`);

	try {
		const nodeDirs = await findNodeDirectories(rootPath);

		for (const dir of nodeDirs) {
			try {
				// 1. Read Schema
				const schemaPath = path.join(dir, "schema.json");
				const schemaRaw = await fs.readFile(schemaPath, "utf-8");
				const manifest = JSON.parse(schemaRaw) as NodeManifest;

				// 2. Import Logic
				// We assume index.ts, index.tsx or index.js exists
				// Dynamic import needs absolute path or relative to this file
				// Using absolute path is safer
				let logicModule;
				const tsxPath = path.join(dir, "index.tsx");
				const tsPath = path.join(dir, "index.ts");

				if (await fileExists(tsxPath)) {
					logicModule = await import(tsxPath);
				} else {
					logicModule = await import(tsPath);
				}

				// Find the exported class that extends DataFlowNode
				const NodeClass = Object.values(logicModule).find(
					(exported: any) => exported?.prototype instanceof DataFlowNode,
				) as new (
					id: string,
					config: any,
				) => DataFlowNode;

				if (!NodeClass) {
					console.warn(`[NodeLoader] No DataFlowNode class found in ${dir}`);
					continue;
				}

				// 3. Register
				registry.register(manifest, NodeClass);
			} catch (err: any) {
				console.error(
					`[NodeLoader] Failed to load node at ${dir}:`,
					err.message,
				);
			}
		}

		console.log(
			`[NodeLoader] Initialization complete. Total nodes: ${registry.getManifests().length}`,
		);
	} catch (err) {
		console.error(`[NodeLoader] Fatal error during scanning:`, err);
	}
}
