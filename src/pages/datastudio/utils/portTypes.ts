/**
 * Port Type Compatibility Utilities for Data Studio UI
 *
 * These utilities mirror the server-side type system and provide
 * visual feedback for valid/invalid connections in the graph editor.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BaseDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "signal"
  | "binary"
  | "any";

export type TypedDataType = `typed:${string}`;
export type DataType = BaseDataType | TypedDataType;

// ============================================================================
// KNOWN TYPED DATA TYPES
// ============================================================================

export const TYPED_DATA_TYPES = {
  // Media types
  IMAGE: "typed:image" as const,
  VIDEO: "typed:video" as const,
  AUDIO: "typed:audio" as const,
  DOCUMENT: "typed:document" as const,

  // Telegram types
  TELEGRAM_MESSAGE_REQUEST: "typed:telegram/message-request" as const,
  TELEGRAM_TEXT_MESSAGE: "typed:telegram/text-message" as const,
  TELEGRAM_IMAGE_MESSAGE: "typed:telegram/image-message" as const,
  TELEGRAM_DOCUMENT_MESSAGE: "typed:telegram/document-message" as const,
  TELEGRAM_SEND_RESULT: "typed:telegram/send-result" as const,

  // Financial types
  PRICE_TICK: "typed:market/price-tick" as const,
  ORDERBOOK: "typed:market/orderbook" as const,
  TRADE: "typed:market/trade" as const,
} as const;

// ============================================================================
// TYPE COMPATIBILITY
// ============================================================================

/**
 * Check if two port types are compatible for connection.
 *
 * Rules:
 *   - "any" is compatible with everything
 *   - Same type is always compatible
 *   - typed:X is compatible with "object" (backwards compatibility)
 *   - typed:telegram/* is compatible with typed:telegram/message-request (inheritance)
 */
export function areTypesCompatible(
  sourceType: DataType,
  targetType: DataType,
): boolean {
  // Any accepts everything
  if (targetType === "any" || sourceType === "any") return true;

  // Exact match
  if (sourceType === targetType) return true;

  // Typed to object (backwards compat)
  if (sourceType.startsWith("typed:") && targetType === "object") return true;

  // Typed inheritance: typed:telegram/image-message -> typed:telegram/message-request
  if (sourceType.startsWith("typed:") && targetType.startsWith("typed:")) {
    const sourceCategory = sourceType.split("/")[0]; // "typed:telegram"
    const targetCategory = targetType.split("/")[0];

    // Same category, target is base type (ends without subtype or is message-request)
    if (sourceCategory === targetCategory) {
      // typed:telegram/X -> typed:telegram/message-request
      if (targetType === `${targetCategory}/message-request`) return true;
      // typed:X -> typed:X (base typed without subtype)
      if (!targetType.includes("/") && sourceType.startsWith(targetType))
        return true;
    }
  }

  return false;
}

// ============================================================================
// TYPE DISPLAY
// ============================================================================

/**
 * Get human-readable display name for a data type.
 */
export function getTypeDisplayName(type: DataType): string {
  if (type.startsWith("typed:")) {
    const typeName = type.replace("typed:", "");
    return typeName
      .split(/[\/\-]/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Get short type name for compact display.
 */
export function getTypeShortName(type: DataType): string {
  if (type.startsWith("typed:")) {
    const parts = type.replace("typed:", "").split("/");
    return parts[parts.length - 1] ?? parts[0] ?? type;
  }
  return type;
}

// ============================================================================
// TYPE COLORS
// ============================================================================

/**
 * Get color for a data type (for port coloring).
 */
export function getTypeColor(type: DataType): string {
  if (type === "any") return "#6b7280"; // gray
  if (type === "string") return "#3b82f6"; // blue
  if (type === "number") return "#8b5cf6"; // purple
  if (type === "boolean") return "#10b981"; // green
  if (type === "object") return "#f97316"; // orange
  if (type === "array") return "#ec4899"; // pink
  if (type === "signal") return "#eab308"; // yellow
  if (type === "binary") return "#14b8a6"; // teal

  // Typed colors
  if (type.startsWith("typed:image")) return "#ec4899"; // pink
  if (type.startsWith("typed:video")) return "#ef4444"; // red
  if (type.startsWith("typed:audio")) return "#a855f7"; // purple
  if (type.startsWith("typed:telegram")) return "#0088cc"; // telegram blue
  if (type.startsWith("typed:market")) return "#22c55e"; // green

  return "#6b7280"; // default gray
}

/**
 * Get color with opacity for backgrounds.
 */
export function getTypeColorWithOpacity(type: DataType, opacity = 0.2): string {
  const color = getTypeColor(type);
  // Convert hex to rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ============================================================================
// TYPE ICONS
// ============================================================================

/**
 * Get Lucide icon name for a data type.
 */
export function getTypeIcon(type: DataType): string {
  if (type === "any") return "circle-dot";
  if (type === "string") return "type";
  if (type === "number") return "hash";
  if (type === "boolean") return "toggle-left";
  if (type === "object") return "braces";
  if (type === "array") return "list";
  if (type === "signal") return "zap";
  if (type === "binary") return "file-binary";

  // Typed icons
  if (type.startsWith("typed:image")) return "image";
  if (type.startsWith("typed:video")) return "video";
  if (type.startsWith("typed:audio")) return "music";
  if (type.startsWith("typed:document")) return "file";
  if (type.startsWith("typed:telegram")) return "send";
  if (type.startsWith("typed:market")) return "trending-up";

  return "circle";
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export interface PortInfo {
  nodeId: string;
  portName: string;
  type: DataType;
  isOutput: boolean;
}

/**
 * Check if a connection between two ports is valid.
 * Returns { valid: boolean, reason?: string }
 */
export function validateConnection(
  source: PortInfo,
  target: PortInfo,
): { valid: boolean; reason?: string } {
  // Can't connect node to itself
  if (source.nodeId === target.nodeId) {
    return { valid: false, reason: "Cannot connect a node to itself" };
  }

  // Must connect output to input
  if (!source.isOutput || target.isOutput) {
    return {
      valid: false,
      reason: "Must connect output port to input port",
    };
  }

  // Check type compatibility
  if (!areTypesCompatible(source.type, target.type)) {
    return {
      valid: false,
      reason: `Type mismatch: ${getTypeDisplayName(source.type)} → ${getTypeDisplayName(target.type)}`,
    };
  }

  return { valid: true };
}

/**
 * Get compatible types for a given source type.
 * Useful for highlighting valid drop targets.
 */
export function getCompatibleTypes(sourceType: DataType): DataType[] {
  const compatible: DataType[] = ["any"]; // any always accepts

  if (sourceType === "any") {
    // any can connect to anything
    return [
      "any",
      "string",
      "number",
      "boolean",
      "object",
      "array",
      "signal",
      "binary",
    ];
  }

  // Same type
  compatible.push(sourceType);

  // typed:X -> object
  if (sourceType.startsWith("typed:")) {
    compatible.push("object");

    // typed:telegram/X -> typed:telegram/message-request
    if (sourceType.startsWith("typed:telegram/")) {
      compatible.push("typed:telegram/message-request");
    }

    // Base typed without subtype
    const basePart = sourceType.split("/")[0];
    if (basePart !== sourceType) {
      compatible.push(basePart as DataType);
    }
  }

  return compatible;
}
