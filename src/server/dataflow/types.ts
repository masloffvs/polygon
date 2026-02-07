/**
 * Semantic version string (e.g. "1.0.0")
 */
export type SemVer = string;

/**
 * Unique identifier for nodes, edges, and traces.
 */
export type UUID = string;

// ============================================================================
// TYPED DATA INTERFACES
// These define the structure for typed:* port types
// ============================================================================

/**
 * Image data structure for typed:image ports.
 */
export interface TypedImage {
  /** Base64 encoded image data (without data:image prefix) */
  data: string;
  base64?: string; // alternative field name
  /** MIME type: image/png, image/jpeg, image/webp, image/gif */
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Original filename if available */
  filename?: string;
  /** File size in bytes */
  size?: number;
}

/**
 * Base Telegram message request (typed:telegram/message-request).
 * All telegram message types extend this.
 */
export interface TelegramMessageRequest {
  /** Message type discriminator */
  type:
    | "text"
    | "photo"
    | "document"
    | "video"
    | "audio"
    | "animation"
    | "sticker";
  /** Chat ID to send to (overrides node config if set) */
  chatId?: string | number;
  /** Parse mode: HTML, Markdown, MarkdownV2 */
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  /** Send silently without notification */
  silent?: boolean;
  /** Reply to message ID */
  replyToMessageId?: number;
  /** Protect content from forwarding/saving */
  protectContent?: boolean;
}

/**
 * Text message request (typed:telegram/text-message).
 */
export interface TelegramTextMessage extends TelegramMessageRequest {
  type: "text";
  /** Message text (up to 4096 characters) */
  text: string;
  /** Disable link previews */
  disableWebPagePreview?: boolean;
}

/**
 * Photo message request (typed:telegram/image-message).
 */
export interface TelegramImageMessage extends TelegramMessageRequest {
  type: "photo";
  /** Image data - TypedImage object or URL string */
  photo: TypedImage | string;
  /** Caption text (up to 1024 characters) */
  caption?: string;
  /** Show caption above media */
  showCaptionAboveMedia?: boolean;
  /** Has spoiler blur */
  hasSpoiler?: boolean;
}

/**
 * Document message request (typed:telegram/document-message).
 */
export interface TelegramDocumentMessage extends TelegramMessageRequest {
  type: "document";
  /** Document data - base64 or URL */
  document: string;
  /** Document MIME type */
  mimeType?: string;
  /** Filename to display */
  filename?: string;
  /** Caption text */
  caption?: string;
  /** Thumbnail image */
  thumbnail?: TypedImage;
}

/**
 * Result from sending a Telegram message (typed:telegram/send-result).
 */
export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  chatId?: number | string;
  timestamp?: number;
  error?: string;
  errorCode?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isTypedImage(value: unknown): value is TypedImage {
  return (
    typeof value === "object" &&
    value !== null &&
    ("data" in value || "base64" in value) &&
    "mimeType" in value &&
    (typeof (value as TypedImage).data === "string" ||
      typeof (value as TypedImage).base64 === "string") &&
    typeof (value as TypedImage).mimeType === "string"
  );
}

export function isTelegramMessageRequest(
  value: unknown,
): value is TelegramMessageRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    [
      "text",
      "photo",
      "document",
      "video",
      "audio",
      "animation",
      "sticker",
    ].includes((value as TelegramMessageRequest).type)
  );
}

export function isTelegramImageMessage(
  value: unknown,
): value is TelegramImageMessage {
  return (
    isTelegramMessageRequest(value) &&
    value.type === "photo" &&
    "photo" in value
  );
}

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Standardized Error Packet for enterprise-grade resilience.
 * Allows routing errors to Dead Letter Queues or UI notifications.
 */
export interface ErrorPacket {
  code: string; // E.g., "HTTP_TIMEOUT", "VALIDATION_ERROR"
  message: string; // Human-readable message
  nodeId: UUID; // Which node caused the error
  traceId: UUID; // Correlation ID for tracing
  timestamp: number;
  recoverable: boolean; // Can we retry this operation?
  details?: any; // Stack trace or raw error object
}

