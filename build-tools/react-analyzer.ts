#!/usr/bin/env bun
/**
 * React Component Analyzer
 *
 * Features:
 * - Find unused components
 * - Build dependency graph
 * - Show where components are used
 *
 * Usage:
 *   bun build-tools/react-analyzer.ts [--unused] [--deps] [--graph] [--component=Name]
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

const SRC_DIR = join(import.meta.dir, "../src");

interface ComponentInfo {
  name: string;
  filePath: string;
  isDefault: boolean;
  exportedAs: string[];
}

interface FileAnalysis {
  filePath: string;
  exports: ComponentInfo[];
  imports: Map<string, string[]>; // file -> imported names
  usedComponents: Set<string>;
}

interface DependencyGraph {
  [componentName: string]: {
    file: string;
    usedBy: string[];
    uses: string[];
    usageCount: number;
  };
}

// Colors for terminal
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function c(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Recursively find all TSX/JSX files
 */
async function findReactFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, etc.
        if (
          !["node_modules", "dist", ".git", "build", "coverage"].includes(
            entry.name,
          )
        ) {
          await scan(fullPath);
        }
      } else if ([".tsx", ".jsx"].includes(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

/**
 * Extract component exports from a file
 */
function extractExports(content: string, filePath: string): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  const fileName = basename(filePath, extname(filePath));

  // Match: export default function ComponentName
  // Match: export default ComponentName
  // Match: export const ComponentName = ...
  // Match: export function ComponentName
  // Match: export { ComponentName }

  // Default export patterns
  const defaultFuncMatch = content.match(/export\s+default\s+function\s+(\w+)/);
  const defaultConstMatch = content.match(
    /export\s+default\s+(?:class\s+)?(\w+)/,
  );

  // For files like index.tsx that might export a component
  const functionComponentMatch = content.match(
    /(?:const|function)\s+(\w+)\s*(?::\s*React\.FC|=\s*\([^)]*\)\s*(?::\s*\w+)?\s*=>|\s*\([^)]*\)\s*{)/,
  );

  if (defaultFuncMatch) {
    components.push({
      name: defaultFuncMatch[1],
      filePath,
      isDefault: true,
      exportedAs: [defaultFuncMatch[1]],
    });
  } else if (defaultConstMatch && isComponentName(defaultConstMatch[1])) {
    components.push({
      name: defaultConstMatch[1],
      filePath,
      isDefault: true,
      exportedAs: [defaultConstMatch[1]],
    });
  }

  // Named exports: export const ComponentName = ...
  const namedExportRegex = /export\s+(?:const|function|class)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    if (isComponentName(match[1])) {
      components.push({
        name: match[1],
        filePath,
        isDefault: false,
        exportedAs: [match[1]],
      });
    }
  }

  // Export { Name } or export { Name as Alias }
  const exportBracesRegex = /export\s*{\s*([^}]+)\s*}/g;
  while ((match = exportBracesRegex.exec(content)) !== null) {
    const exports = match[1].split(",").map((e) => e.trim());
    for (const exp of exports) {
      const [name, alias] = exp.split(/\s+as\s+/).map((s) => s.trim());
      if (isComponentName(alias || name)) {
        components.push({
          name: alias || name,
          filePath,
          isDefault: false,
          exportedAs: [alias || name],
        });
      }
    }
  }

  return components;
}

/**
 * Check if name looks like a React component (PascalCase)
 */
function isComponentName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Extract imports and component usage from a file
 */
function extractImportsAndUsage(
  content: string,
  filePath: string,
): { imports: Map<string, string[]>; usedComponents: Set<string> } {
  const imports = new Map<string, string[]>();
  const usedComponents = new Set<string>();

  // Match import statements
  const importRegex =
    /import\s+(?:{([^}]+)}|(\w+)(?:\s*,\s*{([^}]+)})?)\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const namedImports = match[1] || match[3];
    const defaultImport = match[2];
    const importPath = match[4];

    const importedNames: string[] = [];

    if (defaultImport && isComponentName(defaultImport)) {
      importedNames.push(defaultImport);
    }

    if (namedImports) {
      const names = namedImports.split(",").map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });
      importedNames.push(...names.filter(isComponentName));
    }

    if (importedNames.length > 0) {
      imports.set(importPath, importedNames);
    }
  }

  // Find JSX usage: <ComponentName or <ComponentName.Sub
  const jsxRegex = /<([A-Z][a-zA-Z0-9]*(?:\.[A-Z][a-zA-Z0-9]*)?)/g;
  while ((match = jsxRegex.exec(content)) !== null) {
    usedComponents.add(match[1].split(".")[0]);
  }

  return { imports, usedComponents };
}

/**
 * Analyze all React files
 */
