import { Construction } from "lucide-react";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

interface PlaceholderProps {
	title: string;
}

function PlaceholderComponent({ title }: PlaceholderProps) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center p-6 text-[#666666]">
			<div className="w-16 h-16 border border-[#222] bg-[#0a0a0a] rounded-full flex items-center justify-center mb-4">
				<Construction size={32} className="text-[#333]" />
			</div>
			<h1 className="text-xl font-light text-[#e0e0e0] mb-2">{title}</h1>
			<p className="font-mono text-xs">This page is under construction.</p>
		</div>
	);
}

export const Placeholder = withErrorBoundary(PlaceholderComponent, {
  title: "Placeholder",
});
