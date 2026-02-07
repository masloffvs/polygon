import Handlebars from "handlebars";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Rich String Node
 *
 * Uses Handlebars templates for powerful string building.
 * Supports:
 * - Simple substitution: {{name}}
 * - Nested paths: {{user.profile.name}}
 * - Conditionals: {{#if active}}Active{{/if}}
 * - Loops: {{#each items}}{{this}}{{/each}}
 * - Helpers: {{uppercase name}}
 *
 * Has a dedicated DataView editor with syntax highlighting.
 */
export default class RichStringNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
    this.registerHelpers();
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    const isHelperOptions = (value: unknown): boolean =>
      typeof value === "object" &&
      value !== null &&
      "hash" in value &&
      "data" in value;

    const toTemplateString = (value: unknown): string =>
      typeof value === "string" ? value : String(value ?? "");

    const setByPath = (
      target: Record<string, unknown>,
      path: string,
      value: unknown,
    ) => {
      const keys = path
        .split(".")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length === 0) return;
      if (keys.some((k) => k === "__proto__" || k === "prototype" || k === "constructor")) {
        return;
      }

      let current: Record<string, unknown> = target;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const next = current[key];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
          current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
      }
      const lastKey = keys[keys.length - 1];
      current[lastKey] = value;
    };

    // String helpers
    Handlebars.registerHelper("uppercase", (str: unknown) =>
      toTemplateString(str).toUpperCase(),
    );

    Handlebars.registerHelper("lowercase", (str: unknown) =>
      toTemplateString(str).toLowerCase(),
    );

    Handlebars.registerHelper("capitalize", (str: unknown) => {
      const s = toTemplateString(str);
      return s.charAt(0).toUpperCase() + s.slice(1);
    });

    Handlebars.registerHelper("trim", (str: unknown) =>
      toTemplateString(str).trim(),
    );
    Handlebars.registerHelper(
      "replace",
      (str: unknown, search: unknown, replacement: unknown = "") => {
        const source = toTemplateString(str);
        const needle = isHelperOptions(search) ? "" : toTemplateString(search);
        const next = isHelperOptions(replacement)
          ? ""
          : toTemplateString(replacement);
        if (!needle) return source;
        return source.replace(needle, next);
      },
    );
    Handlebars.registerHelper(
      "replaceAll",
      (str: unknown, search: unknown, replacement: unknown = "") => {
        const source = toTemplateString(str);
        const needle = isHelperOptions(search) ? "" : toTemplateString(search);
        const next = isHelperOptions(replacement)
          ? ""
          : toTemplateString(replacement);
        if (!needle) return source;
        return source.split(needle).join(next);
      },
    );
    Handlebars.registerHelper("concat", (...parts: unknown[]) => {
      return parts
        .slice(0, -1)
        .map((part) => toTemplateString(part))
        .join("");
    });
    Handlebars.registerHelper(
      "slice",
      (str: unknown, start: unknown, end: unknown) => {
        const source = toTemplateString(str);
        const startIndex = Number(start);
        const safeStart = Number.isNaN(startIndex) ? 0 : Math.trunc(startIndex);

        if (
          isHelperOptions(end) ||
          end === undefined ||
          end === null ||
          end === ""
        ) {
          return source.slice(safeStart);
        }

        const endIndex = Number(end);
        const safeEnd = Number.isNaN(endIndex)
          ? undefined
          : Math.trunc(endIndex);
        return source.slice(safeStart, safeEnd);
      },
    );
    Handlebars.registerHelper(
      "truncate",
      (str: unknown, maxLength: unknown, suffix: unknown = "...") => {
        const source = toTemplateString(str);
        const rawLimit = Number(maxLength);
        const limit = Number.isNaN(rawLimit)
          ? source.length
          : Math.max(0, Math.trunc(rawLimit));

        if (source.length <= limit) return source;
        if (limit <= 0) return "";

        const ending = isHelperOptions(suffix) ? "..." : toTemplateString(suffix);
        if (ending.length >= limit) return source.slice(0, limit);

        return `${source.slice(0, limit - ending.length)}${ending}`;
      },
    );
    Handlebars.registerHelper("contains", (str: unknown, search: unknown) => {
      if (isHelperOptions(search)) return false;
      return toTemplateString(str).includes(toTemplateString(search));
    });
    Handlebars.registerHelper("startsWith", (str: unknown, prefix: unknown) => {
      if (isHelperOptions(prefix)) return false;
      return toTemplateString(str).startsWith(toTemplateString(prefix));
    });
    Handlebars.registerHelper("endsWith", (str: unknown, suffix: unknown) => {
      if (isHelperOptions(suffix)) return false;
      return toTemplateString(str).endsWith(toTemplateString(suffix));
    });

    // Number helpers
    Handlebars.registerHelper(
      "round",
      (num: unknown, decimals: unknown = 0) => {
        const n = Number(num);
        const d = Number(decimals) || 0;
        return Number.isNaN(n) ? "0" : n.toFixed(d);
      },
    );

    Handlebars.registerHelper("currency", (num: unknown) => {
      const n = Number(num);
      return Number.isNaN(n)
        ? "$0.00"
        : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });

    Handlebars.registerHelper("percent", (num: unknown) => {
      const n = Number(num);
      return Number.isNaN(n) ? "0%" : `${(n * 100).toFixed(1)}%`;
    });

    // Date helpers
    Handlebars.registerHelper("date", (val: unknown, format: unknown) => {
      const d = val instanceof Date ? val : new Date(String(val));
      if (Number.isNaN(d.getTime())) return "";

      const fmt = typeof format === "string" ? format : "YYYY-MM-DD";

      return fmt
        .replace("YYYY", String(d.getFullYear()))
        .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
        .replace("DD", String(d.getDate()).padStart(2, "0"))
        .replace("HH", String(d.getHours()).padStart(2, "0"))
        .replace("mm", String(d.getMinutes()).padStart(2, "0"))
        .replace("ss", String(d.getSeconds()).padStart(2, "0"));
    });

    Handlebars.registerHelper("now", (format: unknown) => {
      const d = new Date();
      const fmt = typeof format === "string" ? format : "YYYY-MM-DD HH:mm:ss";
      return fmt
        .replace("YYYY", String(d.getFullYear()))
        .replace("MM", String(d.getMonth() + 1).padStart(2, "0"))
        .replace("DD", String(d.getDate()).padStart(2, "0"))
        .replace("HH", String(d.getHours()).padStart(2, "0"))
        .replace("mm", String(d.getMinutes()).padStart(2, "0"))
        .replace("ss", String(d.getSeconds()).padStart(2, "0"));
    });

    // Array helpers
    Handlebars.registerHelper("join", (arr: unknown, sep: unknown = ", ") => {
      if (!Array.isArray(arr)) return "";
      return arr.join(typeof sep === "string" ? sep : ", ");
    });

    Handlebars.registerHelper("first", (arr: unknown) => {
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : "";
    });

    Handlebars.registerHelper("last", (arr: unknown) => {
      return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : "";
    });

    Handlebars.registerHelper("length", (arr: unknown) => {
      return Array.isArray(arr) ? arr.length : 0;
    });

    // Logic helpers
    Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper(
      "gt",
      (a: unknown, b: unknown) => Number(a) > Number(b),
    );
    Handlebars.registerHelper(
      "lt",
      (a: unknown, b: unknown) => Number(a) < Number(b),
    );
    Handlebars.registerHelper(
      "gte",
      (a: unknown, b: unknown) => Number(a) >= Number(b),
    );
    Handlebars.registerHelper(
      "lte",
      (a: unknown, b: unknown) => Number(a) <= Number(b),
    );

    // Default helper
    Handlebars.registerHelper(
      "default",
      (val: unknown, defaultVal: unknown) => val ?? defaultVal,
    );
    Handlebars.registerHelper(
      "set",
      (key: unknown, value: unknown, options: unknown) => {
        const path = toTemplateString(key).trim();
        if (!path) return "";

        const maybeOptions =
          typeof options === "object" && options !== null
            ? (options as { data?: { root?: unknown } })
            : undefined;

        const root = maybeOptions?.data?.root;
        if (root && typeof root === "object" && !Array.isArray(root)) {
          setByPath(root as Record<string, unknown>, path, value);
        }

        return "";
      },
    );

    // JSON helper
    Handlebars.registerHelper("json", (obj: unknown) => {
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    });
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const input = inputs.data;

    // Get template from config
    const templateStr = String(this.config.template || "");

    if (!templateStr) {
      return {
        result: new DataPacket(""),
      };
    }

    // Prepare data context
    let data: Record<string, unknown> = {};

    if (input?.value !== undefined && input.value !== null) {
      if (typeof input.value === "object") {
        data = input.value as Record<string, unknown>;
      } else {
        // Wrap primitive in "value" key
        data = { value: input.value };
      }
    }

    try {
      // Compile and render template
      const template = Handlebars.compile(templateStr, {
        noEscape: true, // Don't HTML-escape by default
      });

      const result = template(data);

      return {
        result: new DataPacket(result),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        code: "TEMPLATE_ERROR",
        message: `Template rendering failed: ${errorMessage}`,
        nodeId: this.id,
        traceId: _context.traceId || this.id,
        timestamp: Date.now(),
        recoverable: true,
      };
    }
  }
}
