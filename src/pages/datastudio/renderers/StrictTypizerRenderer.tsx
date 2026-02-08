import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const StrictTypizerRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const strict = settings.strict ?? true;

  // Parse schema for display
  let schemaKeys: string[] = [];
  try {
    const schema = JSON.parse(
      settings.schema ||
        '{"title": "string", "value": "number", "tags": "string[]"}',
    );
    schemaKeys = Object.entries(schema).map(([k, v]) => `${k}: ${v}`);
  } catch {
    schemaKeys = ["(invalid schema)"];
  }

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
      {/* Mode Tags */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded ${
            strict
              ? "bg-amber-500/20 text-amber-300"
              : "bg-gray-500/20 text-gray-400"
          }`}
        >
          {strict ? "⚡ Strict" : "Lenient"}
        </span>
        {result?.valid !== undefined && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded ${
              result.valid
                ? "bg-green-500/20 text-green-300"
                : "bg-red-500/20 text-red-300"
            }`}
          >
            {result.valid ? "✓ Valid" : "✗ Invalid"}
          </span>
        )}
      </div>

      {/* Schema Preview */}
      <div className="bg-dark-900/50 rounded p-2">
        <div className="text-[9px] text-gray-500 uppercase mb-1">Schema</div>
        <div className="flex flex-col gap-0.5">
          {schemaKeys.slice(0, 5).map((entry) => (
            <div
              key={entry}
              className="text-[10px] text-gray-400 font-mono truncate"
            >
              {entry}
            </div>
          ))}
          {schemaKeys.length > 5 && (
            <div className="text-[9px] text-gray-600">
              +{schemaKeys.length - 5} more
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      {result?.data ? (
        <div className="bg-dark-900/50 rounded p-2">
          <div className="text-[9px] text-gray-500 uppercase mb-1">Output</div>
          <div className="text-[10px] text-gray-300 font-mono line-clamp-4 whitespace-pre-wrap">
            {JSON.stringify(result.data, null, 2)}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-1 border-t border-gray-800 pt-1">
              {result.errors.map((err: string, i: number) => (
                <div key={i} className="text-[9px] text-red-400">
                  ⚠ {err}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-2">
          Waiting for data...
        </div>
      )}
    </div>
  );
};

registerRenderer("strict-typizer", StrictTypizerRenderer);
export default StrictTypizerRenderer;
