import {
  InMemoryStateAdapter,
  type ProcessingContext,
  type StateAdapter,
  StatefulNode,
} from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  isTypedImage,
  type NodeManifest,
  type TelegramImageMessage,
  type TypedImage,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

interface PendingMessage {
  image?: TypedImage;
  caption?: string;
  startedAt: number;
  lastActivityAt: number;
}

type WaitPolicy = "WAIT_BOTH" | "WAIT_ONLY_IMAGE" | "WAIT_ONLY_TEXT";

/**
 * TelegramImageMessageBuilder Node
 *
 * Builds a Telegram photo message by waiting for image and optional caption inputs.
 * Uses a SINGLE pending state (not per-traceId) so inputs from different sources combine.
 * Implements TTL-based waiting - if no new inputs arrive within TTL, emits timeout.
 */
export default class TelegramImageMessageBuilderNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  // Single pending message for the whole node (not per traceId!)
  private pending: PendingMessage | null = null;
  private timeoutHandle: Timer | null = null;

  constructor(
    id: UUID,
    config: Record<string, unknown> = {},
    stateAdapter?: StateAdapter,
  ) {
    super(id, config, stateAdapter || new InMemoryStateAdapter());
  }

  private getTTLMs(): number {
    const ttl = Number(this.config.ttlSeconds) || 64;
    return Math.min(Math.max(ttl, 1), 300) * 1000;
  }

  private getWaitPolicy(): WaitPolicy {
    const policy = this.config.waitPolicy as string;
    if (
      policy === "WAIT_BOTH" ||
      policy === "WAIT_ONLY_IMAGE" ||
      policy === "WAIT_ONLY_TEXT"
    ) {
      return policy;
    }
    return "WAIT_ONLY_IMAGE"; // default
  }

  private buildMessage(): TelegramImageMessage | null {
    if (!this.pending?.image) {
      return null;
    }
    return {
      type: "photo",
      photo: this.pending.image,
      caption: this.pending.caption,
      parseMode:
        (this.config.parseMode as TelegramImageMessage["parseMode"]) ||
        undefined,
      hasSpoiler: Boolean(this.config.hasSpoiler),
      silent: Boolean(this.config.silent),
    };
  }

  private clearPending() {
    this.pending = null;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private restartTimeout(context: ProcessingContext) {
    // Clear existing timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    this.timeoutHandle = setTimeout(() => {
      if (this.pending) {
        context.logger.warn("Input TTL expired", {
          hasImage: !!this.pending.image,
          hasCaption: this.pending.caption !== undefined,
          waitedMs: Date.now() - this.pending.startedAt,
          idleMs: Date.now() - this.pending.lastActivityAt,
        });

        // Emit timeout with partial data
        this.emit({
          timeout: new DataPacket({
            reason: "TTL_EXPIRED",
            ttlMs: this.getTTLMs(),
            hadImage: !!this.pending.image,
            hadCaption: this.pending.caption !== undefined,
            partialData: {
              image: this.pending.image ? "[image present]" : null,
              caption: this.pending.caption,
            },
          }),
        });

        this.clearPending();
      }
    }, this.getTTLMs());
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const waitPolicy = this.getWaitPolicy();

    // Get or create pending message (single instance for the node)
    if (!this.pending) {
      this.pending = {
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
      };
    }

    let receivedSomething = false;

    // Process image input
    const imageInput = inputs.image?.value;
    if (imageInput !== undefined) {
      receivedSomething = true;

      context.logger.info("Image input received", {
        type: typeof imageInput,
        keys:
          typeof imageInput === "object" && imageInput !== null
            ? Object.keys(imageInput)
            : [],
      });

      if (isTypedImage(imageInput)) {
        this.pending.image = imageInput;
        context.logger.info("Stored valid TypedImage", {
          mimeType: imageInput.mimeType,
          size: imageInput.size,
        });
      } else if (
        typeof imageInput === "object" &&
        imageInput !== null &&
        "data" in imageInput &&
        typeof (imageInput as Record<string, unknown>).data === "string"
      ) {
        // Accept image-like objects with relaxed typing
        const img = imageInput as Record<string, unknown>;
        const rawMime = (img.mimeType as string) || "image/png";
        const validMimes = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ] as const;
        const mimeType = validMimes.includes(
          rawMime as (typeof validMimes)[number],
        )
          ? (rawMime as TypedImage["mimeType"])
          : "image/png";
        this.pending.image = {
          data: img.data as string,
          mimeType,
          width: img.width as number | undefined,
          height: img.height as number | undefined,
          filename: img.filename as string | undefined,
          size: img.size as number | undefined,
        };
        context.logger.info("Stored image with relaxed typing", {
          mimeType,
        });
      } else {
        context.logger.warn("Invalid image input - expected TypedImage", {
          type: typeof imageInput,
        });
      }
    }

    // Process caption input
    const captionInput = inputs.caption?.value;
    if (captionInput !== undefined) {
      receivedSomething = true;
      this.pending.caption = String(captionInput);
      context.logger.info("Stored caption", {
        length: this.pending.caption.length,
      });
    }

    // Update activity timestamp and restart TTL
    if (receivedSomething) {
      this.pending.lastActivityAt = Date.now();
      this.restartTimeout(context);
    }

    // Check readiness based on wait policy
    const hasImage = !!this.pending.image;
    const hasCaption = this.pending.caption !== undefined;

    let isReady = false;
    switch (waitPolicy) {
      case "WAIT_BOTH":
        isReady = hasImage && hasCaption;
        break;
      case "WAIT_ONLY_IMAGE":
        isReady = hasImage;
        break;
      case "WAIT_ONLY_TEXT":
        isReady = hasCaption;
        break;
    }

    context.logger.info("Checking readiness", {
      waitPolicy,
      hasImage,
      hasCaption,
      isReady,
    });

    if (isReady) {
      const message = this.buildMessage();

      if (!message) {
        // WAIT_ONLY_TEXT but no image - emit error
        context.logger.warn("Cannot build image message without image");
        return {
          error: new DataPacket({
            code: "NO_IMAGE",
            message: "Caption received but no image available",
            caption: this.pending.caption,
          }),
        };
      }

      context.logger.info("Built Telegram image message", {
        hasCaption: !!message.caption,
        captionLength: message.caption?.length,
        policy: waitPolicy,
      });

      this.clearPending();

      return {
        message: new DataPacket(message),
      };
    }

    // Not ready yet - waiting for more inputs
    context.logger.info("Waiting for more inputs", {
      hasImage,
      hasCaption,
      waitPolicy,
      ttlRemainingMs: this.getTTLMs() - (Date.now() - this.pending.startedAt),
    });

    return {};
  }

  public override async dispose(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.pending = null;
    await super.dispose();
  }
}
