import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const EmbeddingCompareRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const fieldA = settings.fieldA || "a";
  const fieldB = settings.fieldB || "b";

  const verdictColors: Record<string, string> = {
    identical: "text-green-300 bg-green-500/20",
    very_similar: "text-emerald-300 bg-emerald-500/20",
    similar: "text-blue-300 bg-blue-500/20",
    related: "text-yellow-300 bg-yellow-500/20",
    different: "text-orange-300 bg-orange-500/20",
    unrelated: "text-red-300 bg-red-500/20",
  };

  const verdictLabels: Record<string, string> = {
    identical: "Identical",
    very_similar: "Very Similar",
    similar: "Similar",
    related: "Related",
    different: "Different",
    unrelated: "Unrelated",
  };

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[200px]">
      {/* Fields */}
      <div className="flex items-center gap-1.5 text-[9px]">
        <span className="px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded">
          A: {fieldA}
        </span>
        <span className="text-gray-600">↔</span>
        <span className="px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded">
          B: {fieldB}
        </span>
      </div>

      {/* Result */}
      {result?.similarity !== undefined ? (
        <div className="flex flex-col gap-2">
          {/* Similarity gauge */}
          <div className="bg-dark-900/50 rounded p-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] text-gray-500 uppercase">
                Similarity
              </span>
              <span className="text-sm font-mono font-bold text-white">
                {(result.similarity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(result.similarity * 100)}%`,
                  background: `linear-gradient(90deg, #ef4444 0%, #eab308 40%, #22c55e 80%, #10b981 100%)`,
                  backgroundSize: "100% 100%",
                  backgroundPosition: "left",
                }}
              />
            </div>
          </div>

          {/* Verdict */}
          <div className="flex justify-center">
            <span
              className={`text-[10px] px-2 py-1 rounded font-medium ${
                verdictColors[result.verdict] || "text-gray-400 bg-gray-500/20"
              }`}
            >
              {verdictLabels[result.verdict] || result.verdict}
            </span>
          </div>

          {/* Distance */}
          <div className="text-[9px] text-gray-600 text-center">
            Cosine distance: {result.distance?.toFixed(4)}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-3">
          Pass {`{${fieldA}: ..., ${fieldB}: ...}`} to compare
        </div>
      )}
    </div>
  );
};

registerRenderer("embedding-compare", EmbeddingCompareRenderer);
export default EmbeddingCompareRenderer;