async function analyzeProject(): Promise<{
  files: Map<string, FileAnalysis>;
  allComponents: Map<string, ComponentInfo>;
}> {
  const reactFiles = await findReactFiles(SRC_DIR);
  const files = new Map<string, FileAnalysis>();
  const allComponents = new Map<string, ComponentInfo>();

  for (const filePath of reactFiles) {
    const content = await readFile(filePath, "utf-8");

    const exports = extractExports(content, filePath);
    const { imports, usedComponents } = extractImportsAndUsage(
      content,
      filePath,
    );

    files.set(filePath, {
      filePath,
      exports,
      imports,
      usedComponents,
    });

    for (const comp of exports) {
      allComponents.set(comp.name, comp);
    }
  }

  return { files, allComponents };
}

/**
 * Build dependency graph
 */
function buildDependencyGraph(
  files: Map<string, FileAnalysis>,
  allComponents: Map<string, ComponentInfo>,
): DependencyGraph {
  const graph: DependencyGraph = {};

  // Initialize graph with all components
  for (const [name, info] of allComponents) {
    graph[name] = {
      file: relative(SRC_DIR, info.filePath),
      usedBy: [],
      uses: [],
      usageCount: 0,
    };
  }

  // Build relationships
  for (const [filePath, analysis] of files) {
    const fileComponents = analysis.exports.map((e) => e.name);

    for (const usedComp of analysis.usedComponents) {
      if (graph[usedComp]) {
        // This file uses usedComp
        for (const fc of fileComponents) {
          if (fc !== usedComp && !graph[usedComp].usedBy.includes(fc)) {
            graph[usedComp].usedBy.push(fc);
            graph[usedComp].usageCount++;
          }
          if (!graph[fc].uses.includes(usedComp)) {
            graph[fc].uses.push(usedComp);
          }
        }

        // If no component exports, count by file
        if (fileComponents.length === 0) {
          const fileName = basename(filePath, extname(filePath));
          if (!graph[usedComp].usedBy.includes(`[${fileName}]`)) {
            graph[usedComp].usedBy.push(`[${fileName}]`);
            graph[usedComp].usageCount++;
          }
        }
      }
    }
  }

  return graph;
}

/**
 * Find unused components
 */
function findUnusedComponents(graph: DependencyGraph): string[] {
  const unused: string[] = [];

  for (const [name, info] of Object.entries(graph)) {
    // Skip components that are entry points (App, pages, etc.)
    if (
      ["App", "Frontend"].includes(name) ||
      info.file.includes("pages/") ||
      info.file.includes("stories/")
    ) {
      continue;
    }

    if (info.usageCount === 0) {
      unused.push(name);
    }
  }

  return unused.sort();
}

/**
 * Print component info
 */
function printComponentInfo(name: string, graph: DependencyGraph) {
  const info = graph[name];
  if (!info) {
    console.log(c("red", `Component "${name}" not found`));
    return;
  }

  console.log(c("bold", `\n📦 ${name}`));
  console.log(c("gray", `   File: ${info.file}`));
  console.log(c("cyan", `   Used by (${info.usedBy.length}):`));
  for (const user of info.usedBy.slice(0, 10)) {
    console.log(`      • ${user}`);
  }
  if (info.usedBy.length > 10) {
    console.log(c("gray", `      ... and ${info.usedBy.length - 10} more`));
  }
  console.log(c("magenta", `   Uses (${info.uses.length}):`));
  for (const dep of info.uses.slice(0, 10)) {
    console.log(`      • ${dep}`);
  }
  if (info.uses.length > 10) {
    console.log(c("gray", `      ... and ${info.uses.length - 10} more`));
  }
}

/**
 * Print ASCII dependency tree
 */
