// Import all renderers here to ensure they register themselves
import "./Any2TextRenderer";
import "./ApiTriggerRenderer";
import "./ClockTriggerRenderer";
import "./DebugLogRenderer";
import "./EmbeddingCompareRenderer";
import "./ExportReceiverRenderer";
import "./ImagenRenderer";
import "./LLMChatRenderer";
import "./RedisMemoRenderer";
import "./ReplicateRenderer";
import "./StrictTypizerRenderer";
import "./StringTemplateRenderer";
import "./TableVizRenderer";
import "./TelegramDropRenderer";
import "./TimedCollectorRenderer";
import "./TriggeredDropRenderer";
import "./VectorSearchRenderer";
import "./VectorStoreRenderer";
import "./XUserFeedRenderer";

export { getRenderer, registerRenderer } from "./registry";
export type { NodeRendererComponent, NodeRendererProps } from "./registry";