/**
 * The Contract between nodes.
 * Every piece of data flowing in the graph MUST be a DataPacket.
 */
export class DataPacket<T = any> {
  public readonly id: UUID;
  public readonly traceId: UUID;
  public readonly timestamp: number;
  public readonly schemaVersion: SemVer;
  public readonly originNodeId: UUID | null;

  // The main payload
  public value: T;

  // For passing heavy data like file streams, ML tensors, or raw buffer references
  // This prevents serializing huge objects into JSON if not needed immediately
  public binaryValue?: ReadableStream | Buffer | Blob;

  constructor(
    value: T,
    meta: {
      traceId?: UUID;
      originNodeId?: UUID;
      schemaVersion?: SemVer;
      binaryValue?: ReadableStream | Buffer | Blob;
    } = {},
  ) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.timestamp = Date.now();
    this.traceId = meta.traceId || crypto.randomUUID();
    this.originNodeId = meta.originNodeId || null;
    this.schemaVersion = meta.schemaVersion || "1.0.0";
    this.binaryValue = meta.binaryValue;
  }

  /**
   * Clone the packet with new metadata, preserving the trace context.
   */
  public cloneWith(value: any, newOrigin?: UUID): DataPacket {
    return new DataPacket(value, {
      traceId: this.traceId,
      originNodeId: newOrigin || this.originNodeId || undefined,
      schemaVersion: this.schemaVersion,
      binaryValue: this.binaryValue,
    });
  }
}

/**
 * Base data types in the Data Studio Runtime.
 */
export type BaseDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "signal" // Empty trigger packet
  | "binary" // Stream/Buffer
  | "any";

/**
 * Typed data types for strict port compatibility.
 * Format: "typed:<category>/<subtype>"
 * Examples:
 *   - "typed:image" - Base64 PNG/JPG image
 *   - "typed:telegram/message-request" - Telegram API request object
 *   - "typed:telegram/image-message" - Telegram photo message request
 */
export type TypedDataType = `typed:${string}`;

/**
 * All supported data types in the Data Studio Runtime.
 */
export type DataType = BaseDataType | TypedDataType;

/**
 * Known typed data types for type-safe usage.
 */
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

/**
 * Check if two port types are compatible for connection.
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

/**
 * Get display name for a data type (for UI).
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
 * Get color for a data type (for UI port coloring).
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
  if (type.startsWith("typed:telegram")) return "#0088cc"; // telegram blue
  if (type.startsWith("typed:market")) return "#22c55e"; // green

  return "#6b7280"; // default gray
}

/**
 * Port definition matching schema.json structure.
 */
export interface PortDefinition {
  name: string;
  type: DataType;
  required?: boolean;
  description?: string;
  schema?: any; // JSON Schema or Zod definition for deeper validation
}

/**
 * Runtime Execution Configuration for a Node
 */
export interface NodeExecutionConfig {
  timeoutMs?: number;
  retry?: number;
  recoverable?: boolean; // If false, error stops execution flow
  maxConcurrency?: number; // How many instances of this node can run in parallel
}

/**
 * UI Configuration for a Node
 */
export interface NodeUIConfig {
  color?: string;
  icon?: string;
  label?: string;
  resizable?: boolean;
  description?: string;
}

/**
 * The Complete Node Manifest (schema.json structure)
 */
export interface NodeManifest {
  id: string; // Type ID (e.g., "http-request")
  version: SemVer;
  category: string;
  name: string;
  description: string;

  compatibility?: {
    minRuntime: SemVer;
  };

  ui: NodeUIConfig;
  execution: NodeExecutionConfig;

  ports: {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
  };

  settings?: {
    name: string;
    type: string;
    label: string;
    defaultValue?: any;
    options?: string[]; // For enums
    required?: boolean;
  }[];
}
