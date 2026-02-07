import { ErrorBoundary } from "@/ui/components";
import classNames from "classnames";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Handle, Position } from "reactflow";
import { getRenderer } from "../renderers";
import {
  type DataType,
  getTypeColor,
  getTypeShortName,
} from "../utils/portTypes";

// Fallback UI for crashed node renderers
const NodeErrorFallback = ({ nodeLabel }: { nodeLabel?: string }) => (
  <div className="flex flex-col items-center justify-center p-3 text-center">
    <AlertTriangle size={16} className="text-red-400 mb-1" />
    <span className="text-[10px] text-red-400 font-medium">Renderer Error</span>
    <span className="text-[9px] text-gray-500 mt-0.5">
      {nodeLabel || "Node"} crashed
    </span>
  </div>
);

// Memoized renderer wrapper to prevent unnecessary re-renders
// NOTE: We intentionally DON'T deeply memoize here - latestResult changes frequently
// and we want the renderer to update. The throttling is handled in DataStudio.tsx
const MemoizedRenderer = ({
  typeId,
  latestResult,
  nodeData,
}: {
  typeId: string;
  latestResult: any;
  nodeData: any;
}) => {
  const CustomRenderer = getRenderer(typeId);
  if (!CustomRenderer) return null;
  return (
    <ErrorBoundary
      fallback={<NodeErrorFallback nodeLabel={nodeData?.label} />}
      onError={(error) => {
        console.error(`[StudioNode] Renderer "${typeId}" crashed:`, error);
      }}
    >
      <CustomRenderer data={latestResult} nodeData={nodeData} />
    </ErrorBoundary>
  );
};

MemoizedRenderer.displayName = "MemoizedRenderer";

