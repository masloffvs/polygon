import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const VectorStoreRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const collection = settings.collection || "default_vectors";
  const embeddingModel = settings.embeddingModel || "qwen3-embedding";

  // Short model name
  const shortModel = embeddingModel.includes("/")
    ? embeddingModel.split("/").pop() || embeddingModel
    : embeddingModel.split("@")[0] || embeddingModel;

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[200px]">
      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">
          📦 {collection}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded truncate max-w-[100px]">
          {shortModel}
        </span>
      </div>

      {/* Status */}
      {result?.stored ? (
        <div className="bg-green-900/20 border border-green-500/30 rounded p-2">
          <div className="text-[10px] text-green-300">✓ Vector stored</div>
          <div className="text-[9px] text-gray-500 font-mono mt-1 truncate">
            ID: {result.pointId?.slice(0, 12)}...
          </div>
        </div>
      ) : result?.error ? (
        <div className="bg-red-900/20 rounded p-2">
          <div className="text-[10px] text-red-400">{result.error}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 justify-center">
          <div className="w-2 h-2 rounded-full bg-indigo-500/50" />
          <span className="text-[10px] text-gray-600 italic">
            Waiting for data...
          </span>
        </div>
      )}

      {/* Config hints */}
      {settings.textField && (
        <div className="text-[9px] text-gray-600 truncate">
          Field: {settings.textField}
        </div>
      )}
    </div>
  );
};

registerRenderer("vector-store", VectorStoreRenderer);
export default VectorStoreRenderer;
