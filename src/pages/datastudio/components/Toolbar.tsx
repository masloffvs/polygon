import { Loader2, Play, Plus, Save, Square } from "lucide-react";
import { Panel } from "reactflow";

interface ToolbarProps {
	onAddNode: () => void;
	onSave: () => void;
	onRun: () => void;
	onStop: () => void;
	isRunning?: boolean;
}

export const Toolbar = ({
	onAddNode,
	onSave,
	onRun,
	onStop,
	isRunning = false,
}: ToolbarProps) => {
	return (
		<Panel position="top-center" className="!m-4">
			<div className="flex gap-1.5 bg-dark-800/90 backdrop-blur-xl rounded-2xl p-1.5 shadow-2xl shadow-black/30">
				<button
					onClick={onAddNode}
					className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium transition-all"
				>
					<Plus size={14} />
					Add
				</button>
				<button
					onClick={onSave}
					className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-xl text-xs font-medium transition-all"
				>
					<Save size={14} />
					Save
				</button>
				<div className="w-px h-5 bg-white/10 mx-1 self-center"></div>
				{isRunning ? (
					<>
						<div className="flex items-center gap-2 px-4 py-2 bg-lime-500/10 text-lime-400/60 rounded-xl text-xs font-medium cursor-not-allowed">
							<Loader2 size={14} className="animate-spin" />
							Running
						</div>
						<button
							onClick={onStop}
							className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl text-xs font-medium transition-all"
						>
							<Square size={14} />
							Stop
						</button>
					</>
				) : (
					<>
						<button
							onClick={onRun}
							className="flex items-center gap-2 px-4 py-2 bg-lime-500/15 hover:bg-lime-500/25 text-lime-400 rounded-xl text-xs font-medium transition-all"
						>
							<Play size={14} />
							Run
						</button>
						<button
							onClick={onStop}
							disabled
							className="flex items-center gap-2 px-4 py-2 text-gray-600 rounded-xl text-xs font-medium cursor-not-allowed"
						>
							<Square size={14} />
							Stop
						</button>
					</>
				)}
			</div>
		</Panel>
	);
};
