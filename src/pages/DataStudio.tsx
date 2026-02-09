import { socketService } from "@/services/socket";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  BaseEdge,
  type Connection,
  Controls,
  type EdgeProps,
  type EdgeTypes,
  getBezierPath,
  type Node,
  type NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

import { lazy } from "react";
import {
  areTypesCompatible,
  type DataType,
  getTypeColor,
} from "./datastudio/utils/portTypes";

const NodeInspector = lazy(() =>
  import("./datastudio/components/NodeInspector").then((m) => ({
    default: m.NodeInspector,
  })),
);
const Spotlight = lazy(() =>
  import("./datastudio/components/Spotlight").then((m) => ({
    default: m.Spotlight,
  })),
);
const Toolbar = lazy(() =>
  import("./datastudio/components/Toolbar").then((m) => ({
    default: m.Toolbar,
  })),
);
const StudioNode = lazy(() =>
  import("./datastudio/nodes/StudioNode").then((m) => ({
    default: m.StudioNode,
  })),
);

// Suppress ResizeObserver loop error (common with ReactFlow)
// This error is benign and doesn't affect functionality
if (typeof window !== "undefined") {
  const resizeObserverErr = window.onerror;
  window.onerror = (message, ...args) => {
    if (
      typeof message === "string" &&
      message.includes("ResizeObserver loop")
    ) {
      return true; // Suppress the error
    }
    return resizeObserverErr ? resizeObserverErr(message, ...args) : false;
  };

  // Also handle unhandledrejection for Promise-based errors
  window.addEventListener("error", (e) => {
    if (e.message?.includes("ResizeObserver loop")) {
      e.stopPropagation();
      e.preventDefault();
    }
  });
}

/**
 * Custom animated edge that shows a traveling dot when active.
 */
