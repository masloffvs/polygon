import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * LogicAnd Node
 * Waits for all required inputs to receive data
 * Acts as AND gate - only emits when all conditions are met
 */
export default class LogicAndNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const requireAll = Boolean(this.config.requireAll);

    // Check required inputs
    if (!inputs.input1 || !inputs.input2) {
      context.logger.info("LogicAnd: missing required inputs", {
        hasInput1: !!inputs.input1,
        hasInput2: !!inputs.input2,
      });
      return {}; // Don't emit anything if required inputs missing
    }

    // If requireAll is true, check all 4 inputs
    if (requireAll) {
      if (!inputs.input3 || !inputs.input4) {
        context.logger.info("LogicAnd: requireAll enabled but missing inputs", {
          hasInput3: !!inputs.input3,
          hasInput4: !!inputs.input4,
        });
        return {}; // Don't emit anything
      }
    }

    // All required inputs present - emit result
    const result = {
      input1: inputs.input1?.value,
      input2: inputs.input2?.value,
      input3: inputs.input3?.value,
      input4: inputs.input4?.value,
      timestamp: Date.now(),
    };

    context.logger.info("LogicAnd: all conditions met", {
      inputCount: Object.keys(inputs).length,
      requireAll,
    });

    return {
      result: new DataPacket(result),
      first: new DataPacket(inputs.input1.value),
    };
  }
}
