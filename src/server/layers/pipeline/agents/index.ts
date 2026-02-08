/**
 * Loader for Exported Agents
 *
 * This file imports all ExportedAgent implementations,
 * triggering their self-registration.
 *
 * Add new agents here to make them available in DataStudio.
 */

// Import agents - each one self-registers via registerExportedAgent()
import "./any2text";
import "./embedding_compare";
import "./llm_chat";
import "./replicate";
import "./strict_typizer";
import "./vector_search";
import "./vector_store";

// Re-export the registration function for use in application.ts
export { registerAgentsToNodeRegistry } from "../exported_agent";

console.log("[AgentLoader] Exported agents loaded");
