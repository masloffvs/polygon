import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * String Template Node
 *
 * Substitutes values from input object into a template string.
 * Syntax: (path.to.key || 'default')
 *
 * Example:
 *   Template: "Hello, (name)! You have (count || '0') messages."
 *   Input: { name: "John", count: 5 }
 *   Output: "Hello, John! You have 5 messages."
 */
export default class StringTemplateNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    if (!obj || !path) return undefined;
    const keys = path.split(".");
    let current: any = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  private parseTemplate(template: string, data: Record<string, any>): string {
    const regex = /\(([^)]+)\)/g;

    return template.replace(regex, (_match, expression: string) => {
      const parts = expression.split("||").map((p) => p.trim());
      const path = parts[0];
      const defaultValue = parts[1];

      const value = this.getNestedValue(data, path);

      if (value !== undefined && value !== null) {
        return String(value);
      }

      if (defaultValue !== undefined) {
        return defaultValue.replace(/^['"]|['"]$/g, "");
      }

      return "";
    });
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const input = inputs.data;
    if (input === undefined) return {};

    const template = this.config.template || "";
    const data =
      typeof input.value === "object" && input.value ? input.value : {};

    const result = this.parseTemplate(template, data);

    return {
      result: new DataPacket(result),
    };
  }
}
