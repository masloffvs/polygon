import {
	ArrowDown,
	ArrowUp,
	Box,
	CornerDownLeft,
	Play,
	Plus,
	Save,
	Search,
	Square,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface SpotlightProps {
	isOpen: boolean;
	onClose: () => void;
	library: any[];
	onAddNode: (manifest: any) => void;
	onRun: () => void;
	onStop: () => void;
	onSave: () => void;
}

export const Spotlight = ({
	isOpen,
	onClose,
	library,
	onAddNode,
	onRun,
	onStop,
	onSave,
}: SpotlightProps) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Build flat list of all items for keyboard navigation
	const allItems = useMemo(() => {
		const commands = [
			{
				type: "command",
				label: "Run Graph",
				icon: Play,
				action: onRun,
				color: "text-lime-400",
			},
			{
				type: "command",
				label: "Stop Execution",
				icon: Square,
				action: onStop,
				color: "text-rose-400",
			},
			{
				type: "command",
				label: "Save & Deploy",
				icon: Save,
				action: onSave,
				color: "text-blue-400",
			},
		].filter(
			(cmd) =>
				searchQuery.length > 0 &&
				cmd.label
					.toLowerCase()
					.includes(searchQuery.toLowerCase().replace(">", "").trim()),
		);

		const nodes = library
			.filter(
				(n) =>
					n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					n.description.toLowerCase().includes(searchQuery.toLowerCase()),
			)
			.map((n) => ({ type: "node", ...n }));

		return [...commands, ...nodes];
	}, [searchQuery, library, onRun, onStop, onSave]);

	// Reset selection when search changes
	useEffect(() => {
		setSelectedIndex(0);
	}, []);

	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			setTimeout(() => searchInputRef.current?.focus(), 50);
		} else {
			setSearchQuery("");
			setSelectedIndex(0);
		}
	}, [isOpen]);

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				const item = allItems[selectedIndex];
				if (item) {
					if (item.type === "command") {
						(item as any).action();
						onClose();
					} else {
						onAddNode(item);
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, allItems, selectedIndex, onClose, onAddNode]);

	// Scroll selected item into view
	useEffect(() => {
		if (listRef.current) {
			const selected = listRef.current.querySelector(
				`[data-index="${selectedIndex}"]`,
			);
			if (selected) {
				selected.scrollIntoView({ block: "nearest" });
			}
		}
	}, [selectedIndex]);

	if (!isOpen) return null;

	let itemIndex = -1;

	return (
		<div
			className="absolute inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-md"
			onClick={onClose}
		>
			<div
				className="w-[560px] bg-dark-800/95 rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search Bar */}
				<div className="p-5 flex items-center gap-3">
					<Search className="text-gray-500" size={18} />
					<input
						ref={searchInputRef}
						className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder-gray-600 font-normal"
						placeholder="Search nodes or type a command..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					<span className="px-2 py-1 rounded-lg bg-white/5 text-[10px] text-gray-500 font-mono">
						esc
					</span>
				</div>

				<div
					ref={listRef}
					className="flex-1 overflow-y-auto custom-scrollbar px-2"
				>
					{/* Commands Section */}
					{searchQuery.length > 0 &&
						allItems.some((i) => i.type === "command") && (
							<div className="py-2">
								<div className="px-3 py-2 text-[11px] font-medium text-gray-500">
									Commands
								</div>
								{allItems
									.filter((i) => i.type === "command")
									.map((cmd: any) => {
										itemIndex++;
										const idx = itemIndex;
										return (
											<div
												key={cmd.label}
												data-index={idx}
												onClick={() => {
													cmd.action();
													onClose();
												}}
												className={`mx-1 px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 group transition-colors ${
													selectedIndex === idx
														? "bg-white/10"
														: "hover:bg-white/5"
												}`}
											>
												<cmd.icon size={15} className={cmd.color} />
												<span
													className={`text-sm transition-colors ${
														selectedIndex === idx
															? "text-white"
															: "text-gray-400 group-hover:text-white"
													}`}
												>
													{cmd.label}
												</span>
											</div>
										);
									})}
							</div>
						)}

					{/* Nodes Section */}
					<div className="py-2">
						<div className="px-3 py-2 text-[11px] font-medium text-gray-500">
							{searchQuery ? "Matching Nodes" : "Nodes"}
						</div>
						{allItems
							.filter((i) => i.type === "node")
							.map((n: any) => {
								itemIndex++;
								const idx = itemIndex;
								return (
									<div
										key={n.id}
										data-index={idx}
										onClick={() => {
											onAddNode(n);
										}}
										className={`mx-1 px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 group transition-colors ${
											selectedIndex === idx ? "bg-white/10" : "hover:bg-white/5"
										}`}
									>
										<div
											className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 opacity-80"
											style={{
												backgroundColor: n.ui?.color || "#374151",
											}}
										>
											<Box size={12} className="text-white/90" />
										</div>
										<div className="flex-1 overflow-hidden">
											<div className="flex justify-between items-center">
												<span
													className={`text-sm font-medium transition-colors ${
														selectedIndex === idx
															? "text-white"
															: "text-gray-300 group-hover:text-white"
													}`}
												>
													{n.name}
												</span>
												<span className="text-[10px] text-gray-600">
													{n.category}
												</span>
											</div>
											<div className="text-xs text-gray-600 truncate mt-0.5">
												{n.description}
											</div>
										</div>
										<Plus
											size={14}
											className={`transition-all ${
												selectedIndex === idx
													? "text-white opacity-100"
													: "text-gray-600 group-hover:text-white opacity-0 group-hover:opacity-100"
											}`}
										/>
									</div>
								);
							})}
					</div>
				</div>

				{/* Footer Hint */}
				<div className="p-3 flex gap-4 text-[10px] text-gray-600 justify-center">
					<span className="flex items-center gap-1.5">
						<ArrowUp size={10} />
						<ArrowDown size={10} />
						navigate
					</span>
					<span className="flex items-center gap-1.5">
						<CornerDownLeft size={10} /> select
					</span>
					<span className="flex items-center gap-1.5">
						<Zap size={10} /> search
					</span>
				</div>
			</div>
		</div>
	);
};
