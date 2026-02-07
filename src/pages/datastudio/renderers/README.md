# Node Renderers

This directory contains custom React components used to visualize the output of nodes in the Data Studio graph.

## How to add a new renderer

1. Create a new `.tsx` file (e.g., `MyNodeRenderer.tsx`) in this directory.
2. The component should accept `RendererProps`:

   ```tsx
   import React from "react";
   import { RendererProps } from "./registry";

   export const MyNodeRenderer: React.FC<RendererProps> = ({
     data,
     nodeData,
   }) => {
     return (
       <div className="p-2">
         {/* Your visualization here */}
         <pre>{JSON.stringify(data, null, 2)}</pre>
       </div>
     );
   };
   ```

3. Register the renderer in `registry.ts`:

   ```typescript
   import { MyNodeRenderer } from "./MyNodeRenderer";

   export const RENDERER_REGISTRY: Record<string, React.FC<RendererProps>> = {
     // ...
     "my-node-type-id": MyNodeRenderer,
   };
   ```
