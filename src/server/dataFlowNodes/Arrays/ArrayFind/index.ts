import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayFindNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const arrayInput = inputs.array?.value;
    if (!Array.isArray(arrayInput)) {
      return {
        item: new DataPacket(null),
        index: new DataPacket(-1),
        found: new DataPacket(false),
      };
    }

    const mode = this.config.mode || "equals";
    const searchValue = inputs.value?.value ?? this.config.searchValue ?? "";
    const searchKey = (this.config.searchKey || "").trim();

    let foundIndex = -1;

    switch (mode) {
      case "equals":
        foundIndex = arrayInput.findIndex(
          (el) =>
            el === searchValue ||
            JSON.stringify(el) === JSON.stringify(searchValue),
        );
        break;

      case "contains":
        foundIndex = arrayInput.findIndex((el) =>
          String(el).includes(String(searchValue)),
        );
        break;

      case "keyValue":
        foundIndex = arrayInput.findIndex((el) => {
          if (typeof el !== "object" || el === null) return false;
          const val = _.get(el, searchKey);
          return String(val) === String(searchValue);
        });
        break;
    }

    return {
      item: new DataPacket(foundIndex >= 0 ? arrayInput[foundIndex] : null),
      index: new DataPacket(foundIndex),
      found: new DataPacket(foundIndex >= 0),
    };
  }
}
