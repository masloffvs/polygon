import {
  dataviewOf,
  LayoutDataview,
  type SchemaManifest,
} from "@/server/utils/dataview.helpers";

import schema from "./schema.json" with { type: "json" };

schema as SchemaManifest;

export default dataviewOf((args) => <LayoutDataview>...</LayoutDataview>);
