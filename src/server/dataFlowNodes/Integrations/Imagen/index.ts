import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type TypedImage,
  type UUID,
} from "../../../dataflow/types";
import { Resvg } from "@resvg/resvg-js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import satori from "satori";
import manifest from "./schema.json";

const IMAGEN_SERVICE_URL = process.env.IMAGEN_URL?.trim() || null;
const LOCAL_TEMPLATES_DIR = join(import.meta.dir, "../../../../imagen/templates");

interface TemplateInfo {
  id: string;
  name?: string;
  description?: string;
}

interface TemplateFontConfig {
  name: string;
  url: string;
  weight?: number;
  style?: "normal" | "italic";
}

interface TemplateRuntimeConfig {
  width?: number;
  height?: number;
  fonts?: TemplateFontConfig[];
}

interface TemplateModule {
  default: unknown;
  config?: TemplateRuntimeConfig;
}

const isTemplateInfoArray = (value: unknown): value is TemplateInfo[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof (item as TemplateInfo).id === "string",
  );

const parseTemplateList = (raw: unknown): string[] => {
  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    return raw;
  }

  if (isTemplateInfoArray(raw)) {
    return raw.map((item) => item.id);
  }

  throw new Error("Unexpected templates payload format");
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const preview = (await response.text()).slice(0, 200);
    throw new Error(
      `Expected JSON but got '${contentType || "unknown"}': ${preview}`,
    );
  }

  return (await response.json()) as T;
};

const listLocalTemplates = async (): Promise<string[]> => {
  const items = await readdir(LOCAL_TEMPLATES_DIR, { withFileTypes: true });
  return items.filter((item) => item.isDirectory()).map((item) => item.name);
};

const getLocalTemplateSchema = async (templateId: string): Promise<unknown> => {
  const schemaPath = join(LOCAL_TEMPLATES_DIR, templateId, "schema.json");
  return await Bun.file(schemaPath).json();
};

const generateLocalImage = async (
  templateId: string,
  payload: Record<string, unknown>,
): Promise<Buffer> => {
  const templatePath = join(LOCAL_TEMPLATES_DIR, templateId, "index.tsx");
  const moduleUrl = pathToFileURL(templatePath).href;
  const templateModule = (await import(moduleUrl)) as TemplateModule;
  const Template = templateModule.default as any;
  const config = templateModule.config ?? {};

  if (!Template) {
    throw new Error(`Template '${templateId}' has no default export`);
  }

  const fontDataList: Array<{
    name: string;
    data: ArrayBuffer;
    weight: number;
    style: "normal" | "italic";
  }> = [];

  if (Array.isArray(config.fonts)) {
    for (const font of config.fonts) {
      const fontResponse = await fetch(font.url);
      if (!fontResponse.ok) {
        throw new Error(
          `Failed to fetch font '${font.name}' (${fontResponse.status})`,
        );
      }

      fontDataList.push({
        name: font.name,
        data: await fontResponse.arrayBuffer(),
        weight: font.weight ?? 400,
        style: font.style ?? "normal",
      });
    }
  }

  const width = config.width ?? 800;
  const height = config.height ?? 400;

  const svg = await satori(createElement(Template, payload), {
    width,
    height,
    fonts: fontDataList as any,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });

  return Buffer.from(resvg.render().asPng());
};

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
    if (IMAGEN_SERVICE_URL) {
      try {
        const remoteTemplates = await fetchJson<unknown>(
          `${IMAGEN_SERVICE_URL}/templates`,
        );
        return parseTemplateList(remoteTemplates);
      } catch (err) {
        console.error(
          "Failed to list Imagen templates from IMAGEN_URL, falling back to local templates:",
          err,
        );
      }
    }

    try {
      return await listLocalTemplates();
    } catch (err) {
      console.error("Failed to list local Imagen templates:", err);
      return [];
    }
  }

  /**
   * Static method to get template schema
   */
  static async getTemplateSchema(templateId: string): Promise<any> {
    if (IMAGEN_SERVICE_URL) {
      try {
        return await fetchJson<unknown>(
          `${IMAGEN_SERVICE_URL}/templates/${templateId}`,
        );
      } catch (err) {
        console.error(
          `Failed to load template schema '${templateId}' from IMAGEN_URL, falling back to local template schema:`,
          err,
        );
      }
    }

    try {
      return await getLocalTemplateSchema(templateId);
    } catch (err) {
      console.error(`Failed to get local template schema for ${templateId}:`, err);
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

    let buffer: Buffer | null = null;

    if (IMAGEN_SERVICE_URL) {
      try {
        const response = await fetch(`${IMAGEN_SERVICE_URL}/generate/${templateId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          buffer = Buffer.from(await response.arrayBuffer());
        } else {
          const errorText = await response.text();
          context.logger.error("Imagen generation via IMAGEN_URL failed", {
            status: response.status,
            error: errorText,
            fallback: "local",
          });
        }
      } catch (err: any) {
        context.logger.error("Imagen request failed, using local fallback", {
          error: err.message,
        });
      }
    }

    if (!buffer) {
      try {
        buffer = await generateLocalImage(
          templateId,
          (data as Record<string, unknown>) ?? {},
        );
      } catch (err: any) {
        context.logger.error("Local Imagen generation failed", {
          error: err.message,
        });
        return {
          error: new DataPacket({
            code: "GENERATION_FAILED",
            message: `Image generation failed: ${err.message}`,
            template: templateId,
            timestamp: Date.now(),
          }),
        };
      }
    }

    const base64 = buffer.toString("base64");
    const image: TypedImage = {
      data: base64,
      mimeType: "image/png",
      size: buffer.length,
    };

    context.logger.info("Image generated successfully", {
      template: templateId,
      size: image.size,
    });

    return {
      image: new DataPacket(image),
    };
  }
}