function AnimatedDotEdge(
  props: EdgeProps & { data?: { animating?: boolean } },
) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    data,
    markerEnd,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isAnimating = data?.animating === true;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {isAnimating && (
        <>
          <circle r="4" fill="white" filter="url(#glow)">
            <animateMotion dur="0.6s" repeatCount="1" path={edgePath} />
          </circle>
          <circle r="6" fill="white" opacity="0.3" filter="url(#glow)">
            <animateMotion dur="0.6s" repeatCount="1" path={edgePath} />
          </circle>
        </>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = {
  studioNode: StudioNode,
};

const edgeTypes: EdgeTypes = {
  animatedDot: AnimatedDotEdge,
};

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

/**
 * Toast notification component
 */
function SaveToast({
  message,
  status,
}: {
  message: string;
  status: "success" | "error";
}) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] px-4 py-2.5 rounded-lg shadow-xl text-sm font-medium text-white transition-all animate-slide-in-up ${
        status === "success"
          ? "bg-lime-600/90 border border-emerald-400/30"
          : "bg-red-600/90 border border-red-400/30"
      }`}
    >
      <div className="flex items-center gap-2">
        {status === "success" ? (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
        {message}
      </div>
    </div>
  );
}

const DataStudioInner = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const reactFlowInstance = useReactFlow();

  // Library State
  const [library, setLibrary] = useState<any[]>([]);

  // Pending Graph State (waiting for library to hydrate)
  const [pendingGraph, setPendingGraph] = useState<any>(null);

  // Spotlight State
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Runtime State
  const [isRunning, setIsRunning] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{
    message: string;
    status: "success" | "error";
  } | null>(null);

  // Throttle state for node updates (max 2 updates per second per node)
  const nodeUpdateTimestamps = useRef<Map<string, number>>(new Map());
  const pendingNodeUpdates = useRef<Map<string, any>>(new Map());
  const throttleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const THROTTLE_MS = 500;

  // Show toast helper
  const showToast = useCallback(
    (message: string, status: "success" | "error" = "success") => {
      setToast({ message, status });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  /**
   * Trigger a traveling dot animation on all edges leading TO a given node.
   */
  const triggerEdgeAnimation = useCallback(
    (targetNodeId: string) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.target === targetNodeId) {
            return {
              ...e,
              type: "animatedDot",
              data: { ...e.data, animating: true },
            };
          }
          return e;
        }),
      );

      // Remove animation after it completes
      setTimeout(() => {
        setEdges((eds) =>
          eds.map((e) => {
            if (e.target === targetNodeId) {
              return {
                ...e,
                data: { ...e.data, animating: false },
              };
            }
            return e;
          }),
        );
      }, 700);
    },
    [setEdges],
  );

  // Restore Graph Effect
  useEffect(() => {
    if (!pendingGraph || library.length === 0) return;

    console.log("Hydrating graph...", pendingGraph);

    const newNodes = pendingGraph.nodes.map((n: any) => {
      const manifest = library.find((m) => m.id === n.typeId);
      const node: Node = {
        id: n.id,
        type: "studioNode",
        position: n.position,
        data: {
          id: n.id,
          label: manifest?.name || n.typeId,
          typeLabel: manifest?.category || "Unknown",
          typeId: n.typeId,
          description: manifest?.description,
          color: "bg-gray-500",
          manifest,
          settings: n.settings,
          view: n.view || manifest?.view,
        },
      };

      if (manifest?.ui?.color?.startsWith("#")) {
        node.data.customColor = manifest.ui.color;
      } else if (manifest?.ui?.color) {
        node.data.color = `bg-[${manifest.ui.color}]`;
      }

      return node;
    });

    const newEdges = pendingGraph.edges.map((e: any) => {
      const sourceNode = pendingGraph.nodes.find(
        (n: any) => n.id === e.sourceNodeId,
      );
      const sourceManifest = sourceNode
        ? library.find((m) => m.id === sourceNode.typeId)
        : null;
      const sourcePort = sourceManifest?.ports?.outputs?.find(
        (p: any) => p.name === e.sourcePortName,
      );
      const portType = sourcePort?.type || "any";
      const edgeColor = getTypeColor(portType as DataType);

      return {
        id: e.id,
        source: e.sourceNodeId,
        sourceHandle: e.sourcePortName,
        target: e.targetNodeId,
        targetHandle: e.targetPortName,
        type: "animatedDot",
        animated: true,
        style: { stroke: edgeColor, strokeOpacity: 0.6 },
        data: { animating: false },
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setPendingGraph(null);
  }, [pendingGraph, library, setNodes, setEdges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsSpotlightOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const getPortType = useCallback(
    (nodeId: string, portName: string, isSource: boolean): DataType => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node?.data?.manifest) return "any";

      const manifest = node.data.manifest;
      const ports = isSource ? manifest.ports?.outputs : manifest.ports?.inputs;
      const port = ports?.find((p: any) => p.name === portName);

      return (port?.type as DataType) || "any";
    },
    [nodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection): boolean => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      const sourceType = getPortType(
        connection.source,
        connection.sourceHandle || "",
        true,
      );
      const targetType = getPortType(
        connection.target,
        connection.targetHandle || "",
        false,
      );

      return areTypesCompatible(sourceType, targetType);
    },
    [getPortType],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceType = getPortType(
        params.source || "",
        params.sourceHandle || "",
        true,
      );
      const edgeColor = getTypeColor(sourceType);

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "animatedDot",
            animated: true,
            style: { stroke: edgeColor, strokeOpacity: 0.6 },
            data: { animating: false },
          },
          eds,
        ),
      );
    },
    [setEdges, getPortType],
  );

  // Socket Integration
  useEffect(() => {
    const onMessage = (msg: any) => {
      if (msg.type === "datastudio:event") {
        console.log("Runtime Event:", msg.event, msg.payload);
        if (msg.event === "node:start") {
          // Trigger traveling dot animation on edges leading to this node
          triggerEdgeAnimation(msg.payload.nodeId);
        } else if (msg.event === "node:completed") {
          const nodeId = msg.payload.nodeId;
          const result = msg.payload.result;
          const now = Date.now();
          const lastRender = nodeUpdateTimestamps.current.get(nodeId) || 0;

          pendingNodeUpdates.current.set(nodeId, result);

          const applyUpdate = () => {
            const latestResult = pendingNodeUpdates.current.get(nodeId);
            if (latestResult === undefined) return;

            nodeUpdateTimestamps.current.set(nodeId, Date.now());
            pendingNodeUpdates.current.delete(nodeId);

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: { ...n.data, status: undefined, latestResult },
                    }
                  : n,
              ),
            );
          };

          if (now - lastRender >= THROTTLE_MS) {
            const timer = throttleTimers.current.get(nodeId);
            if (timer) {
              clearTimeout(timer);
              throttleTimers.current.delete(nodeId);
            }
            applyUpdate();
          } else {
            if (!throttleTimers.current.has(nodeId)) {
              const delay = THROTTLE_MS - (now - lastRender);
              const timer = setTimeout(() => {
                throttleTimers.current.delete(nodeId);
                applyUpdate();
              }, delay);
              throttleTimers.current.set(nodeId, timer);
            }
          }
        }
      } else if (msg.type === "datastudio:library") {
        setLibrary(msg.library);
      } else if (msg.type === "datastudio:graph") {
        setPendingGraph(msg.graph);
      } else if (msg.type === "datastudio:status") {
        setIsRunning(msg.isRunning);
      } else if (msg.type === "datastudio:error") {
        console.error("DataStudio Error:", msg.error);
        showToast(`Error: ${msg.error}`, "error");
      }
    };

    socketService.on("message", onMessage);

    socketService.send({ type: "datastudio:subscribe" });
    socketService.send({ type: "datastudio:get-library" });
    socketService.send({ type: "datastudio:get-graph" });
    socketService.send({ type: "datastudio:get-status" });

    return () => {
      socketService.off("message", onMessage);
      throttleTimers.current.forEach((timer) => clearTimeout(timer));
      throttleTimers.current.clear();
    };
  }, [setNodes, triggerEdgeAnimation, showToast]);

  const handleSave = useCallback(() => {
    const schema = {
      id: "ui-graph",
      name: "UI Graph",
      version: "1.0.0",
      nodes: nodes.map((n) => ({
        id: n.id,
        typeId: n.data.typeId || "debug-log",
        version: "1.0.0",
        settings: n.data.settings || {},
        position: n.position,
        ...(n.data.view?.id ? { view: n.data.view } : {}),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.source,
        sourcePortName: e.sourceHandle || "output",
        targetNodeId: e.target,
        targetPortName: e.targetHandle || "input",
      })),
      metadata: {
        author: "DataStudio User",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        description: "Created from Data Studio UI",
        tags: ["ui-generated"],
      },
    };

    socketService.send({
      type: "datastudio:deploy",
      graph: schema,
    });
    console.log("Graph deployed", schema);
    showToast("Graph saved & deployed", "success");
  }, [nodes, edges, showToast]);

  // Ctrl+S to save
  useEffect(() => {
    const handleSaveShortcut = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [handleSave]);

  const handleRun = () => {
    if (isRunning) {
      console.warn(
        "Runtime already running. Stop it first to avoid conflicts.",
      );
      return;
    }
    setIsRunning(true);
    socketService.send({ type: "datastudio:run" });
  };

  const handleStop = () => {
    setIsRunning(false);
    socketService.send({ type: "datastudio:stop" });
  };

  const handleAddNodeFromLibrary = (manifest: any) => {
    const nodeId = `node-${Date.now()}`;

    // Place node in the center of the current viewport
    const viewportCenter = reactFlowInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode: Node = {
      id: nodeId,
      type: "studioNode",
      position: {
        x: viewportCenter.x - 75 + (Math.random() - 0.5) * 60,
        y: viewportCenter.y - 30 + (Math.random() - 0.5) * 60,
      },
      data: {
        id: nodeId,
        label: manifest.name,
        typeLabel: manifest.category || "Custom",
        typeId: manifest.id,
        description: manifest.description,
        color: manifest.ui?.color
          ? `bg-[${manifest.ui.color}]`
          : "bg-indigo-500",
        manifest: manifest,
        settings: {},
        view: manifest.view,
      },
    };

    if (manifest.ui?.color?.startsWith("#")) {
      newNode.style = {};
      newNode.data.customColor = manifest.ui.color;
    }

    setNodes((nds) => nds.concat(newNode));
    setIsSpotlightOpen(false);
  };

  const handleAddNode = () => {
    setIsSpotlightOpen(true);
  };

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const handlePaneClick = () => {
    setSelectedNode(null);
  };

  const updateSelectedNode = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          let newData;
          if (key.startsWith("settings.")) {
            const settingsKey = key.replace("settings.", "");
            newData = {
              ...node.data,
              settings: {
                ...node.data.settings,
                [settingsKey]: value,
              },
            };
          } else {
            newData = { ...node.data, [key]: value };
          }
          const updated = {
            ...node,
            data: newData,
          };
          setSelectedNode(updated);
          return updated;
        }
        return node;
      }),
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setSelectedNode(null);
  };

  return (
    <div className="h-screen w-full bg-dark-800 flex flex-col overflow-hidden relative">
      {/* SVG filter for glow effect on traveling dot */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Toast notification */}
      {toast && <SaveToast message={toast.message} status={toast.status} />}

      {/* Graph Area */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          className="bg-dark-800"
        >
          <Background color="#1a1a1a" gap={24} size={1} />
          <Controls className="!bg-dark-800/80 !border-0 !rounded-xl !shadow-xl !shadow-black/20" />

          <Toolbar
            onAddNode={handleAddNode}
            onSave={handleSave}
            onRun={handleRun}
            onStop={handleStop}
            isRunning={isRunning}
          />

          <Spotlight
            isOpen={isSpotlightOpen}
            onClose={() => setIsSpotlightOpen(false)}
            library={library}
            onAddNode={handleAddNodeFromLibrary}
            onRun={handleRun}
            onStop={handleStop}
            onSave={handleSave}
          />

          <NodeInspector
            selectedNode={selectedNode}
            onUpdate={updateSelectedNode}
            onDelete={deleteSelectedNode}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

const DataStudioComponent = () => {
  return (
    <ReactFlowProvider>
      <DataStudioInner />
    </ReactFlowProvider>
  );
};

export const DataStudio = withErrorBoundary(DataStudioComponent, {
  title: "Data Studio",
});
