import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type TypedImage,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

// Imagen service URL (runs on port 3000 by default)
const IMAGEN_SERVICE_URL = process.env.IMAGEN_URL || "http://localhost:3000";

interface TemplateInfo {
  id: string;
  name?: string;
  description?: string;
}

/**
 * Imagen Node
 *
 * Generates images from templates using the Imagen service (Satori/Resvg).
 * Takes data input and produces a TypedImage output.
 */
export default class ImagenNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
  }

  /**
   * Static method to list available templates
   */
  static async listTemplates(): Promise<string[]> {
    try {
      const response = await fetch(`${IMAGEN_SERVICE_URL}/templates`);
      if (!response.ok) {
        throw new Error(`Failed to list templates: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error("Failed to list Imagen templates:", err);
      return [];
    }
  }

  /**
   * Static method to get template schema
   */
  static async getTemplateSchema(templateId: string): Promise<any> {
    try {
      const response = await fetch(
        `${IMAGEN_SERVICE_URL}/templates/${templateId}`,
      );
      if (!response.ok) {
        throw new Error(`Template ${templateId} not found`);
      }
      return await response.json();
    } catch (err) {
      console.error(`Failed to get template schema for ${templateId}:`, err);
      return null;
    }
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const dataInput = inputs.data?.value;
    const templateId = this.config.template as string;

    if (!templateId) {
      return {
        error: new DataPacket({
          code: "NO_TEMPLATE",
          message: "No template selected. Configure template in node settings.",
          timestamp: Date.now(),
        }),
      };
    }

    // If no data input, use empty object (template defaults)
    const data = dataInput ?? {};

    context.logger.info("Generating image", {
      template: templateId,
      hasData: !!dataInput,
    });

    try {
      // Call Imagen service
      const response = await fetch(
        `${IMAGEN_SERVICE_URL}/generate/${templateId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        context.logger.error("Imagen generation failed", {
          status: response.status,
          error: errorText,
        });

        return {
          error: new DataPacket({
            code: "GENERATION_FAILED",
            message: `Image generation failed: ${errorText}`,
            template: templateId,
            status: response.status,
            timestamp: Date.now(),
          }),
        };
      }

      // Get the PNG buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Convert to base64
      const base64 = buffer.toString("base64");

      // Build TypedImage
      const image: TypedImage = {
        data: base64,
        mimeType: "image/png",
        size: buffer.length,
        // Width/height could be extracted from PNG header, but we don't have it easily
        // The service could return these in headers if needed
      };

      context.logger.info("Image generated successfully", {
        template: templateId,
        size: image.size,
      });

      return {
        image: new DataPacket(image),
      };
    } catch (err: any) {
      context.logger.error("Imagen request failed", { error: err.message });

      return {
        error: new DataPacket({
          code: "REQUEST_FAILED",
          message: `Failed to contact Imagen service: ${err.message}`,
          template: templateId,
          timestamp: Date.now(),
        }),
      };
    }
  }
}
