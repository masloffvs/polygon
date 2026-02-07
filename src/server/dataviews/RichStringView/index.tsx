import { dataviewOf } from "@/server/utils/dataview.helpers";
import Handlebars from "handlebars";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============ Types ============
interface HelperDoc {
  name: string;
  description: string;
  example: string;
  category: "string" | "number" | "date" | "array" | "logic" | "block";
}

// ============ Helper Documentation ============
const HELPERS: HelperDoc[] = [
  // String
  {
    name: "uppercase",
    description: "Convert to uppercase",
    example: "{{uppercase name}}",
    category: "string",
  },
  {
    name: "lowercase",
    description: "Convert to lowercase",
    example: "{{lowercase name}}",
    category: "string",
  },
  {
    name: "capitalize",
    description: "Capitalize first letter",
    example: "{{capitalize name}}",
    category: "string",
  },
  {
    name: "trim",
    description: "Remove whitespace",
    example: "{{trim text}}",
    category: "string",
  },
  {
    name: "replace",
    description: "Replace first match",
    example: '{{replace title "BTC" "ETH"}}',
    category: "string",
  },
  {
    name: "replaceAll",
    description: "Replace all matches",
    example: '{{replaceAll text "-" "_"}}',
    category: "string",
  },
  {
    name: "concat",
    description: "Concatenate values",
    example: '{{concat firstName " " lastName}}',
    category: "string",
  },
  {
    name: "slice",
    description: "Slice substring by index",
    example: "{{slice symbol 0 3}}",
    category: "string",
  },
  {
    name: "truncate",
    description: "Trim to max length",
    example: '{{truncate description 120 "..."}}',
    category: "string",
  },
  {
    name: "contains",
    description: "Check if contains substring",
    example: '{{#if (contains title "BTC")}}...{{/if}}',
    category: "string",
  },
  {
    name: "startsWith",
    description: "Check prefix",
    example: '{{startsWith pair "ETH"}}',
    category: "string",
  },
  {
    name: "endsWith",
    description: "Check suffix",
    example: '{{endsWith filename ".json"}}',
    category: "string",
  },
  // Number
  {
    name: "round",
    description: "Round to decimals",
    example: "{{round price 2}}",
    category: "number",
  },
  {
    name: "currency",
    description: "Format as USD",
    example: "{{currency amount}}",
    category: "number",
  },
  {
    name: "percent",
    description: "Format as percentage",
    example: "{{percent ratio}}",
    category: "number",
  },
  {
    name: "multiply",
    description: "Multiply two numbers",
    example: "{{multiply spreadPercent 10}}",
    category: "number",
  },
  {
    name: "add",
    description: "Add two numbers",
    example: "{{add priceBuy 0.001}}",
    category: "number",
  },
  {
    name: "subtract",
    description: "Subtract two numbers",
    example: "{{subtract balance fee}}",
    category: "number",
  },
  {
    name: "divide",
    description: "Divide two numbers",
    example: "{{divide total count}}",
    category: "number",
  },
  {
    name: "abs",
    description: "Absolute value",
    example: "{{abs spread}}",
    category: "number",
  },
  {
    name: "min",
    description: "Minimum of two numbers",
    example: "{{min price1 price2}}",
    category: "number",
  },
  {
    name: "max",
    description: "Maximum of two numbers",
    example: "{{max spreadPercent spreadPercentHistory}}",
    category: "number",
  },
  {
    name: "minusPercent",
    description: "Subtract percentage from number",
    example: "{{minusPercent 1000 1}}",
    category: "number",
  },
  {
    name: "percentOf",
    description: "Calculate percentage of number",
    example: "{{percentOf 1000 5}}",
    category: "number",
  },
  {
    name: "smartRound",
    description: "Smart rounding for crypto prices",
    example: "{{smartRound priceBuy}}",
    category: "number",
  },
  {
    name: "formatNumber",
    description: "Format number with thousands separator",
    example: "{{formatNumber amount 2}}",
    category: "number",
  },
  {
    name: "math",
    description: "Evaluate math expression",
    example: '{{math "a * b - c" this}}',
    category: "number",
  },
  // Date
  {
    name: "date",
    description: "Format date",
    example: '{{date timestamp "YYYY-MM-DD"}}',
    category: "date",
  },
  {
    name: "now",
    description: "Current date/time",
    example: '{{now "HH:mm:ss"}}',
    category: "date",
  },
  // Array
  {
    name: "join",
    description: "Join array",
    example: '{{join items ", "}}',
    category: "array",
  },
  {
    name: "first",
    description: "First element",
    example: "{{first items}}",
    category: "array",
  },
  {
    name: "last",
    description: "Last element",
    example: "{{last items}}",
    category: "array",
  },
  {
    name: "length",
    description: "Array length",
    example: "{{length items}}",
    category: "array",
  },
  // Logic
  {
    name: "eq",
    description: "Equals",
    example: "{{#if (eq status 'active')}}...{{/if}}",
    category: "logic",
  },
  {
    name: "gt",
    description: "Greater than",
    example: "{{#if (gt count 10)}}...{{/if}}",
    category: "logic",
  },
  {
    name: "lt",
    description: "Less than",
    example: "{{#if (lt count 5)}}...{{/if}}",
    category: "logic",
  },
  {
    name: "default",
    description: "Default value",
    example: '{{default name "Unknown"}}',
    category: "logic",
  },
  {
    name: "json",
    description: "JSON stringify",
    example: "{{json data}}",
    category: "logic",
  },
  {
    name: "set",
    description: "Set variable on root context",
    example: '{{set "urlBuy" (concat "https://..." pair)}}',
    category: "logic",
  },
  // Block
  {
    name: "#each",
    description: "Loop over array",
    example: "{{#each items}}{{this}}{{/each}}",
    category: "block",
  },
  {
    name: "#if",
    description: "Conditional",
    example: "{{#if active}}Yes{{else}}No{{/if}}",
    category: "block",
  },
  {
    name: "#unless",
    description: "Negative conditional",
    example: "{{#unless disabled}}Enabled{{/unless}}",
    category: "block",
  },
  {
    name: "#with",
    description: "Change context",
    example: "{{#with user}}{{name}}{{/with}}",
    category: "block",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  string: "bg-green-500/20 text-green-400",
  number: "bg-blue-500/20 text-blue-400",
  date: "bg-purple-500/20 text-purple-400",
  array: "bg-orange-500/20 text-orange-400",
  logic: "bg-yellow-500/20 text-yellow-400",
  block: "bg-pink-500/20 text-pink-400",
};

// ============ Syntax Highlighter ============
function highlightHandlebars(code: string): string {
  let html = code
    // Escape HTML first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Block helpers ({{#each}}, {{/each}}, {{#if}}, etc.)
  html = html.replace(
    /(\{\{)(#|\/)(each|if|unless|with|first|last)(\s+[^}]*)?(}})/g,
    '<span class="text-pink-400">$1$2$3</span><span class="text-gray-300">$4</span><span class="text-pink-400">$5</span>',
  );

  // Else
  html = html.replace(
    /(\{\{)(else)(}})/g,
    '<span class="text-pink-400">$1$2$3</span>',
  );

  // Helpers with args ({{helper arg}})
  html = html.replace(
    /(\{\{)([a-zA-Z_][\w-]*)\s+([^}]+)(}})/g,
    '<span class="text-amber-400">$1</span><span class="text-green-400">$2</span> <span class="text-blue-300">$3</span><span class="text-amber-400">$4</span>',
  );

  // Simple variables ({{variable}} or {{path.to.var}})
  html = html.replace(
    /(\{\{)([a-zA-Z_][\w.]*)(}})/g,
    '<span class="text-amber-400">$1</span><span class="text-cyan-400">$2</span><span class="text-amber-400">$3</span>',
  );

  // Triple braces for unescaped (already handled but keeping for clarity)
  html = html.replace(
    /(\{\{\{)([^}]+)(}}})/g,
    '<span class="text-red-400">$1$2$3</span>',
  );

  return html;
}

// ============ Code Editor Component ============
function CodeEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const highlighted = useMemo(() => highlightHandlebars(value), [value]);

  return (
    <div className="relative w-full h-full min-h-[200px] font-mono text-sm">
      {/* Syntax highlighted background */}
      <div
        ref={highlightRef}
        className="absolute inset-0 p-3 overflow-hidden pointer-events-none whitespace-pre-wrap break-words text-gray-300"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: <highlighter output>
        dangerouslySetInnerHTML={{
          __html:
            highlighted ||
            `<span class="text-gray-600">${placeholder || ""}</span>`,
        }}
      />
      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-3 bg-transparent text-transparent caret-white resize-none outline-none font-mono text-sm"
        style={{ caretColor: "white" }}
      />
    </div>
  );
}

// ============ Variable Tree Component ============
function VariableTree({
  data,
  path = "",
  onInsert,
}: {
  data: unknown;
  path?: string;
  onInsert: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (data === null || data === undefined) {
    return <span className="text-gray-600 text-xs italic">null</span>;
  }

  if (typeof data !== "object") {
    return (
      <button
        type="button"
        onClick={() => onInsert(path)}
        className="text-cyan-400 hover:text-cyan-300 text-xs font-mono truncate max-w-full"
        title={`Insert {{${path}}}`}
      >
        {String(data).slice(0, 30)}
        {String(data).length > 30 && "..."}
      </button>
    );
  }

  if (Array.isArray(data)) {
    const isOpen = expanded[path] ?? false;
    return (
      <div className="text-xs">
        <button
          type="button"
          onClick={() => setExpanded((p) => ({ ...p, [path]: !isOpen }))}
          className="flex items-center gap-1 text-orange-400 hover:text-orange-300"
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Array[{data.length}]
        </button>
        {isOpen && (
          <div className="ml-3 mt-1 border-l border-gray-700 pl-2 space-y-1">
            {data.slice(0, 5).map((item, i) => {
              const itemKey = `${path}-item-${typeof item === "object" ? JSON.stringify(item).slice(0, 20) : String(item)}-${i}`;
              return (
                <div key={itemKey} className="flex items-start gap-2">
                  <span className="text-gray-600">[{i}]</span>
                  <VariableTree
                    data={item}
                    path={`${path}.[${i}]`}
                    onInsert={onInsert}
                  />
                </div>
              );
            })}
            {data.length > 5 && (
              <span className="text-gray-600">...{data.length - 5} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Object
  const entries = Object.entries(data as Record<string, unknown>);
  const isOpen = expanded[path] ?? path === "";

  return (
    <div className="text-xs">
      {path && (
        <button
          type="button"
          onClick={() => setExpanded((p) => ({ ...p, [path]: !isOpen }))}
          className="flex items-center gap-1 text-purple-400 hover:text-purple-300"
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Object
          {entries.length > 0 && (
            <span className="text-gray-600">({entries.length})</span>
          )}
        </button>
      )}
      {isOpen && (
        <div
          className={`${path ? "ml-3 mt-1 border-l border-gray-700 pl-2" : ""} space-y-1`}
        >
          {entries.slice(0, 20).map(([key, val]) => {
            const newPath = path ? `${path}.${key}` : key;
            return (
              <div key={key} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onInsert(newPath)}
                  className="text-gray-400 hover:text-white font-medium shrink-0"
                  title={`Insert {{${newPath}}}`}
                >
                  {key}:
                </button>
                <VariableTree data={val} path={newPath} onInsert={onInsert} />
              </div>
            );
          })}
          {entries.length > 20 && (
            <span className="text-gray-600">...{entries.length - 20} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Main View Component ============
export const RichStringView = dataviewOf((args) => {
  // Parse args - nodeId comes from DataStudio
  const nodeId = args.nodeId as string | undefined;

  const [template, setTemplate] = useState("Hello, {{name}}!");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!nodeId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  const [sampleData, setSampleData] = useState<Record<string, unknown>>({
    name: "World",
    count: 42,
  });
  const [sampleDataInput, setSampleDataInput] = useState(() =>
    JSON.stringify({ name: "World", count: 42 }, null, 2),
  );

  // Load settings from server on mount
  useEffect(() => {
    if (!nodeId) return;

    const loadSettings = async () => {
      try {
        const response = await fetch(
          `/api/datastudio/node-settings?nodeId=${encodeURIComponent(nodeId)}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.settings?.template) {
            setTemplate(data.settings.template);
          }
          if (data.settings?.sampleJson) {
            try {
              const parsed = JSON.parse(data.settings.sampleJson);
              setSampleData(parsed);
              setSampleDataInput(JSON.stringify(parsed, null, 2));
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // ignore fetch errors
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [nodeId]);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHelpers, setShowHelpers] = useState(false);
  const [activeHelperCategory, setActiveHelperCategory] =
    useState<string>("all");

  // Register helpers (same as node)
  useEffect(() => {
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
    Handlebars.registerHelper("slice", (str: unknown, start: unknown, end: unknown) => {
      const source = toTemplateString(str);
      const startIndex = Number(start);
      const safeStart = Number.isNaN(startIndex) ? 0 : Math.trunc(startIndex);

      if (isHelperOptions(end) || end === undefined || end === null || end === "") {
        return source.slice(safeStart);
      }

      const endIndex = Number(end);
      const safeEnd = Number.isNaN(endIndex) ? undefined : Math.trunc(endIndex);
      return source.slice(safeStart, safeEnd);
    });
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

    // Math helpers
    Handlebars.registerHelper("multiply", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      return Number.isNaN(numA) || Number.isNaN(numB) ? 0 : numA * numB;
    });
    Handlebars.registerHelper("add", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      return Number.isNaN(numA) || Number.isNaN(numB) ? 0 : numA + numB;
    });
    Handlebars.registerHelper("subtract", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      return Number.isNaN(numA) || Number.isNaN(numB) ? 0 : numA - numB;
    });
    Handlebars.registerHelper("divide", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      if (Number.isNaN(numA) || Number.isNaN(numB) || numB === 0) return 0;
      return numA / numB;
    });
    Handlebars.registerHelper("abs", (num: unknown) => {
      const n = Number(num);
      return Number.isNaN(n) ? 0 : Math.abs(n);
    });
    Handlebars.registerHelper("min", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      if (Number.isNaN(numA)) return numB;
      if (Number.isNaN(numB)) return numA;
      return Math.min(numA, numB);
    });
    Handlebars.registerHelper("max", (a: unknown, b: unknown) => {
      const numA = Number(a);
      const numB = Number(b);
      if (Number.isNaN(numA)) return numB;
      if (Number.isNaN(numB)) return numA;
      return Math.max(numA, numB);
    });
    Handlebars.registerHelper("minusPercent", (num: unknown, percent: unknown) => {
      const n = Number(num);
      const p = Number(percent);
      if (Number.isNaN(n) || Number.isNaN(p)) return 0;
      return n * (1 - p / 100);
    });
    Handlebars.registerHelper("percentOf", (num: unknown, percent: unknown) => {
      const n = Number(num);
      const p = Number(percent);
      if (Number.isNaN(n) || Number.isNaN(p)) return 0;
      return (n * p) / 100;
    });
    Handlebars.registerHelper("smartRound", (num: unknown) => {
      const n = Number(num);
      if (Number.isNaN(n)) return "0";
      
      if (n >= 1) {
        return n.toFixed(2);
      }
      if (n >= 0.001) {
        return n.toFixed(4);
      }
      if (n >= 0.000001) {
        return n.toFixed(8);
      }
      return n.toExponential(2);
    });
    Handlebars.registerHelper("formatNumber", (num: unknown, decimals: unknown = 2) => {
      const n = Number(num);
      const d = Number(decimals) || 2;
      if (Number.isNaN(n)) return "0";
      return n.toLocaleString("en-US", { 
        minimumFractionDigits: d, 
        maximumFractionDigits: d 
      });
    });
    Handlebars.registerHelper("math", (expression: unknown, context: unknown) => {
      if (typeof expression !== "string") return 0;
      
      try {
        // Replace variables in expression with values from context
        let expr = expression;
        if (context && typeof context === "object") {
          for (const [key, value] of Object.entries(context)) {
            const numValue = Number(value);
            if (!Number.isNaN(numValue)) {
              expr = expr.replace(new RegExp(`\\b${key}\\b`, "g"), String(numValue));
            }
          }
        }
        
        // Safe eval using Function constructor (only for numbers and basic operators)
        // biome-ignore lint/security/noGlobalEval: controlled math expression evaluation
        const result = new Function(`return ${expr}`)();
        return Number.isNaN(Number(result)) ? 0 : result;
      } catch {
        return 0;
      }
    });
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
    Handlebars.registerHelper("join", (arr: unknown, sep: unknown = ", ") => {
      if (!Array.isArray(arr)) return "";
      return arr.join(typeof sep === "string" ? sep : ", ");
    });
    Handlebars.registerHelper("first", (arr: unknown) =>
      Array.isArray(arr) && arr.length > 0 ? arr[0] : "",
    );
    Handlebars.registerHelper("last", (arr: unknown) =>
      Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : "",
    );
    Handlebars.registerHelper("length", (arr: unknown) =>
      Array.isArray(arr) ? arr.length : 0,
    );
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
    Handlebars.registerHelper("json", (obj: unknown) => {
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    });
  }, []);

  // Render preview
  const renderPreview = useCallback(() => {
    if (!template) {
      setPreview("");
      setError(null);
      return;
    }

    try {
      const compiled = Handlebars.compile(template, { noEscape: true });
      const result = compiled(sampleData);
      setPreview(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPreview("");
    }
  }, [template, sampleData]);

  // Auto-render on change
  useEffect(() => {
    const timeout = setTimeout(renderPreview, 300);
    return () => clearTimeout(timeout);
  }, [renderPreview]);

  // Parse sample data
  const handleSampleDataChange = (value: string) => {
    setSampleDataInput(value);
    try {
      const parsed = JSON.parse(value);
      setSampleData(parsed);
    } catch {
      // Keep old data if invalid JSON
    }
  };

  // Insert variable into template
  const insertVariable = (path: string) => {
    setTemplate((t) => `${t}{{${path}}}`);
  };

  // Insert helper example
  const insertHelper = (helper: HelperDoc) => {
    setTemplate((t) => `${t}${helper.example}`);
  };

  // Copy result
  const copyResult = () => {
    if (preview) {
      navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Save template and sample JSON back to node via HTTP
  const saveTemplate = useCallback(async () => {
    if (!nodeId) {
      // No nodeId - just copy to clipboard
      navigator.clipboard.writeText(template);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/datastudio/node-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          settings: {
            template,
            sampleJson: JSON.stringify(sampleData),
          },
        }),
      });

      if (response.ok) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }

    setIsSaving(false);
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [nodeId, template, sampleData]);

  // Filter helpers
  const filteredHelpers =
    activeHelperCategory === "all"
      ? HELPERS
      : HELPERS.filter((h) => h.category === activeHelperCategory);

  if (isLoading) {
    return (
      <div className="w-full h-full min-h-screen bg-dark-800 text-white p-4 flex items-center justify-center">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen bg-dark-800 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
            <Code2 className="text-amber-400" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Rich String Editor</h1>
            <p className="text-gray-500 text-sm">
              {nodeId ? (
                <>
                  Node: <code className="text-amber-400/70">{nodeId}</code>
                </>
              ) : (
                "Handlebars template builder with live preview"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveTemplate}
            disabled={isSaving}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              saveStatus === "saved"
                ? "bg-green-500/20 text-green-400"
                : nodeId
                  ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            }`}
          >
            {saveStatus === "saved" ? (
              <Check size={16} />
            ) : nodeId ? (
              <Save size={16} />
            ) : (
              <Copy size={16} />
            )}
            {saveStatus === "saved"
              ? "Saved!"
              : nodeId
                ? "Save Template"
                : "Copy Template"}
          </button>
          <button
            type="button"
            onClick={() => setShowHelpers(!showHelpers)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showHelpers
                ? "bg-amber-500/20 text-amber-400"
                : "bg-dark-600 text-gray-400 hover:bg-dark-500"
            }`}
          >
            <BookOpen size={16} />
            Helpers
          </button>
        </div>
      </div>

      {/* Helpers Panel */}
      {showHelpers && (
        <div className="mb-4 bg-dark-600/50 rounded-lg p-4 border border-dark-500">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveHelperCategory("all")}
              className={`px-2 py-1 rounded text-xs ${
                activeHelperCategory === "all"
                  ? "bg-white text-black"
                  : "bg-dark-500 text-gray-400"
              }`}
            >
              All
            </button>
            {Object.keys(CATEGORY_COLORS).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveHelperCategory(cat)}
                className={`px-2 py-1 rounded text-xs capitalize ${
                  activeHelperCategory === cat
                    ? CATEGORY_COLORS[cat]
                    : "bg-dark-500 text-gray-400"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {filteredHelpers.map((h) => (
              <button
                key={h.name}
                type="button"
                onClick={() => insertHelper(h)}
                className="text-left p-2 bg-dark-700/50 rounded hover:bg-dark-600 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_COLORS[h.category]}`}
                  >
                    {h.name}
                  </span>
                </div>
                <p className="text-gray-500 text-[10px]">{h.description}</p>
                <code className="text-[10px] text-gray-600 group-hover:text-gray-400 block mt-1 truncate">
                  {h.example}
                </code>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout: 80% / 20% */}
      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Left: Editor (80%) */}
        <div className="w-[80%] flex flex-col gap-4">
          {/* Template Editor */}
          <div className="flex-1 bg-dark-700/50 rounded-lg border border-dark-500 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-dark-500 bg-dark-600/50">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                <span className="text-sm text-gray-400">Template</span>
              </div>
              <button
                type="button"
                onClick={renderPreview}
                className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30"
              >
                <Play size={12} />
                Render
              </button>
            </div>
            <div className="h-[calc(100%-40px)] overflow-auto bg-dark-900/50">
              <CodeEditor
                value={template}
                onChange={setTemplate}
                placeholder="Enter your Handlebars template... e.g. Hello, {{name}}!"
              />
            </div>
          </div>

          {/* Sample Data Input */}
          <div className="h-[200px] bg-dark-700/50 rounded-lg border border-dark-500 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-500 bg-dark-600/50">
              <Code2 size={14} className="text-blue-400" />
              <span className="text-sm text-gray-400">Sample Data (JSON)</span>
            </div>
            <textarea
              value={sampleDataInput}
              onChange={(e) => handleSampleDataChange(e.target.value)}
              className="w-full h-[calc(100%-40px)] p-3 bg-transparent text-gray-300 font-mono text-sm resize-none outline-none"
              placeholder='{"name": "World", "count": 42}'
            />
          </div>
        </div>

        {/* Right: Preview + Variables (20%) */}
        <div className="w-[20%] flex flex-col gap-4">
          {/* Preview */}
          <div className="flex-1 bg-dark-700/50 rounded-lg border border-dark-500 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-dark-500 bg-dark-600/50">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-green-400" />
                <span className="text-sm text-gray-400">Preview</span>
              </div>
              <button
                type="button"
                onClick={copyResult}
                disabled={!preview}
                className="flex items-center gap-1 px-2 py-1 bg-dark-500 text-gray-400 rounded text-xs hover:bg-dark-400 disabled:opacity-50"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <div className="h-[calc(100%-40px)] p-3 overflow-auto">
              {error ? (
                <div className="flex items-start gap-2 text-red-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span className="text-xs">{error}</span>
                </div>
              ) : preview ? (
                <pre className="text-gray-300 text-sm whitespace-pre-wrap break-words font-mono">
                  {preview}
                </pre>
              ) : (
                <span className="text-gray-600 text-sm italic">
                  Output will appear here...
                </span>
              )}
            </div>
          </div>

          {/* Variables */}
          <div className="flex-1 bg-dark-700/50 rounded-lg border border-dark-500 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-500 bg-dark-600/50">
              <ChevronRight size={14} className="text-purple-400" />
              <span className="text-sm text-gray-400">Variables</span>
            </div>
            <div className="h-[calc(100%-40px)] p-3 overflow-auto">
              <VariableTree data={sampleData} onInsert={insertVariable} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default RichStringView;
