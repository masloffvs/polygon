# Polygon Project - Copilot Instructions

## Creating New Sources

When asked to create a new data source, follow these patterns and conventions.

### Source Location

All sources are located in: `src/server/layers/sources/`

### Base Class

All sources must extend `BaseSource` from `./base.ts`:

```typescript
import { logger } from "../../utils/logger";
import { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";
```

### Required Structure

1. **Config Interface** - Extend `SourceConfig` with custom fields:

```typescript
interface MySourceConfig extends SourceConfig {
  // Custom config fields
  endpoint?: string;
  pairs?: string[];
}
```

2. **Class Definition** - Extend `BaseSource`:

```typescript
export class MySource extends BaseSource {
  constructor(
    config: Omit<MySourceConfig, "id" | "name" | "description"> &
      Partial<SourceConfig>,
    aggregator: AggregatorLayer,
  ) {
    super(
      {
        id: "my-source", // kebab-case ID
        name: "My Data", // Human readable name
        description: "Description",
        ...config,
      },
      aggregator,
    );
  }
}
```

3. **Required Methods**:
   - `connect(): Promise<void>` - Establish connection (WebSocket, HTTP polling, etc.)
   - `disconnect(): void` - Clean up connections

4. **Emitting Data** - Use `this.emit(data)` to send data through the pipeline:

```typescript
this.ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  this.emit(data); // Data goes to aggregator -> pipeline
};
```

### Naming Conventions

| Input        | File Name        | Class Name         | Source ID            |
| ------------ | ---------------- | ------------------ | -------------------- |
| `test`       | `test.ts`        | `TestSource`       | `test-source`        |
| `myExchange` | `my-exchange.ts` | `MyExchangeSource` | `my-exchange-source` |
| `data-feed`  | `data-feed.ts`   | `DataFeedSource`   | `data-feed-source`   |

### WebSocket Source Example

```typescript
export class ExampleSource extends BaseSource {
  private ws: WebSocket | null = null;

  public async connect(): Promise<void> {
    logger.info({ source: this.id }, "Connecting...");

    this.ws = new WebSocket("wss://api.example.com/stream");

    this.ws.onopen = () => {
      logger.info({ source: this.id }, "Connection established");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.emit(data);
      } catch (err) {
        logger.error({ source: this.id, err }, "Failed to parse message");
      }
    };

    this.ws.onerror = (event) => {
      logger.error({ source: this.id, event }, "WebSocket error");
    };

    this.ws.onclose = () => {
      logger.warn(
        { source: this.id },
        "Connection closed. Reconnecting in 5s...",
      );
      setTimeout(() => this.connect(), 5000);
    };
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

### HTTP Polling Source Example

```typescript
export class PollingSource extends BaseSource {
  private intervalId: Timer | null = null;

  public async connect(): Promise<void> {
    logger.info({ source: this.id }, "Starting polling...");

    this.intervalId = setInterval(async () => {
      try {
        const response = await fetch("https://api.example.com/data");
        const data = await response.json();
        this.emit(data);
      } catch (err) {
        logger.error({ source: this.id, err }, "Polling failed");
      }
    }, 5000);
  }

