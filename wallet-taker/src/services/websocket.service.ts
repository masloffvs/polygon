/**
 * WebSocket Service
 * Manages WebSocket connection to the exchange
 */

import WebSocket from "ws";
import { logger } from "../logger";
import type { AppConfig } from "../config";

export interface TakerMessage {
  type: string;
  [key: string]: unknown;
}

export type MessageHandler = (message: TakerMessage) => void | Promise<void>;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private isAuthenticated = false;
  private shouldReconnect = true;
  private messageHandlers = new Map<string, MessageHandler[]>();

  constructor(private config: AppConfig) {}

  /**
   * Register message handler for specific type
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  /**
   * Connect to the exchange WebSocket
   */
  connect(): void {
    if (this.ws) {
      logger.warn("Already connecting/connected");
      return;
    }

    logger.info({ url: this.config.wsUrl }, "Connecting to exchange...");

    try {
      this.ws = new WebSocket(this.config.wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      logger.error({ error }, "Failed to create WebSocket");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the exchange
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client shutdown");
      this.ws = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;

    logger.info("Disconnected from exchange");
  }

  /**
   * Send message to the exchange
   */
  send(message: TakerMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ type: message.type }, "Cannot send - not connected");
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error({ error, type: message.type }, "Failed to send message");
      return false;
    }
  }

  /**
   * Check if authenticated and connected
   */
  isReady(): boolean {
    return this.isConnected && this.isAuthenticated;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info("WebSocket connected, waiting for handshake init...");
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data.toString());
    };

    this.ws.onclose = (event) => {
      logger.info({ code: event.code, reason: event.reason }, "WebSocket closed");
      this.handleDisconnect();
    };

    this.ws.onerror = (error) => {
      logger.error({ error }, "WebSocket error");
    };
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const message: TakerMessage = JSON.parse(raw);
      const type = message.type;

      logger.debug({ type }, "Received message");

      // Handle authentication messages internally
      if (type === "handshake_init") {
        this.handleHandshakeInit();
        return;
      }

      if (type === "handshake_complete") {
        this.handleHandshakeComplete(message);
        return;
      }

      if (type === "handshake_error") {
        this.handleHandshakeError(message);
        return;
      }

      if (type === "ping") {
        this.send({ type: "pong", ts: Date.now() });
        return;
      }

      if (type === "heartbeat_ack") {
        logger.debug("Heartbeat acknowledged");
        return;
      }

      // Dispatch to registered handlers
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          await handler(message);
        }
      } else {
        logger.debug({ type, message }, "No handler for message type");
      }
    } catch (error) {
      logger.error({ error, raw: raw.slice(0, 200) }, "Failed to parse message");
    }
  }

  private handleHandshakeInit(): void {
    logger.info("Received handshake init, authenticating...");
    this.send({
      type: "handshake",
      token: this.config.token,
    });
  }

  private handleHandshakeComplete(message: TakerMessage): void {
    this.isAuthenticated = true;

    logger.info(
      {
        tokenId: message.tokenId,
        tokenName: message.tokenName,
      },
      "🎉 Handshake complete! Connected and authenticated."
    );

    this.startHeartbeat();

    // Emit authenticated event
    const handlers = this.messageHandlers.get("authenticated");
    if (handlers) {
      for (const handler of handlers) {
        handler({ type: "authenticated" });
      }
    }
  }

  private handleHandshakeError(message: TakerMessage): void {
    logger.error({ message: message.message }, "Handshake failed");
    this.isAuthenticated = false;

    if (
      String(message.message).includes("Invalid") ||
      String(message.message).includes("inactive")
    ) {
      logger.error(
        "Token appears invalid. Check TAKER_TOKEN in .env or generate new token."
      );
      this.shouldReconnect = false;
      this.disconnect();
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isReady()) {
        this.send({ type: "heartbeat", ts: Date.now() });
      }
    }, this.config.heartbeatInterval);

    logger.debug({ interval: this.config.heartbeatInterval }, "Heartbeat started");
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.ws = null;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    this.reconnectAttempts++;

    const baseDelay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    logger.info(
      { attempt: this.reconnectAttempts, delay: Math.round(delay) },
      "Scheduling reconnect..."
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
