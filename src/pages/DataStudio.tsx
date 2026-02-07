import { socketService } from "@/services/socket";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Node,
  type NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
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

const nodeTypes: NodeTypes = {
  studioNode: StudioNode,
};

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

const DataStudioComponent = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Library State
  const [library, setLibrary] = useState<any[]>([]);

  // Pending Graph State (waiting for library to hydrate)
  const [pendingGraph, setPendingGraph] = useState<any>(null);

  // Spotlight State
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Runtime State
  const [isRunning, setIsRunning] = useState(false);

  // Throttle state for node updates (max 2 updates per second per node)
  const nodeUpdateTimestamps = useRef<Map<string, number>>(new Map());
  const pendingNodeUpdates = useRef<Map<string, any>>(new Map());
  const throttleTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const THROTTLE_MS = 500; // 2 updates per second

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
          color: "bg-gray-500", // Default
          manifest,
          settings: n.settings,
          // Use instance view, fallback to manifest default view
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
      // Find source node manifest to get port type for coloring
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
        animated: true,
        style: { stroke: edgeColor, strokeOpacity: 0.6 },
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setPendingGraph(null); // Clear pending
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

  /**
   * Get port type from node data and port name.
   * Returns the type from manifest or "any" as fallback.
   */
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

  /**
   * Validate if a connection is allowed based on port type compatibility.
   */
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

  // Connect handler with type-based edge coloring
  const onConnect = useCallback(
    (params: Connection) => {
      // Get source port type for edge coloring
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
            animated: true,
            style: { stroke: edgeColor, strokeOpacity: 0.6 },
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
        // Highlight active nodes momentarily
        if (msg.event === "node:start") {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === msg.payload.nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status: "live",
                  },
                };
              }
              return n;
            }),
          );
          setTimeout(() => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === msg.payload.nodeId) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: undefined,
                    },
                  };
                }
                return n;
              }),
            );
          }, 500);
        } else if (msg.event === "node:completed") {
          const nodeId = msg.payload.nodeId;
          const result = msg.payload.result;
          const now = Date.now();
          const lastRender = nodeUpdateTimestamps.current.get(nodeId) || 0;

          // Always store latest result
          pendingNodeUpdates.current.set(nodeId, result);

          // Function to apply the update
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

          // If enough time passed - render immediately
          if (now - lastRender >= THROTTLE_MS) {
            // Clear any scheduled timer
            const timer = throttleTimers.current.get(nodeId);
            if (timer) {
              clearTimeout(timer);
              throttleTimers.current.delete(nodeId);
            }
            applyUpdate();
          } else {
            // Schedule trailing update if not already scheduled
            if (!throttleTimers.current.has(nodeId)) {
              const delay = THROTTLE_MS - (now - lastRender);
              const timer = setTimeout(() => {
                throttleTimers.current.delete(nodeId);
                applyUpdate();
              }, delay);
              throttleTimers.current.set(nodeId, timer);
            }
            // If timer exists, pendingNodeUpdates already has latest - timer will pick it up
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
        // Could show a toast notification here
      }
    };

    socketService.on("message", onMessage);

    // Subscribe to events & Get Library & Get Graph
    socketService.send({ type: "datastudio:subscribe" });
    socketService.send({ type: "datastudio:get-library" });
    socketService.send({ type: "datastudio:get-graph" });
    socketService.send({ type: "datastudio:get-status" });

    return () => {
      socketService.off("message", onMessage);
      // Cleanup all throttle timers
      throttleTimers.current.forEach((timer) => clearTimeout(timer));
      throttleTimers.current.clear();
    };
  }, [setNodes]);

  const handleSave = () => {
    const schema = {
      id: "ui-graph",
      name: "UI Graph",
      version: "1.0.0",
      nodes: nodes.map((n) => ({
        id: n.id,
        // Fallback for demo: if typeId not set, guess or use debug-log/manual-trigger
        typeId: n.data.typeId || "debug-log",
        version: "1.0.0",
        settings: n.data.settings || {},
        position: n.position,
        // Include view configuration if present
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
  };

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
    const newNode: Node = {
      id: nodeId,
      type: "studioNode",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      data: {
        id: nodeId,
        label: manifest.name,
        typeLabel: manifest.category || "Custom",
        typeId: manifest.id,
        description: manifest.description,
        color: manifest.ui?.color
          ? `bg-[${manifest.ui.color}]`
          : "bg-indigo-500", // Tailwind JIT limit
        manifest: manifest,
        settings: {}, // Initialize default settings if needed
        view: manifest.view, // Use default view from manifest if available
      },
    };

    // Attempt to set color using inline style if provided hex
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
          // Если ключ начинается с "settings.", обновляем settings
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
      {/* Graph Area */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
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
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export const DataStudio = withErrorBoundary(DataStudioComponent, {
  title: "Data Studio",
});
