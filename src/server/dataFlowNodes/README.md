# Data Flow Nodes Guide

The Data Studio allows users to connect various processing units called **Nodes**. This folder contains the definitions and logic for these server-side nodes.

## Directory Structure

All nodes live in `src/server/dataFlowNodes/`. Nodes are organized by **Categories**.

```
src/server/dataFlowNodes/
├── Core/
│   ├── Clock/
│   │   ├── index.ts      <-- Node Logic
│   │   └── schema.json   <-- Node Definition
│   ├── DebugLog/
│   └── ...
├── Finance/
└── ...
```

## How to Create a New Node

### 1. Create the Folder

Create a folder for your node, categorized appropriately.
Example: `src/server/dataFlowNodes/MyCategory/MyNode/`

### 2. Create `schema.json`

This file defines the node's metadata, inputs, outputs, and settings. This is what the Frontend uses to verify connectivity and generate forms.

```json
{
  "id": "my-node",
  "version": "1.0.0",
  "name": "My Custom Node",
  "category": "MyCategory",
  "description": "Short description of what it does.",
  "ui": {
    "color": "#6366f1",
    "icon": "activity"
  },
  "ports": {
    "inputs": [
      { "name": "input_val", "type": "number", "description": "some number" }
    ],
    "outputs": [
      { "name": "result", "type": "string", "description": "formatted string" }
    ]
  },
  "settings": [
    {
      "name": "multiplier",
      "type": "number",
      "label": "Multiplier Factor",
      "defaultValue": 2
    }
  ]
}
```

**Common Setting Types**: `string`, `number`, `boolean`, `json`, `text` (multiline).

### 3. Create `index.ts`

This file contains the runtime logic. It must default export a class extending `DataFlowNode`.

```typescript
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json"; // Import the schema

export default class MyNode extends DataFlowNode {
  // 1. Link the manifest
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  // 2. Implement the process method
  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // Read input
    // The key must match the 'name' in ports.inputs
    const inputVal = inputs["input_val"]?.value || 0;

    // Read settings
    const multiplier = this.config.multiplier || 1;

    // Do work
    const resultVal = `Value: ${inputVal * multiplier}`;

    context.logger.info("MyNode worked", { resultVal });

    // Return outputs
    // Keys must match 'name' in ports.outputs
    return {
      result: new DataPacket(resultVal),
    };
  }
}
```

### 4. Special Features

#### Active Nodes (Timers/Streaming)

If your node needs to emit data spontaneously (like a Clock or WebSocket listener), do not put logic in `process()` (unless it also handles inputs). Instead, start your logic in `constructor` (or lazy load) and use `this.emit()`.
**Important**: Implement `dispose()` to clean up.

```typescript
  // ...
  private timer: Timer | null = null;

  constructor(id: UUID, config: any) {
    super(id, config);
    // Start interval
    this.timer = setInterval(() => {
        this.emit({
            output: new DataPacket("Tick")
        });
    }, 1000);
  }

  public async dispose() {
      if (this.timer) clearInterval(this.timer);
  }
  // ...
```

#### State Persistence

If your node needs to remember things between runs (like an accumulator), use `this.state`:

```typescript
const count = (await this.getState("count")) || 0;
await this.setState("count", count + 1);
```

### 5. Registering

Restart the server (`./deploy.sh`). The loader automatically scans `src/server/dataFlowNodes` and registers all valid nodes found.
