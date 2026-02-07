import dagre from "dagre";
import { useCallback, useEffect, useRef, useState } from "react";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

import ReactFlow, {
	Background,
	Controls,
	Handle,
	Position,
	useEdgesState,
	useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

// --- Draggable Floating Window ---
interface FloatingWindowProps {
	data: any;
	onClose: () => void;
	initialPosition?: { x: number; y: number };
}

const FloatingTopicWindow = ({
	data,
	onClose,
	initialPosition,
}: FloatingWindowProps) => {
	const windowRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState(
		initialPosition || { x: 100, y: 100 },
	);
	const [isDragging, setIsDragging] = useState(false);
	const dragOffset = useRef({ x: 0, y: 0 });

	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		if ((e.target as HTMLElement).closest("button, pre, .no-drag")) return;
		setIsDragging(true);
		const rect = windowRef.current?.getBoundingClientRect();
		if (rect) {
			dragOffset.current = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			};
		}
		e.preventDefault();
	}, []);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			setPosition({
				x: e.clientX - dragOffset.current.x,
				y: e.clientY - dragOffset.current.y,
			});
		};

		const handleMouseUp = () => setIsDragging(false);

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging]);

	return (
		<div
			ref={windowRef}
			onMouseDown={handleMouseDown}
			style={{ left: position.x, top: position.y }}
			className={`fixed w-96 bg-dark-800/95 backdrop-blur-xl shadow-2xl rounded-lg z-[100] overflow-hidden flex flex-col max-h-[70vh] select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"
				}`}
		>
			{/* Header - Drag Handle */}
			<div className="flex justify-between items-center p-3 bg-dark-700/50">
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 rounded-full bg-orange-500" />
					<h3 className="text-orange-400 font-bold uppercase text-[11px] tracking-wider">
						{data.id}
					</h3>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-gray-600 text-[9px]">TOPIC</span>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-white transition-colors text-sm px-1"
					>
						✕
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="p-3 flex-1 overflow-auto">
				{/* Stats Grid */}
				<div className="grid grid-cols-3 gap-2 mb-4">
					<div className="bg-dark-900/50 p-2.5 rounded-md">
						<div className="text-gray-500 text-[8px] uppercase mb-1 tracking-wide">
							Throughput
						</div>
						<div className="text-lg text-white font-medium">
							{formatBytes(data.bytesProcessed)}
						</div>
					</div>
					<div className="bg-dark-900/50 p-2.5 rounded-md">
						<div className="text-gray-500 text-[8px] uppercase mb-1 tracking-wide">
							Messages
						</div>
						<div className="text-lg text-white font-medium">
							{data.messagesCount || 0}
						</div>
					</div>
					<div className="bg-dark-900/50 p-2.5 rounded-md">
						<div className="text-gray-500 text-[8px] uppercase mb-1 tracking-wide">
							Avg Size
						</div>
						<div className="text-lg text-white font-medium">
							{data.messagesCount
								? formatBytes(data.bytesProcessed / data.messagesCount)
								: "—"}
						</div>
					</div>
				</div>

				{/* Connection Info */}
				{(data.sources?.length > 0 || data.targets?.length > 0) && (
					<div className="grid grid-cols-2 gap-2 mb-4">
						{data.sources?.length > 0 && (
							<div className="bg-dark-900/40 p-2 rounded-md">
								<div className="text-gray-500 text-[8px] uppercase mb-1">
									Sources
								</div>
								<div className="text-[10px] text-gray-300 space-y-0.5">
									{data.sources.map((s: string) => (
										<div key={s} className="truncate">
											← {s}
										</div>
									))}
								</div>
							</div>
						)}
						{data.targets?.length > 0 && (
							<div className="bg-dark-900/40 p-2 rounded-md">
								<div className="text-gray-500 text-[8px] uppercase mb-1">
									Targets
								</div>
								<div className="text-[10px] text-gray-300 space-y-0.5">
									{data.targets.map((t: string) => (
										<div key={t} className="truncate">
											→ {t}
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Recent Packets */}
				<div className="text-gray-500 text-[9px] uppercase mb-2 tracking-wide flex items-center gap-2">
					<span>Recent Packets</span>
					<span className="text-gray-700">
						({data.lastEvents?.length || 0})
					</span>
				</div>

				<div className="space-y-2 no-drag">
					{data.lastEvents?.map((ev: any, i: number) => (
						<div
							key={i}
							className="bg-dark-900/50 p-3 rounded-md text-[10px] text-gray-400 hover:bg-dark-900/70 transition-colors"
						>
							<div className="mb-2 text-gray-500 flex justify-between items-center text-[9px]">
								<span className="text-orange-500/80 font-medium">
									PACKET #{i + 1}
								</span>
								<span className="text-gray-600 font-mono">
									{new Date(ev.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<pre className="whitespace-pre-wrap break-all text-orange-400/90 text-[10px] leading-relaxed font-mono bg-dark-950/50 p-2 rounded overflow-auto max-h-40">
								{JSON.stringify(ev.data, null, 2).slice(0, 800)}
								{JSON.stringify(ev.data).length > 800 ? "\n..." : ""}
							</pre>
						</div>
					))}
					{(!data.lastEvents || data.lastEvents.length === 0) && (
						<div className="text-gray-600 text-center italic py-8 bg-dark-900/30 rounded-md text-[11px]">
							No active events captured yet
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="px-3 py-2 bg-dark-900/30 text-[8px] text-gray-600 flex justify-between">
				<span>Drag header to move</span>
				<span>Last update: {new Date().toLocaleTimeString()}</span>
			</div>
		</div>
	);
};

// --- Helpers ---
function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) return "0 B";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

// --- Custom Node Components ---

const StageNode = ({ data }: { data: any }) => {
	return (
		<div className="text-xs w-40 bg-dark-600/60 rounded flex flex-col relative overflow-hidden group hover:bg-dark-500/70 transition-all duration-150">
			{/* Type Indicator */}
			<div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-yellow-500" />

			{/* Content */}
			<div className="px-2 py-1.5 flex-1 min-w-0">
				<div
					className="text-gray-100 font-medium truncate text-[11px] leading-tight"
					title={data.label}
				>
					{data.label}
				</div>
				<div className="text-gray-500 text-[9px] truncate mt-0.5">
					{data.description || "stage"}
				</div>
			</div>

			{/* Handles */}
			<Handle
				type="target"
				position={Position.Left}
				className="!bg-yellow-500/50 !w-1.5 !h-3 !rounded-none !border-none !left-0"
			/>
			<Handle
				type="source"
				position={Position.Right}
				className="!bg-dark-400 !w-1.5 !h-1.5 !border-none hover:!bg-yellow-500"
			/>
		</div>
	);
};

const TopicNode = ({ data }: { data: any }) => {
	const stats = data.stats;
	return (
		<div>
			<div className="text-[10px] min-w-[100px] bg-dark-700/50 backdrop-blur-md rounded px-2 py-1 text-center text-gray-400 hover:text-orange-400 hover:bg-dark-600/50 transition-all cursor-pointer">
				<div className="text-gray-200 truncate max-w-[120px] font-medium text-[10px]">
					{data.label}
				</div>

				{stats && (
					<div className="mt-1 pt-1 text-[8px] flex justify-between gap-2 text-gray-500">
						<span>{formatBytes(stats.bytesProcessed)}</span>
						<span>{stats.messagesCount} msgs</span>
					</div>
				)}

				<Handle
					type="target"
					position={Position.Left}
					className="!bg-dark-600 !w-1.5 !h-1.5 !border-none !-ml-1.5"
				/>
				<Handle
					type="source"
					position={Position.Right}
					className="!bg-dark-600 !w-1.5 !h-1.5 !border-none !-mr-1.5"
				/>
			</div>
		</div>
	);
};

const ObservableCardNode = ({ data }: { data: any }) => {
	return (
		<div className="text-xs w-40 bg-dark-600/60 rounded flex flex-col relative overflow-hidden group hover:bg-dark-500/70 transition-all duration-150">
			{/* Type Indicator */}
			<div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />

			{/* Content */}
			<div className="px-2 py-1.5 flex-1 min-w-0">
				<div
					className="text-gray-100 font-medium truncate text-[11px] leading-tight"
					title={data.label}
				>
					{data.label}
				</div>
				<div className="text-gray-500 text-[9px] truncate mt-0.5">
					{data.description || "observable"}
				</div>
			</div>

			{/* Handles */}
			<Handle
				type="target"
				position={Position.Left}
				className="!bg-blue-500/50 !w-1.5 !h-3 !rounded-none !border-none !left-0"
			/>
		</div>
	);
};

const FunctionNode = ({ data }: { data: any }) => {
	const [showLogs, setShowLogs] = useState(false);
	const [logs, setLogs] = useState<any[]>([]);

	const fetchLogs = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowLogs(!showLogs);
		if (!showLogs) {
			fetch(`/api/system/logs?source=${data.label}`)
				.then((res) => res.json())
				.then(setLogs)
				.catch(console.error);
		}
	};

	return (
		<div
			className="text-xs w-40 bg-dark-600/60 rounded flex flex-col relative overflow-hidden group hover:bg-dark-500/70 transition-all duration-150 cursor-pointer"
			onClick={fetchLogs}
		>
			{/* Type Indicator */}
			<div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />

			{/* Content */}
			<div className="px-2 py-1.5 flex-1 min-w-0">
				<div
					className="text-gray-100 font-medium truncate text-[11px] leading-tight"
					title={data.label}
				>
					{data.label}
				</div>
				<div className="text-gray-500 text-[9px] truncate mt-0.5">
					{data.description || "function"}
				</div>
			</div>

			{/* Logs Overlay */}
			{showLogs && (
				<div className="absolute top-full left-0 w-52 mt-1 bg-dark-700 rounded p-2 z-50 max-h-32 overflow-auto shadow-xl">
					<div className="text-[8px] text-gray-500 font-bold mb-1">LOGS</div>
					{logs.length === 0 ? (
						<div className="text-[8px] text-gray-600 italic">No logs</div>
					) : (
						logs.map((log, idx) => (
							<div key={idx} className="mb-1 last:mb-0">
								<div className="text-[8px] text-red-400">{log.msg}</div>
								<div className="text-[7px] text-gray-600 mt-0.5">{log.ts}</div>
							</div>
						))
					)}
				</div>
			)}

			{/* Handle */}
			<Handle
				type="target"
				position={Position.Left}
				className="!bg-red-500/50 !w-1.5 !h-3 !rounded-none !border-none !left-0"
			/>
		</div>
	);
};

const AgentNode = ({ data }: { data: any }) => {
	return (
		<div className="text-xs w-40 bg-dark-600/60 rounded flex flex-col relative overflow-hidden group hover:bg-dark-500/70 transition-all duration-150">
			{/* Type Indicator */}
			<div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-500" />

			{/* Content */}
			<div className="px-2 py-1.5 flex-1 min-w-0">
				<div
					className="text-gray-100 font-medium truncate text-[11px] leading-tight"
					title={data.label}
				>
					{data.label}
				</div>
				<div className="text-green-400/70 text-[9px] truncate mt-0.5">
					{data.config?.model || "agent"}
				</div>
			</div>

			{/* Handles */}
			<Handle
				type="target"
				position={Position.Left}
				className="!bg-green-500/50 !w-1.5 !h-3 !rounded-none !border-none !left-0"
			/>
			<Handle
				type="source"
				position={Position.Right}
				className="!bg-dark-400 !w-1.5 !h-1.5 !border-none hover:!bg-green-500"
			/>
		</div>
	);
};

const nodeTypes = {
	stage: StageNode,
	topic: TopicNode,
	"observable-card": ObservableCardNode,
	function: FunctionNode,
	agent: AgentNode,
};

// --- Layout Logic ---

const getLayoutedElements = (nodes: any[], edges: any[]) => {
	const dagreGraph = new dagre.graphlib.Graph();
	dagreGraph.setDefaultEdgeLabel(() => ({}));

	// Tighter layout settings
	dagreGraph.setGraph({
		rankdir: "LR", // Left-to-Right
		nodesep: 20, // Vertical spacing between nodes (in LR mode)
		ranksep: 80, // Horizontal spacing between columns
		align: "UL", // Align Upper-Left (helps with packing)
	});

	nodes.forEach((node) => {
		// Dynamic sizing based on node type
		const isTopic = node.type === "topic";
		// Topic nodes are smaller, main cards are compact
		const width = isTopic ? 110 : 165;
		const height = isTopic ? 30 : 42;

		dagreGraph.setNode(node.id, { width, height });
	});

	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	nodes.forEach((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		// Recalculate dimensions for the shift
		const isTopic = node.type === "topic";
		const width = isTopic ? 110 : 180;
		const height = isTopic ? 35 : 80;

		node.position = {
			x: nodeWithPosition.x - width / 2,
			y: nodeWithPosition.y - height / 2,
		};
	});

	return { nodes, edges };
};

type ViewMode =
	| "ALL"
	| "BETTING"
	| "EXCHANGE"
	| "INFRA"
	| "TRAFFIC"
	| "IA"
	| "NEWS"
	| "MACRO";

function PipelineGraphComponent() {
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [currentView, setCurrentView] = useState<ViewMode>("ALL");
	const [floatingTopic, setFloatingTopic] = useState<{
		data: any;
		position: { x: number; y: number };
	} | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		// Check initial status via API with cache busting
		fetch(`/api/system/status?_t=${Date.now()}`, {
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
				Expires: "0",
			},
		})
			.then((res) => res.json())
			.then((data) => {
				console.log("System Status API:", data);
				if (typeof data.isRunning === "boolean") {
					setIsRunning(data.isRunning);
				}
			})
			.catch((err) => console.error("Failed to fetch status:", err));

		// Setup WebSocket
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const host = window.location.host;
		const ws = new WebSocket(`${protocol}//${host}/ws`);
		wsRef.current = ws;

		ws.onopen = () => {
			console.log("WS Connected, subscribing...");
			ws.send(JSON.stringify({ type: "datastudio:subscribe" }));
			ws.send(JSON.stringify({ type: "datastudio:get-status" }));
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "datastudio:status") {
					console.log("WS Status Update:", data);
					setIsRunning(data.isRunning);
				} else if (data.type === "datastudio:event") {
					if (data.event === "graph:start") setIsRunning(true);
					if (data.event === "graph:stop") setIsRunning(false);
				}
			} catch (e) {
				console.error("WS Parse error", e);
			}
		};

		return () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		};
	}, []);

	const toggleRuntime = () => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			if (isRunning) {
				wsRef.current.send(JSON.stringify({ type: "datastudio:stop" }));
				// Optimistic update
				setIsRunning(false);
			} else {
				wsRef.current.send(
					JSON.stringify({ type: "datastudio:run", options: {} }),
				);
				// Optimistic update
				setIsRunning(true);
			}
		}
	};

	const fetchData = () => {
		fetch("/api/pipeline/graph")
			.then((res) => res.json())
			.then((data) => {
				const rfNodes: any[] = [];
				const rfEdges: any[] = [];
				const addedNodes = new Set<string>();
				const stats = data.stats || {};

				// 1. Filter Nodes based on View
				const filteredStages = data.nodes.filter((stage: any) => {
					if (currentView === "ALL") return true;

					const id = stage.id.toLowerCase();
					const inputs = stage.inputs.join(" ").toLowerCase();
					const type = stage.type || "";

					// BETTING: Validates logic for Polyscan -> Polymarket Stream
					if (currentView === "BETTING") {
						return (
							id.includes("polymarket") ||
							id.includes("polyscan") ||
							id.includes("gamma") ||
							id.includes("whale") ||
							id.includes("degen") || // New Filter
							inputs.includes("polymarket")
						);
					}

					// EXCHANGES: Standard crypto exchanges + solana
					if (currentView === "EXCHANGE") {
						return (
							id.includes("binance") ||
							id.includes("bybit") ||
							id.includes("okx") ||
							id.includes("solana") ||
							id.includes("normalize") ||
							id.includes("average")
						);
					}

					// INFRA: Core components
					if (currentView === "INFRA") {
						return (
							id.includes("storage") ||
							type === "aggregator" ||
							id.includes("clickhouse") ||
							id.includes("scrapper") || // osint
							id.includes("news") ||
							id.includes("clock") || // World Clock
							id.includes("monitor")
						);
					}

					// IA: Agents
					if (currentView === "IA") {
						return (
							type === "agent" || id.includes("agent") || id.includes("openai")
						);
					}

					// TRAFFIC: New Traffic Sources
					if (currentView === "TRAFFIC") {
						return id.includes("traffic") || id.includes("511");
					}

					if (currentView === "NEWS") {
						return (
							id.includes("news") ||
							id.includes("rekt") ||
							id.includes("rss") ||
							id.includes("fear")
						);
					}

					if (currentView === "MACRO") {
						return (
							id.includes("inflation") ||
							id.includes("treasurie") || // Crypto Treasuries
							id.includes("index") || // Pizza Index?
							id.includes("massive") // Massive Market Status
						);
					}

					return false;
				});

				// 1. Create Stage Nodes
				filteredStages.forEach((stage: any) => {
					if (!addedNodes.has(stage.id)) {
						let nodeType = "stage";
						if (stage.type === "observable-card") nodeType = "observable-card";
						if (stage.type === "function") nodeType = "function";
						if (stage.type === "agent") nodeType = "agent";

						rfNodes.push({
							id: stage.id,
							type: nodeType,
							draggable: false,
							data: {
								label: stage.id,
								description: stage.description,
								config: stage.config, // Pass config for agents
							},
							position: { x: 0, y: 0 },
						});
						addedNodes.add(stage.id);
					}

					// 2. Create Input Topic Nodes & Edges
					// Special Handling: Group Solana Watchdog Topics
					const solanaTopics = stage.inputs.filter((t: string) =>
						t.startsWith("solana-watchdog-"),
					);
					const otherTopics = stage.inputs.filter(
						(t: string) => !t.startsWith("solana-watchdog-"),
					);

					// If we have many solana inputs, group them
					if (solanaTopics.length > 5) {
						const groupId = `group-solana-${stage.id}`;
						const totalBytes = solanaTopics.reduce(
							(acc: number, t: string) => acc + (stats[t]?.bytesProcessed || 0),
							0,
						);
						const totalMsgs = solanaTopics.reduce(
							(acc: number, t: string) => acc + (stats[t]?.messagesCount || 0),
							0,
						);

						if (!addedNodes.has(groupId)) {
							rfNodes.push({
								id: groupId,
								type: "topic", // Re-use topic style but darker/different?
								draggable: false,
								data: {
									label: `Solana Watchdogs (${solanaTopics.length})`,
									stats: {
										bytesProcessed: totalBytes,
										messagesCount: totalMsgs,
									},
								},
								position: { x: 0, y: 0 },
							});
							addedNodes.add(groupId);
						}

						rfEdges.push({
							id: `${groupId}->${stage.id}`,
							source: groupId,
							target: stage.id,
							type: "smoothstep",
							animated: false,
							style: {
								stroke: "rgba(255,255,255,0.15)",
								strokeWidth: 0.5,
							},
						});
					} else {
						// Treat normally
						otherTopics.push(...solanaTopics);
					}

					otherTopics.forEach((inputTopic: string) => {
						if (!addedNodes.has(inputTopic)) {
							rfNodes.push({
								id: inputTopic,
								type: "topic",
								draggable: false,
								data: {
									label: inputTopic,
									stats: stats[inputTopic],
								},
								position: { x: 0, y: 0 },
							});
							addedNodes.add(inputTopic);
						}
						rfEdges.push({
							id: `${inputTopic}->${stage.id}`,
							source: inputTopic,
							target: stage.id,
							type: "smoothstep",
							animated: false,
							style: {
								stroke: "rgba(255,255,255,0.15)",
								strokeWidth: 0.5,
							},
						});
					});

					// 3. Create Output Topic Nodes & Edges
					const outputTopic = stage.output;
					if (outputTopic && outputTopic !== "dashboard-ui") {
						if (!addedNodes.has(outputTopic)) {
							rfNodes.push({
								id: outputTopic,
								type: "topic",
								draggable: false,
								data: {
									label: outputTopic,
									stats: stats[outputTopic],
								},
								position: { x: 0, y: 0 },
							});
							addedNodes.add(outputTopic);
						}
						rfEdges.push({
							id: `${stage.id}->${outputTopic}`,
							source: stage.id,
							target: outputTopic,
							type: "smoothstep",
							animated: false,
							style: {
								stroke: "rgba(255,255,255,0.15)",
								strokeWidth: 0.5,
							},
						});
					}
				});

				const layouted = getLayoutedElements(rfNodes, rfEdges);
				setNodes(layouted.nodes);
				setEdges(layouted.edges);
			})
			.catch((err) => console.error("Failed to fetch graph", err));
	};

	useEffect(() => {
		fetchData();
		const interval = setInterval(fetchData, 3000); // Poll every 3s
		return () => clearInterval(interval);
	}, [fetchData]); // Re-fetch when view changes

	const onNodeClick = (event: any, node: any) => {
		// Toggle selection - if clicking same node, deselect
		if (selectedNodeId === node.id) {
			setSelectedNodeId(null);
			setSelectedNodeData(null);
			return;
		}

		setSelectedNodeId(node.id);

		if (node.type === "topic" && node.data.stats) {
			// Find connected nodes for context
			const sources = edges
				.filter((e) => e.target === node.id)
				.map((e) => e.source);
			const targets = edges
				.filter((e) => e.source === node.id)
				.map((e) => e.target);

			// Open floating window at click position
			setFloatingTopic({
				data: {
					type: "topic",
					id: node.id,
					sources,
					targets,
					...node.data.stats,
				},
				position: { x: event.clientX - 100, y: event.clientY - 50 },
			});
			setSelectedNodeData(null); // Don't show old panel for topics
		} else if (node.type === "agent") {
			setFloatingTopic(null);
			setSelectedNodeData({
				type: "agent",
				id: node.id,
				config: node.data.config,
			});
		} else {
			setFloatingTopic(null);
			setSelectedNodeData(null);
		}
	};

	// Click on background to deselect
	const onPaneClick = () => {
		setSelectedNodeId(null);
		setSelectedNodeData(null);
		// Don't close floating window on pane click - let user close it manually
	};

	// Compute connected nodes when selection changes
	const connectedNodeIds = selectedNodeId
		? new Set(
			edges
				.filter(
					(e) => e.source === selectedNodeId || e.target === selectedNodeId,
				)
				.flatMap((e) => [e.source, e.target]),
		)
		: null;

	// Apply opacity to nodes based on selection
	const styledNodes = nodes.map((node) => {
		if (!selectedNodeId || connectedNodeIds?.has(node.id)) {
			return { ...node, style: { ...node.style, opacity: 1 } };
		}
		return { ...node, style: { ...node.style, opacity: 0.25 } };
	});

	// Apply opacity to edges based on selection
	const styledEdges = edges.map((edge) => {
		if (
			!selectedNodeId ||
			edge.source === selectedNodeId ||
			edge.target === selectedNodeId
		) {
			return edge;
		}
		return {
			...edge,
			style: { ...edge.style, opacity: 0.15 },
		};
	});

	return (
		<div className="flex-1 flex flex-col h-full overflow-hidden relative bg-dark-800">
			{/* Overlay Title */}
			<div className="absolute top-6 left-8 z-10 pointer-events-auto select-none flex flex-col gap-4">
			
				{/* View Tabs */}
				<div className="flex gap-2">
					{(
						[
							"ALL",
							"BETTING",
							"EXCHANGE",
							"INFRA",
							"TRAFFIC",
							"IA",
							"NEWS",
							"MACRO",
						] as const
					).map((view) => (
						<button
							key={view}
							onClick={() => setCurrentView(view)}
							className={`
                px-2.5 py-1 text-[10px] font-bold tracking-wider rounded
                transition-all duration-200
                ${currentView === view
									? "bg-dark-600 text-white shadow-md"
									: "bg-dark-800/50 backdrop-blur-sm text-gray-500 hover:bg-dark-700 hover:text-gray-300"
								}
              `}
						>
							{view}
						</button>
					))}
				</div>
			</div>

			<div className="flex-1 h-full w-full">
				<ReactFlow
					nodes={styledNodes}
					edges={styledEdges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					nodeTypes={nodeTypes}
					onNodeClick={onNodeClick}
					onPaneClick={onPaneClick}
					fitView
					className="bg-dark-800"
					minZoom={0.5}
				>
					<Background color="#333" gap={24} size={1} className="opacity-20" />
					<Controls
						className="!bg-dark-800 !shadow-lg !rounded !border-none overflow-hidden [&>button]:!border-none [&>button]:!fill-gray-500 hover:[&>button]:!fill-white hover:[&>button]:!bg-dark-700"
						showInteractive={false}
					/>
				</ReactFlow>
			</div>

			{/* Details Panel Overlay */}
			{selectedNodeData && (
				<div className="absolute top-24 right-8 w-80 bg-dark-800/95 backdrop-blur-xl shadow-2xl p-4 rounded-lg z-50 overflow-hidden flex flex-col max-h-[80vh]">
					<div className="flex justify-between items-center mb-4 pb-2">
						<h3 className="text-orange-400 font-bold uppercase truncate text-xs tracking-wider">
							{selectedNodeData.id}
						</h3>
						<button
							onClick={() => setSelectedNodeData(null)}
							className="text-gray-500 hover:text-white transition-colors"
						>
							✕
						</button>
					</div>

					{/* AGENT DETAILS */}
					{selectedNodeData.type === "agent" && (
						<div className="flex flex-col gap-3 text-gray-200 text-xs">
							<div className="bg-dark-900/50 p-3 rounded-md">
								<div className="text-gray-500 text-[9px] uppercase mb-1 tracking-wide">
									Provider & Model
								</div>
								<div className="flex items-center gap-2">
									{selectedNodeData.config?.provider?.startsWith("http") ? (
										<a
											href={selectedNodeData.config.provider}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-400 font-bold hover:underline"
										>
											LINK
										</a>
									) : (
										<span className="text-white font-bold">
											{selectedNodeData.config?.provider}
										</span>
									)}
									<span className="text-gray-700 text-[10px]">/</span>
									<span className="text-green-400 font-medium">
										{selectedNodeData.config?.model}
									</span>
								</div>
							</div>

							<div className="bg-dark-900/50 p-3 rounded-md">
								<div className="text-gray-500 text-[9px] uppercase mb-1 tracking-wide">
									System Prompt
								</div>
								<div className="text-gray-400 text-[10px] whitespace-pre-wrap leading-relaxed font-mono">
									{selectedNodeData.config?.systemPrompt || "N/A"}
								</div>
							</div>

							<div className="grid grid-cols-1 gap-2">
								<div className="bg-dark-900/50 p-2 rounded-md">
									<div className="text-gray-500 text-[8px] uppercase mb-0.5 tracking-wide">
										Expecting (Input)
									</div>
									<div className="text-orange-400 text-[9px] break-all font-mono">
										{selectedNodeData.config?.inputSchema || "Any"}
									</div>
								</div>
								<div className="bg-dark-900/50 p-2 rounded-md">
									<div className="text-gray-500 text-[8px] uppercase mb-0.5 tracking-wide">
										Returning (Output)
									</div>
									<div className="text-orange-400 text-[9px] break-all font-mono">
										{selectedNodeData.config?.outputSchema || "Any"}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Floating Topic Window */}
			{floatingTopic && (
				<FloatingTopicWindow
					data={floatingTopic.data}
					initialPosition={floatingTopic.position}
					onClose={() => {
						setFloatingTopic(null);
						setSelectedNodeId(null);
					}}
				/>
			)}
		</div>
	);
}

export const PipelineGraph = withErrorBoundary(PipelineGraphComponent, {
  title: "Pipeline Graph",
});
