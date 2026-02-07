import { AlertCircle, Image, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

interface TemplateSchema {
	properties?: Record<
		string,
		{
			type: string;
			default?: any;
			description?: string;
			minimum?: number;
			maximum?: number;
		}
	>;
	required?: string[];
}

/**
 * Imagen Renderer
 *
 * Shows selected template and expected input fields based on template schema.
 */
const ImagenRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
	const [schema, setSchema] = useState<TemplateSchema | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const template = nodeData.settings?.template as string | undefined;
	const imageOutput = data?.image?.value;
	const errorOutput = data?.error?.value;

	useEffect(() => {
		if (!template) {
			setSchema(null);
			setError(null);
			return;
		}

		const fetchSchema = async () => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`/api/datastudio/imagen/templates/${template}`);
				if (res.ok) {
					const schemaData = await res.json();
					setSchema(schemaData);
				} else {
					setError("Template not found");
					setSchema(null);
				}
			} catch (_err) {
				setError("Failed to load schema");
				setSchema(null);
			} finally {
				setLoading(false);
			}
		};

		fetchSchema();
	}, [template]);

	const getTypeColor = (type: string) => {
		switch (type) {
			case "string":
				return "text-green-400";
			case "number":
				return "text-blue-400";
			case "boolean":
				return "text-yellow-400";
			case "array":
				return "text-purple-400";
			case "object":
				return "text-orange-400";
			default:
				return "text-gray-400";
		}
	};

	return (
		<div className="flex flex-col gap-2 p-3 w-full min-w-[200px]">
			{/* Status indicator */}
			<div className="flex items-center gap-2">
				<div
					className={`w-2 h-2 rounded-full ${
						errorOutput
							? "bg-red-500"
							: imageOutput
								? "bg-green-500"
								: "bg-gray-500"
					}`}
				/>
				<span className="text-xs font-medium text-white/80">
					{errorOutput
						? "Error"
						: imageOutput
							? "Generated"
							: "Waiting for data"}
				</span>
			</div>

			{/* Template badge */}
			{template ? (
				<div className="bg-pink-500/10 border border-pink-500/30 rounded px-2 py-1">
					<div className="flex items-center gap-2">
						<Image className="w-3 h-3 text-pink-400" />
						<span className="text-xs font-mono text-pink-400">{template}</span>
					</div>
				</div>
			) : (
				<div className="text-xs text-white/40 italic">No template selected</div>
			)}

			{/* Schema fields */}
			{loading ? (
				<div className="flex items-center gap-2 text-xs text-white/50">
					<Loader2 className="w-3 h-3 animate-spin" />
					Loading...
				</div>
			) : error ? (
				<div className="flex items-center gap-2 text-xs text-red-400">
					<AlertCircle className="w-3 h-3" />
					{error}
				</div>
			) : schema?.properties ? (
				<div className="bg-white/5 rounded p-2 space-y-1">
					<div className="text-[10px] text-white/40 uppercase tracking-wide mb-1">
						Expected Input
					</div>
					{Object.entries(schema.properties).map(([key, prop]) => (
						<div
							key={key}
							className="flex items-center justify-between text-xs"
						>
							<span
								className={`font-mono ${
									schema.required?.includes(key)
										? "text-white/90"
										: "text-white/50"
								}`}
							>
								{key}
								{schema.required?.includes(key) && (
									<span className="text-red-400 ml-0.5">*</span>
								)}
							</span>
							<span
								className={`font-mono text-[10px] ${getTypeColor(prop.type)}`}
							>
								{prop.type}
							</span>
						</div>
					))}
				</div>
			) : null}

			{/* Error output */}
			{errorOutput && (
				<div className="bg-red-500/10 border border-red-500/30 rounded p-2">
					<div className="text-xs text-red-400">{errorOutput.message}</div>
				</div>
			)}

			{/* Generated image preview */}
			{imageOutput && (
				<div className="bg-white/5 rounded p-2 space-y-1">
					<div className="flex justify-between items-center text-xs">
						<span className="text-white/60">Size:</span>
						<span className="text-white/90">
							{imageOutput.width}×{imageOutput.height}
						</span>
					</div>
					<div className="flex justify-between items-center text-xs">
						<span className="text-white/60">Bytes:</span>
						<span className="text-white/90">
							{(imageOutput.size / 1024).toFixed(1)} KB
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

registerRenderer("imagen", ImagenRenderer);
export default ImagenRenderer;
