import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * HTTP Request Node
 *
 * Sends HTTP requests with dynamic URL templating.
 * URL syntax: https://api.example.com/(path.to.key || 'default')
 *
 * For POST/PUT/PATCH: the input object is sent as JSON body.
 * For GET/DELETE: the input object is used only for URL templating.
 */
export default class HttpRequestNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  /**
   * Parse template expressions like (path.to.key || 'default')
   * and replace them with values from the input object.
   */
  private parseTemplate(template: string, data: Record<string, any>): string {
    // Match (expression || 'default') or (expression || "default") or just (expression)
    const regex = /\(([^)]+)\)/g;

    return template.replace(regex, (_match, expression: string) => {
      // Check for || default pattern
      const parts = expression.split("||").map((p) => p.trim());
      const path = parts[0];
      const defaultValue = parts[1];

      // Get value from nested path like "id.key" or "user.profile.name"
      const value = this.getNestedValue(data, path);

      if (value !== undefined && value !== null) {
        return String(value);
      }

      // Use default if provided
      if (defaultValue !== undefined) {
        // Remove quotes from default value
        return defaultValue.replace(/^['"]|['"]$/g, "");
      }

      // No value, no default - return empty string
      return "";
    });
  }

  /**
   * Get nested value from object using dot notation path.
   * Example: getNestedValue({a: {b: 1}}, "a.b") => 1
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    if (!obj || !path) return undefined;

    const keys = path.split(".");
    let current: any = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const dataInput = inputs.data;

    // Get input data (default to empty object)
    const inputData =
      dataInput?.value && typeof dataInput.value === "object"
        ? dataInput.value
        : {};

    // Get settings
    const urlTemplate = this.config.url || "";
    const method = (this.config.method || "GET").toUpperCase();
    const authHeader = this.config.authHeader || "";
    const timeout = this.config.timeout || 30000;

    if (!urlTemplate) {
      return {
        response: new DataPacket(null),
        status_code: new DataPacket(0),
        error: new DataPacket("URL template is required"),
      };
    }

    // Parse URL template with input data
    const url = this.parseTemplate(urlTemplate, inputData);

    context.logger.info("HTTP Request", { method, url });

    try {
      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      // Build fetch options
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(timeout),
      };

      // For POST/PUT/PATCH, send input data as body
      if (["POST", "PUT", "PATCH"].includes(method)) {
        fetchOptions.body = JSON.stringify(inputData);
      }

      // Make the request
      const response = await fetch(url, fetchOptions);
      const statusCode = response.status;

      // Parse response body
      let responseBody: any;
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      context.logger.info("HTTP Response", {
        status: statusCode,
        bodyLength:
          typeof responseBody === "string"
            ? responseBody.length
            : JSON.stringify(responseBody).length,
      });

      // Check if response is an error status
      const errorMessage = response.ok ? null : `HTTP ${statusCode}`;

      return {
        response: new DataPacket(responseBody),
        status_code: new DataPacket(statusCode),
        error: new DataPacket(errorMessage),
      };
    } catch (err: any) {
      const errorMessage =
        err.name === "TimeoutError"
          ? `Request timed out after ${timeout}ms`
          : err.message || "Unknown error";

      context.logger.error("HTTP Request failed", { error: errorMessage, url });

      return {
        response: new DataPacket(null),
        status_code: new DataPacket(0),
        error: new DataPacket(errorMessage),
      };
    }
  }
}
