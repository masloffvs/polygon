import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const VectorSearchRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const collection = settings.collection || "default_vectors";
  const topK = settings.topK || 5;
  const scoreThreshold = settings.scoreThreshold || 0.5;

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
          🔍 {collection}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
          Top {topK}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
          ≥{scoreThreshold}
        </span>
      </div>

      {/* Results */}
      {result?.results && result.results.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] text-gray-500 uppercase">
            {result.totalFound} results for "{result.query?.slice(0, 30)}..."
          </div>
          {result.results.slice(0, 4).map((r: any, i: number) => (
            <div
              key={r.id || i}
              className="bg-dark-900/50 rounded p-1.5 flex items-center gap-2"
            >
              {/* Score bar */}
              <div className="flex-shrink-0 w-10">
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${Math.round(r.score * 100)}%` }}
                  />
                </div>
                <div className="text-[8px] text-gray-500 text-center mt-0.5">
                  {(r.score * 100).toFixed(0)}%
                </div>
              </div>
              {/* Payload preview */}
              <div className="text-[10px] text-gray-400 truncate flex-1">
                {r.payload?._embeddedText?.slice(0, 60) ||
                  r.payload?.text?.slice(0, 60) ||
                  JSON.stringify(r.payload).slice(0, 60)}
              </div>
            </div>
          ))}
          {result.results.length > 4 && (
            <div className="text-[9px] text-gray-600 text-center">
              +{result.results.length - 4} more
            </div>
          )}
        </div>
      ) : result?.totalFound === 0 ? (
        <div className="bg-dark-900/50 rounded p-2 text-center">
          <div className="text-[10px] text-gray-500">No matches found</div>
          <div className="text-[9px] text-gray-600 mt-1 truncate">
            "{result.query?.slice(0, 40)}"
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-2">
          Waiting for query...
        </div>
      )}
    </div>
  );
};

registerRenderer("vector-search", VectorSearchRenderer);
export default VectorSearchRenderer;
