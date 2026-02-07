import { type NodeRendererProps, registerRenderer } from "./registry";

/**
 * StringTemplate Renderer
 *
 * Shows the template text directly on the node with highlighted placeholders.
 */
const StringTemplateRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const template = nodeData?.settings?.template || "Hello, (name)!";
  const result = data?.result?.value;

  // Highlight placeholders like (name || 'default')
  const highlightedTemplate = template
    .split(/(\([^)]+\))/)
    .map((part: string, i: number) => {
      if (part.startsWith("(") && part.endsWith(")")) {
        return (
          <span key={i} className="text-amber-400 font-semibold">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[180px]">
      {/* Template preview */}
      <div className="bg-dark-900/60 rounded-lg p-2">
        <div className="text-[9px] text-gray-500 mb-1">template</div>
        <div className="text-xs text-white/90 font-mono break-all leading-relaxed">
          {highlightedTemplate}
        </div>
      </div>

      {/* Last output */}
      {result !== undefined && (
        <div className="bg-lime-500/10 rounded-lg p-2">
          <div className="text-[9px] text-lime-400/60 mb-1">output</div>
          <div className="text-xs text-lime-400 font-mono break-all max-h-16 overflow-y-auto">
            {String(result)}
          </div>
        </div>
      )}
    </div>
  );
};

registerRenderer("string-template", StringTemplateRenderer);
export default StringTemplateRenderer;