  public disconnect(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

### Factory CLI

Use the factory CLI to generate boilerplate:

```bash
bun ./factory.ts createSource <name>
```

This creates a new source file with the correct structure and naming.

### Existing Sources Reference

- `binance.ts` - WebSocket source for Binance orderbook data
- `bybit.ts` - WebSocket source for Bybit
- `okx.ts` - WebSocket source for OKX
- `oklink.ts` - Blockchain data source
- `polyscan.ts` / `polyscan_ws.ts` - Polymarket data sources
- `http_observer.ts` - HTTP-based observer pattern
- `fear-greed.ts` - Fear & Greed Index from CoinMarketCap

---

## Registering New Modules in Application

**IMPORTANT**: After creating new sources, adapters, or pipeline stages, they MUST be registered in `src/server/application.ts`.

### 1. Add Imports

Add imports at the top of the file:

```typescript
// For Sources
import { MySource } from "./layers/sources/my-source";

// For Adapters
import { MyAdapter } from "./adapters/my-adapter";

// For Pipeline Stages
import { MyStorageStage } from "./layers/pipeline/stages/my_storage";
```

### 2. Register Source ID

Add your source ID to the `sourceIds` array in the constructor:

```typescript
const sourceIds = [
  "binance-source",
  "okx-source",
  // ... existing sources
  "my-source", // Add your source ID here
];
```

### 3. Register Adapter (if applicable)

If your source needs validation via proxy:

```typescript
this.proxy.register("my-source", new MyAdapter());
```

### 4. Register Pipeline Stages

Register your stages in the constructor:

```typescript
this.pipeline.register(new MyStorageStage());
this.pipeline.register(new MyProcessingStage());
```

### 5. Instantiate and Add Source

Create the source instance and add to sources array:

```typescript
const mySource = new MySource(
  {
    // config options
  },
  this.aggregator,
);
// Optional: set proxy for validation
mySource.setProxy(this.proxy);
this.sources.push(mySource);
```

### Full Example

For a new "Fear & Greed" module:

```typescript
// 1. Imports
import { FearGreedSource } from "./layers/sources/fear-greed";
import { FearGreedStorageStage } from "./layers/pipeline/stages/fear_greed_storage";
import { FearGreedCurrentStage } from "./layers/pipeline/stages/fear_greed_current";

// 2. In constructor - add to sourceIds
const sourceIds = [
  // ... existing
  "fear-greed-source",
];

// 3. Register stages
this.pipeline.register(new FearGreedStorageStage());
this.pipeline.register(new FearGreedCurrentStage());

// 4. Create and add source
const fearGreed = new FearGreedSource(
  { historyDays: 30, intervalMs: 3600000 },
  this.aggregator,
);
this.sources.push(fearGreed);
```

---

## Creating Pipeline Stages

Pipeline stages process data flowing through the system.

### Stage Location

All stages are in: `src/server/layers/pipeline/stages/`

### Base Class

Extend `PipelineStage` from `../stage.ts`:

```typescript
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class MyStage extends PipelineStage<InputType, OutputType> {
  id = "my-stage";
  description = "What this stage does";
  inputs = ["source-id"]; // Which sources/stages to listen to
  output = "my-stage-output"; // Output topic for downstream stages

  public async process(
    data: InputType,
    context: ProcessingContext,
  ): Promise<OutputType | null> {
    // Return null to drop data, or return transformed data
    return transformedData;
  }
}
```

### Storage Stage Example

```typescript
import { clickhouse } from "@/storage/clickhouse";

export class MyStorageStage extends PipelineStage<MyData, { stored: number }> {
  id = "my-storage";
  description = "Stores data to ClickHouse";
  inputs = ["my-source"];
  output = "my-stored";

  public async process(data: MyData, context: ProcessingContext) {
    if (context.topic !== "my-source") return null;

    const rows = data.items.map((item) => ({
      // map to ClickHouse columns
    }));

    await clickhouse.insert({
      table: "my_table",
      values: rows,
      format: "JSONEachRow",
    });

    return { stored: rows.length };
  }
}
```

---

## Creating Adapters

Adapters validate and type API responses using Zod.

### Adapter Location

All adapters are in: `src/server/adapters/`

### Base Class

Extend `BaseAdapter` from `./base.ts`:

```typescript
import { z } from "zod";
import { BaseAdapter } from "./base";

export const MyResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      value: z.number(),
    }),
  ),
});

export type MyResponse = z.infer<typeof MyResponseSchema>;

export class MyAdapter extends BaseAdapter<MyResponse> {
  name = "my-adapter";
  description = "Validates My API response";
  schema = MyResponseSchema;
}
```

---

## ClickHouse Migrations

New tables must be added to `src/storage/clickhouse/index.ts` in the `runMigrations()` function:

```typescript
const myTableQuery = `
  CREATE TABLE IF NOT EXISTS my_table (
    id String,
    value Float64,
    timestamp DateTime,
    ingested_at DateTime DEFAULT now()
  )
  ENGINE = ReplacingMergeTree()  -- or MergeTree()
  ORDER BY (timestamp, id)
`;
await clickhouse.exec({ query: myTableQuery });
logger.info("ClickHouse schema: my_table verified");
```
