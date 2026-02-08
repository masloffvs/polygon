import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const LLMChatRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
  const result = data?.text?.value;
  const settings = nodeData?.settings || {};

  const provider = settings.provider || "openrouter";
  const model = settings.model || "deepseek-r1t2-chimera";
  const temperature = settings.temperature ?? 0.7;

  // Short model name for display
  const shortModel = model.includes("/")
    ? model.split("/").pop()?.split(":")[0] || model
    : model;

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
      {/* Provider & Model Tags */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
          {provider === "custom" ? "Custom API" : "OpenRouter"}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded truncate max-w-[120px]">
          {shortModel}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
          t={temperature}
        </span>
      </div>

      {/* System Prompt Preview */}
      {settings.systemPrompt && (
        <div className="text-[9px] text-gray-600 truncate">
          📋 {settings.systemPrompt.slice(0, 60)}...
        </div>
      )}

      {/* Result Display */}
      {result?.text ? (
        <div className="bg-dark-900/50 rounded p-2">
          <div className="text-[10px] text-gray-300 leading-relaxed line-clamp-5 whitespace-pre-wrap">
            {result.text}
          </div>
          <div className="flex justify-between mt-1">
            {result.tokensUsed && (
              <span className="text-[9px] text-gray-600">
                {result.tokensUsed} tokens
              </span>
            )}
            <span className="text-[9px] text-gray-600">
              {result.text.length} chars
            </span>
          </div>
        </div>
      ) : result?.error ? (
        <div className="bg-red-900/20 rounded p-2">
          <div className="text-[10px] text-red-400">{result.error}</div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-2">
          Waiting for input...
        </div>
      )}
    </div>
  );
};

registerRenderer("llm-chat", LLMChatRenderer);
export default LLMChatRenderer;
