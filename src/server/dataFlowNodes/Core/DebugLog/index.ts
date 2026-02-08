import { IONode, type ProcessingContext } from "../../../dataflow/Node";
import type {
  DataPacket,
  ErrorPacket,
  NodeManifest,
} from "../../../dataflow/types";
import meta from "./schema.json";

export class DebugLogNode extends IONode {
  public readonly manifest = meta as NodeManifest;

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const packet = inputs.input;

    if (!packet) {
      context.logger.error("Required input 'input' not found.");
      console.error("Required input 'input' not found.", {
        nodeId: this.id,
        traceId: context.traceId,
        inputs,
      });
      return {
        code: "MISSING_INPUT",
        message: "Required input 'input' not found.",
        nodeId: this.id,
        traceId: context.traceId,
        timestamp: Date.now(),
        recoverable: false,
      };
    }

    const prefix = this.config.prefix || "[DEBUG]";

    // The "Side Effect"
    console.log(
      `${prefix} [${packet.traceId.slice(0, 8)}]:`,
      JSON.stringify(packet.value, null, 2),
    );

    if (packet.binaryValue) {
      console.log(`${prefix} [Binary]: Stream/Buffer attached`);
    }

    // Passthrough
    return {
      output: packet.cloneWith(packet.value, this.id),
    };
  }
}
