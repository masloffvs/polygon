import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const ReplicateRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const model = settings.model || "stability-ai/sdxl";
  const shortModel = model.includes("/")
    ? model.split("/").pop()?.split(":")[0] || model
    : model;

  const isImageModel =
    model.includes("sdxl") ||
    model.includes("stable-diffusion") ||
    model.includes("flux") ||
    model.includes("dall-e") ||
    model.includes("imagen");

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
      {/* Model Tag */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded">
          🔥 Replicate
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded truncate max-w-[120px]">
          {shortModel}
        </span>
        {result?.status && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded ${
              result.status === "succeeded"
                ? "bg-green-500/20 text-green-300"
                : result.status === "failed"
                  ? "bg-red-500/20 text-red-300"
                  : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {result.status}
          </span>
        )}
      </div>

      {/* Output */}
      {result?.output ? (
        <div className="bg-dark-900/50 rounded p-2">
          {/* Image output */}
          {isImageModel &&
          typeof result.output === "string" &&
          result.output.startsWith("http") ? (
            <img
              src={result.output}
              alt="Generated"
              className="w-full rounded max-h-[200px] object-cover"
            />
          ) : isImageModel &&
            Array.isArray(result.output) &&
            result.output[0]?.startsWith?.("http") ? (
            <div className="flex flex-wrap gap-1">
              {result.output.slice(0, 4).map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt={`Generated ${i + 1}`}
                  className="w-[48%] rounded"
                />
              ))}
            </div>
          ) : (
            /* Text/other output */
            <div className="text-[10px] text-gray-300 line-clamp-5 whitespace-pre-wrap font-mono">
              {typeof result.output === "string"
                ? result.output
                : JSON.stringify(result.output, null, 2)}
            </div>
          )}

          {/* Processing time */}
          {result.processingTime && (
            <div className="text-[9px] text-gray-600 mt-1">
              ⏱ {(result.processingTime / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      ) : result?.status === "processing" || result?.status === "starting" ? (
        <div className="bg-dark-900/50 rounded p-2 text-center">
          <div className="text-[10px] text-yellow-400 animate-pulse">
            ⏳ Processing...
          </div>
          <div className="text-[9px] text-gray-600 mt-1 font-mono truncate">
            {result.predictionId}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-2">
          Send input to run model...
        </div>
      )}

      {/* API Token indicator */}
      <div className="text-[9px] text-gray-700 flex items-center gap-1">
        {settings.apiToken ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
            Token set
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
            No token
          </>
        )}
      </div>
    </div>
  );
};

registerRenderer("replicate", ReplicateRenderer);
export default ReplicateRenderer;