function printDependencyTree(
  name: string,
  graph: DependencyGraph,
  depth = 0,
  visited = new Set<string>(),
) {
  const indent = "  ".repeat(depth);
  const prefix = depth === 0 ? "🌳 " : "├─ ";

  if (visited.has(name)) {
    console.log(`${indent}${prefix}${c("gray", `${name} (circular)`)}`);
    return;
  }

  visited.add(name);
  const info = graph[name];

  if (!info) {
    console.log(`${indent}${prefix}${c("yellow", name)} (external)`);
    return;
  }

  console.log(`${indent}${prefix}${c("cyan", name)}`);

  if (depth < 3) {
    for (const dep of info.uses) {
      printDependencyTree(dep, graph, depth + 1, new Set(visited));
    }
  } else if (info.uses.length > 0) {
    console.log(`${indent}  └─ ${c("gray", `... ${info.uses.length} more`)}`);
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  const showUnused = args.includes("--unused") || args.length === 0;
  const showDeps = args.includes("--deps");
  const showGraph = args.includes("--graph");
  const generateRmCommands = args.includes("--generate-rm-commands-list");
  const componentArg = args.find((a) => a.startsWith("--component="));
  const targetComponent = componentArg?.split("=")[1];

  console.log(c("bold", "\n🔍 React Component Analyzer\n"));
  console.log(c("gray", `Scanning: ${SRC_DIR}\n`));

  const { files, allComponents } = await analyzeProject();
  const graph = buildDependencyGraph(files, allComponents);

  console.log(
    c(
      "green",
      `Found ${allComponents.size} components in ${files.size} files\n`,
    ),
  );

  // Show specific component
  if (targetComponent) {
    printComponentInfo(targetComponent, graph);
    console.log(c("bold", "\n📊 Dependency Tree:"));
    printDependencyTree(targetComponent, graph);
    return;
  }

  // Show unused components
  if (showUnused) {
    const unused = findUnusedComponents(graph);
    console.log(c("bold", `\n🗑️  Unused Components (${unused.length}):\n`));

    if (unused.length === 0) {
      console.log(c("green", "   No unused components found! 🎉"));
    } else {
      for (const name of unused) {
        const info = graph[name];
        console.log(`   ${c("red", "•")} ${c("yellow", name)}`);
        console.log(c("gray", `     ${info.file}`));
      }
    }

    // Generate safe removal commands
    if (generateRmCommands && unused.length > 0) {
      const projectId = basename(SRC_DIR.replace("/src", ""));
      const trashDir = `~/.trashcomponents/${projectId}`;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      console.log(c("bold", `\n📦 Safe Removal Commands:\n`));
      console.log(
        c(
          "gray",
          "# Copy and run these commands to safely move unused components to trash\n",
        ),
      );

      console.log(`# Create trash directory`);
      console.log(`mkdir -p ${trashDir}/${timestamp}\n`);

      // Group files by directory to avoid moving same file multiple times
      const filesToMove = new Set<string>();
      for (const name of unused) {
        const info = graph[name];
        filesToMove.add(info.file);
      }

      console.log(`# Move unused component files`);
      for (const file of filesToMove) {
        const srcPath = `src/${file}`;
        console.log(`mv ${srcPath} ${trashDir}/${timestamp}/`);
      }

      console.log(c("gray", `\n# To restore, run:`));
      console.log(c("gray", `# mv ${trashDir}/${timestamp}/* src/\n`));

      console.log(
        c(
          "yellow",
          `⚠️  Review the list before running! Some components may be dynamically imported.\n`,
        ),
      );
    }
  }

  // Show dependency stats
  if (showDeps) {
    console.log(c("bold", "\n📊 Most Used Components:\n"));

    const sorted = Object.entries(graph)
      .sort((a, b) => b[1].usageCount - a[1].usageCount)
      .slice(0, 20);

    for (const [name, info] of sorted) {
      const bar = "█".repeat(Math.min(info.usageCount, 30));
      console.log(
        `   ${c("cyan", name.padEnd(30))} ${c("green", bar)} ${info.usageCount}`,
      );
    }

    console.log(c("bold", "\n📦 Components with Most Dependencies:\n"));

    const sortedByDeps = Object.entries(graph)
      .sort((a, b) => b[1].uses.length - a[1].uses.length)
      .slice(0, 15);

    for (const [name, info] of sortedByDeps) {
      console.log(
        `   ${c("magenta", name.padEnd(30))} uses ${info.uses.length} components`,
      );
    }
  }

  // Show full graph
  if (showGraph) {
    console.log(c("bold", "\n🌐 Full Dependency Graph:\n"));

    for (const [name, info] of Object.entries(graph)) {
      if (info.uses.length > 0 || info.usedBy.length > 0) {
        console.log(`${c("cyan", name)} (${info.file})`);
        if (info.uses.length > 0) {
          console.log(c("gray", `  → uses: ${info.uses.join(", ")}`));
        }
        if (info.usedBy.length > 0) {
          console.log(c("gray", `  ← used by: ${info.usedBy.join(", ")}`));
        }
        console.log();
      }
    }
  }

  // Help
  if (args.includes("--help")) {
    console.log(`
${c("bold", "Usage:")}
  bun build-tools/react-analyzer.ts [options]

${c("bold", "Options:")}
  --unused                    Show unused components (default)
  --generate-rm-commands-list Generate safe mv commands to trash unused files
  --deps                      Show dependency statistics
  --graph                     Show full dependency graph
  --component=Name            Show info for specific component
  --help                      Show this help

${c("bold", "Examples:")}
  bun build-tools/react-analyzer.ts --unused
  bun build-tools/react-analyzer.ts --unused --generate-rm-commands-list
  bun build-tools/react-analyzer.ts --component=Dashboard
  bun build-tools/react-analyzer.ts --deps --unused
`);
  }
}

main().catch(console.error);
