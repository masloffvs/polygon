# Data Studio Implementation Plan

This document outlines the roadmap for implementing the Data Studio — a node-based visual programming environment for data processing. The system is designed with a strict "Data Packet" contract between nodes, runtime type validation via Schemas, and a clear separation between Node Logic and UI definition.

## Architecture Vision

### 1. Core Entities

- **DataFlowNode**: polymorphic abstract base class for all nodes.
  - **PureNode**: Deterministic, no side effects (e.g., Math, Transform).
  - **StatefulNode**: Has memory/state (e.g., Aggregators, ML windows). Uses **StateAdapter** (Memory, File, Redis) for persistence.
  - **IONode**: External side effects (e.g., HTTP, IPFS, DB).
- **DataPacket**: The contract between nodes. Contains:
  - `schemaVersion`: Semantic versioning of the schema.
  - `value`: Serialized payload.
  - `binaryValue`: Stream for heavy data (files, tensors).
  - `traceId`, `originNode`, `timestamp`: For distributed tracing.
- **ErrorPacket**: Unified error contract for enterprise resilience.
  - Properties: `code`, `message`, `nodeId`, `traceId`, `recoverable`.
- **Schema**: Runtime type system/descriptor with versioning.
- **Edge**: Smart connections that support transformation, filtering, buffering, and **backpressure**.

### 2. File Structure

Nodes are located in `src/server/dataFlowNodes/<Category>/<NodeName>/`:

- `index.ts`: The logic implementation.
- `schema.json`: Declarative UI, Ports, Versioning, and Execution config.

### 3. Runtime Engine (Orchestrator)

- **Parallel Execution**: Runtime supports parallel execution of independent graph branches using a worker/task-pool model.
- **Persistence**: Built-in mechanisms to persist state for reliable ML/Aggregation windows.
- **Modes**: Sync, Async, Step-by-step (Debug).

---

## Checkpoints & Stages

### Phase 1: Core Type System & Base Abstractions

**Goal:** Define the data structures that hold the system together.

- [ ] **Define DataSchema & Packets**
  - Create `src/server/dataflow/types.ts`.
  - Define `DataPacket` with `version` and `traceId`.
  - Define `ErrorPacket` interface for standardized failure handling.
- [ ] **Create Base Node Classes**
  - Create `src/server/dataflow/Node.ts`.
  - Implement abstract `DataFlowNode` with versioning awareness.
  - Implement `StateAdapter` interface (Memory/File/Redis).
  - Create `PureNode`, `StatefulNode` (with adapter), `IONode`.
- [ ] **Define Graph & Edge Structures**
  - Create `src/server/dataflow/Graph.ts`.
  - Define `GraphSchema` as a versioned artifact (IaC).

### Phase 2: Node Registry & File System Loader

**Goal:** Make the system pluggable and file-based.

- [ ] **Implement Node Loader**
  - Scan `src/server/dataFlowNodes/` directory.
  - Read `schema.json` and validate `compatibility.minRuntime`.
- [ ] **Create Node Registry**
  - Store loaded nodes.
  - Provide version-aware instantiation logic.
- [ ] **Implement Test Node**
  - Create `DebugLog` node with v1 schema.

### Phase 3: The Runtime Engine (Orchestrator)

**Goal:** Make the graph actually run with high performance.

- [ ] **Topological Sorting & Analysis**
  - Detect cycles.
  - **Identify independent branches** for parallel execution.
- [ ] **Execution Loop**
  - Create `GraphRuntime` class.
  - Implement `run()` loop with **concurrency support**.
  - Implement **Error Handling Router**: Retry vs Dead Letter Queue based on `ErrorPacket`.
- [ ] **Tracing & Observability**
  - Implement `ExecutionLog` for full trace history.

### Phase 4: Backend <-> Frontend Integration

**Goal:** Connect the UI editor to the backend runtime.

- [ ] **Socket Protocol**
  - `deploy-graph`: Transmit full `GraphSchema`.
  - `node-execution-error`: Stream `ErrorPacket` to UI.
- [ ] **Schema-Driven UI**
  - Render nodes based on `ui` config (color, icon) and `ports`.

### Phase 5: Standard Library (The "Batteries Included")

**Goal:** Create useful nodes for actual work.

- [ ] **I/O Nodes**: `Http Poller`, `Webhook Listener`.
- [ ] **Logic Nodes**: `Filter`, `Mapper`, `Switch`.
- [ ] **Aggregation**: `Sliding Window` (backed by Redis/File persistence).

### Phase 6: Advanced Features

**Goal:** Polish and "Smart" features.

- [ ] **Edge Modifiers**: Transform/filter on the wire.
- [ ] **Binary Streaming**: Pass `binaryValue` references.
- [ ] **Step-by-Step Debugger**: Breakpoints in runtime.

---

## Technical Specifications

### schema.json Example (v1.0.0)

```json
{
  "id": "http-request",
  "version": "1.0.0",
  "compatibility": {
    "minRuntime": "1.0.0"
  },
  "category": "Network",
  "name": "HTTP Request",
  "description": "Performs an HTTP request",
  "ui": {
    "color": "#ff8800",
    "icon": "globe",
    "resizable": true
  },
  "execution": {
    "timeoutMs": 5000,
    "retry": 2,
    "recoverable": true
  },
  "ports": {
    "inputs": [
      { "name": "trigger", "type": "signal", "required": true },
      { "name": "body", "type": "object", "required": false }
    ],
    "outputs": [
      { "name": "response", "type": "any" },
      { "name": "error", "type": "error_packet" }
    ]
  },
  "settings": [
    { "name": "url", "type": "string", "label": "Target URL" },
    { "name": "method", "type": "enum", "options": ["GET", "POST"] }
  ]
}
```

### Graph Schema Artifact (IaC)

```typescript
interface GraphSchema {
  id: string;
  version: "1.0.0"; // Schema version for the graph itself
  metadata: {
    author: string;
    createdAt: number;
    description: string;
    tags: string[];
  };
  config: {
    maxConcurrency: number;
    stateStorage: "memory" | "file" | "redis";
  };
  nodes: NodeInstance[];
  edges: EdgeInstance[];
}

interface NodeInstance {
  id: string;
  typeId: string; // e.g., "http-request"
  version: string; // e.g., "1.0.0" - strict locking
  settings: Record<string, any>;
  position: { x: number; y: number };
}
```