// NOTE: Not using memo() for StudioNode because ReactFlow handles node updates
// and we need latestResult to propagate correctly
export const StudioNode = ({
  data,
  selected,
}: {
  data: any;
  selected: boolean;
}) => {
  const hasCustomRenderer = !!data.typeId && !!getRenderer(data.typeId);
  const isExecuting = data.status === "live" || data.status === "executing";

  // Static node data for renderer (no memoization needed now)
  const staticNodeData = {
    id: data.id,
    typeId: data.typeId,
    label: data.label,
    settings: data.settings,
    manifest: data.manifest,
  };

  return (
    <div
      className={classNames(
        "rounded-xl transition-all duration-200 relative",
        isExecuting
          ? "bg-dark-600/90 ring-1 ring-lime-400/40"
          : "bg-dark-700/60",
        selected && !isExecuting ? "ring-1 ring-white/20" : "",
        !selected && !isExecuting && "hover:bg-dark-600/70",
        hasCustomRenderer ? "min-w-[12rem] w-auto max-w-md" : "w-52",
      )}
    >
      {/* Executing indicator - тонкая линия сверху */}
      {isExecuting && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-lime-400 rounded-t-xl">
          <div className="absolute inset-0 bg-lime-400 animate-ping opacity-75" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className={classNames(
              "w-2 h-2 rounded-full flex-shrink-0 transition-all",
              isExecuting ? "bg-lime-400 animate-pulse" : "opacity-80",
              !isExecuting &&
                !data.customColor &&
                (data.color || "bg-gray-500"),
            )}
            style={
              !isExecuting && data.customColor
                ? { backgroundColor: data.customColor }
                : {}
            }
          />
          <span
            className={classNames(
              "text-[11px] font-medium uppercase tracking-wide truncate transition-colors",
              isExecuting ? "text-lime-400/80" : "text-gray-400",
            )}
          >
            {data.typeLabel || "Node"}
          </span>
        </div>

        {/* View Icon - opens visualization in new tab */}
        {data.view?.id && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Merge static args with dynamic node context
              const viewArgs = {
                ...data.view.args,
                nodeId: data.id,
                ...data.settings, // Include all node settings (template, etc.)
              };
              const viewUrl = `/datastudio/view/${data.view.id}?args=${encodeURIComponent(JSON.stringify(viewArgs))}`;
              window.open(viewUrl, "_blank");
            }}
            className="p-1 rounded hover:bg-white/10 transition-colors group"
            title={`Open ${data.view.id} visualization`}
          >
            <BarChart3
              size={14}
              className="text-gray-500 group-hover:text-purple-400 transition-colors"
            />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4">
        <div
          className="text-sm font-medium text-white/90 mb-1.5 truncate"
          title={data.label}
        >
          {data.label || "New Node"}
        </div>
        <div className="text-xs text-gray-500 line-clamp-2 min-h-[1.5em] leading-relaxed">
          {data.description || "No description provided"}
        </div>

        {/* Custom Renderer Injection */}
        {hasCustomRenderer && data.typeId && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <MemoizedRenderer
              typeId={data.typeId}
              latestResult={data.latestResult}
              nodeData={staticNodeData}
            />
          </div>
        )}
      </div>

      {/* Footer Stats (Optional) */}
      {data.stats && (
        <div className="px-4 py-2.5 bg-dark-800/40 rounded-b-xl flex justify-between text-[10px] text-gray-500 font-mono">
          <span>↓ {data.stats.in || 0}</span>
          <span>↑ {data.stats.out || 0}</span>
        </div>
      )}

      {/* Dynamic Input Handles from Manifest */}
      {data.manifest?.ports?.inputs?.length > 0 ? (
        data.manifest.ports.inputs.map((port: any, idx: number) => {
          const portType = (port.type as DataType) || "any";
          const portColor = getTypeColor(portType);
          const isTyped = portType.startsWith("typed:");
          return (
            <Handle
              key={`in-${port.name}`}
              id={port.name}
              type="target"
              position={Position.Left}
              style={{
                top: `${30 + idx * 20}%`,
                backgroundColor: portColor,
                borderColor: isTyped ? portColor : undefined,
              }}
              className={classNames(
                "!w-2.5 !h-2.5 !rounded-full !border-2 transition-all",
                isTyped
                  ? "!border-opacity-30 hover:!scale-125"
                  : "!border-dark-700 hover:!bg-lime-400 hover:!border-lime-400/30",
              )}
              title={`${port.name} (${getTypeShortName(portType)})`}
            />
          );
        })
      ) : (
        <Handle
          type="target"
          id="input"
          position={Position.Left}
          className="!bg-gray-600 !w-2 !h-2 !rounded-full !border-2 !border-dark-700 !left-2 hover:!bg-lime-400 hover:!border-lime-400/30 transition-all"
        />
      )}

      {/* Dynamic Output Handles from Manifest */}
      {data.manifest?.ports?.outputs?.length > 0 ? (
        data.manifest.ports.outputs.map((port: any, idx: number) => {
          const portType = (port.type as DataType) || "any";
          const portColor = getTypeColor(portType);
          const isTyped = portType.startsWith("typed:");
          return (
            <Handle
              key={`out-${port.name}`}
              id={port.name}
              type="source"
              position={Position.Right}
              style={{
                top: `${30 + idx * 20}%`,
                backgroundColor: portColor,
                borderColor: isTyped ? portColor : undefined,
              }}
              className={classNames(
                "!w-2.5 !h-2.5 !rounded-full !border-2 transition-all",
                isTyped
                  ? "!border-opacity-30 hover:!scale-125"
                  : "!border-dark-700 hover:!bg-lime-400 hover:!border-lime-400/30",
              )}
              title={`${port.name} (${getTypeShortName(portType)})`}
            />
          );
        })
      ) : (
        <Handle
          type="source"
          id="output"
          position={Position.Right}
          className="!bg-gray-500 !w-2 !h-2 !rounded-full !border-2 !border-dark-700 !right-2 hover:!bg-lime-400 hover:!border-lime-400/30 transition-all"
        />
      )}
    </div>
  );
};

StudioNode.displayName = "StudioNode";
