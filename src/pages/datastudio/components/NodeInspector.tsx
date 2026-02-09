import classNames from "classnames";
import { BarChart3, Settings, Trash2 } from "lucide-react";
import { Panel } from "reactflow";
import { ExportChannelSelector } from "./ExportChannelSelector";
import { ImagenTemplateSelector } from "./ImagenTemplateSelector";
import { SourceSelector } from "./SourceSelector";

interface NodeInspectorProps {
  selectedNode: Node | null;
  onUpdate: (key: string, value: any) => void;
  onDelete: () => void;
}

export const NodeInspector = ({
  selectedNode,
  onUpdate,
  onDelete,
}: NodeInspectorProps) => {
  if (!selectedNode) return null;

  return (
    <Panel position="top-right" className="m-4">
      <div className="w-72 bg-dark-800/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/30 p-5 flex flex-col gap-5 text-white">
        <div className="flex justify-between items-center">
          <span className="font-medium text-sm flex items-center gap-2 text-gray-200">
            <Settings size={14} className="text-gray-500" />
            Settings
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] text-gray-500 font-medium">
              Label
            </label>
            <input
              value={selectedNode.data.label}
              onChange={(e) => onUpdate("label", e.target.value)}
              className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-gray-500 font-medium">
              Type ID
            </label>
            <input
              value={selectedNode.data.typeId || ""}
              placeholder="debug-log"
              onChange={(e) => onUpdate("typeId", e.target.value)}
              className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-gray-500 font-medium">
              Category
            </label>
            <select
              value={selectedNode.data.typeLabel}
              onChange={(e) => onUpdate("typeLabel", e.target.value)}
              className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all appearance-none cursor-pointer"
            >
              <option value="Source">Source</option>
              <option value="Processor">Processor</option>
              <option value="Storage">Storage</option>
              <option value="Output">Output</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-gray-500 font-medium">
              Description
            </label>
            <textarea
              value={selectedNode.data.description}
              onChange={(e) => onUpdate("description", e.target.value)}
              rows={2}
              className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all resize-none placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-gray-500 font-medium">
              Color
            </label>
            <div className="flex gap-2.5">
              {[
                "bg-blue-500",
                "bg-lime-500",
                "bg-amber-500",
                "bg-violet-500",
                "bg-rose-500",
              ].map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => onUpdate("color", color)}
                  className={classNames(
                    "w-5 h-5 rounded-full transition-all hover:scale-110",
                    color,
                    selectedNode.data.color === color
                      ? "ring-2 ring-white/60 ring-offset-2 ring-offset-dark-800"
                      : "opacity-60 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </div>

          {/* Dynamic Settings from Manifest */}
          {selectedNode.data.manifest?.settings &&
            (Array.isArray(selectedNode.data.manifest.settings)
              ? selectedNode.data.manifest.settings
              : Object.values(selectedNode.data.manifest.settings)
            ).map((schema: any) => {
              const key = schema.name;
              return (
                <div key={key} className="space-y-2">
                  <label className="text-[11px] text-gray-500 font-medium">
                    {schema.label || key}
                  </label>
                  {schema.type === "boolean" ? (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(
                          `settings.${key}`,
                          !selectedNode.data.settings?.[key],
                        )
                      }
                      className={classNames(
                        "w-10 h-5 rounded-full transition-all relative",
                        selectedNode.data.settings?.[key]
                          ? "bg-lime-500"
                          : "bg-dark-600",
                      )}
                    >
                      <div
                        className={classNames(
                          "w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all",
                          selectedNode.data.settings?.[key]
                            ? "left-5"
                            : "left-0.5",
                        )}
                      />
                    </button>
                  ) : schema.type === "export-channel-selector" ? (
                    <ExportChannelSelector
                      value={selectedNode.data.settings?.[key] ?? ""}
                      onChange={(val) => onUpdate(`settings.${key}`, val)}
                    />
                  ) : schema.type === "imagen-template-selector" ? (
                    <ImagenTemplateSelector
                      value={selectedNode.data.settings?.[key] ?? ""}
                      onChange={(val) => onUpdate(`settings.${key}`, val)}
                    />
                  ) : schema.type === "source-selector" ? (
                    <SourceSelector
                      value={selectedNode.data.settings?.[key] ?? ""}
                      onChange={(val) => onUpdate(`settings.${key}`, val)}
                    />
                  ) : schema.type === "select" ? (
                    <select
                      value={
                        selectedNode.data.settings?.[key] ?? schema.default
                      }
                      onChange={(e) =>
                        onUpdate(`settings.${key}`, e.target.value)
                      }
                      className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all appearance-none cursor-pointer"
                    >
                      {schema.options?.map(
                        (opt: string | { value: string; label: string }) => {
                          const value =
                            typeof opt === "string" ? opt : opt.value;
                          const label =
                            typeof opt === "string" ? opt : opt.label;
                          return (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          );
                        },
                      )}
                    </select>
                  ) : schema.type === "number" ? (
                    <input
                      type="number"
                      value={
                        selectedNode.data.settings?.[key] ??
                        schema.default ??
                        ""
                      }
                      onChange={(e) =>
                        onUpdate(`settings.${key}`, Number(e.target.value))
                      }
                      className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono"
                    />
                  ) : (
                    <input
                      value={
                        selectedNode.data.settings?.[key] ??
                        schema.default ??
                        ""
                      }
                      placeholder={schema.placeholder}
                      onChange={(e) =>
                        onUpdate(`settings.${key}`, e.target.value)
                      }
                      className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                    />
                  )}
                  {schema.description && (
                    <p className="text-[10px] text-gray-600">
                      {schema.description}
                    </p>
                  )}
                </div>
              );
            })}

          {/* View Configuration */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <label className="text-[11px] text-gray-500 font-medium flex items-center gap-1.5">
              <BarChart3 size={12} className="text-purple-400" />
              Visualization
            </label>
            <input
              value={selectedNode.data.view?.id ?? ""}
              placeholder="View ID (e.g., TestView)"
              onChange={(e) => {
                const viewId = e.target.value;
                if (viewId) {
                  onUpdate("view", {
                    ...selectedNode.data.view,
                    id: viewId,
                  });
                } else {
                  onUpdate("view", undefined);
                }
              }}
              className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono placeholder:text-gray-600"
            />
            {selectedNode.data.view?.id && (
              <button
                type="button"
                onClick={() => {
                  // Merge static args with dynamic node context
                  const viewArgs = {
                    ...selectedNode.data.view.args,
                    nodeId: selectedNode.id,
                    ...selectedNode.data.settings, // Include all node settings
                  };
                  const viewUrl = `/datastudio/view/${selectedNode.data.view.id}?args=${encodeURIComponent(JSON.stringify(viewArgs))}`;
                  window.open(viewUrl, "_blank");
                }}
                className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2"
              >
                <BarChart3 size={12} />
                Open Visualization
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 text-[10px] text-gray-600 font-mono">
          {selectedNode.id}
        </div>
      </div>
    </Panel>
  );
};
