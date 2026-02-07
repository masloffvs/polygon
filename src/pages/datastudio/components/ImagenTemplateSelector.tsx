import type React from "react";
import { useEffect, useState } from "react";

interface ImagenTemplateSelectorProps {
	value: string;
	onChange: (value: string) => void;
}

export const ImagenTemplateSelector: React.FC<ImagenTemplateSelectorProps> = ({
	value,
	onChange,
}) => {
	const [templates, setTemplates] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchTemplates = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/datastudio/imagen/templates");
				if (res.ok) {
					const data = await res.json();
					setTemplates(data);
				}
			} catch (err) {
				console.error("Failed to fetch Imagen templates", err);
			} finally {
				setLoading(false);
			}
		};

		fetchTemplates();
	}, []);

	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={loading}
			className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all appearance-none cursor-pointer"
		>
			<option value="">Select a template...</option>
			{templates.map((template) => (
				<option key={template} value={template}>
					{template}
				</option>
			))}
			{loading && <option disabled>Loading...</option>}
			{!loading && templates.length === 0 && (
				<option disabled>No templates found</option>
			)}
		</select>
	);
};
