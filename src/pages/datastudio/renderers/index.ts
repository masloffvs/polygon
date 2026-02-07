// Import all renderers here to ensure they register themselves
import "./Any2TextRenderer";
import "./ApiTriggerRenderer";
import "./ClockTriggerRenderer";
import "./DebugLogRenderer";
import "./ExportReceiverRenderer";
import "./ImagenRenderer";
import "./RedisMemoRenderer";
import "./StringTemplateRenderer";
import "./TableVizRenderer";
import "./TelegramDropRenderer";
import "./TimedCollectorRenderer";
import "./TriggeredDropRenderer";
import "./XUserFeedRenderer";

export { getRenderer, registerRenderer } from "./registry";
export type { NodeRendererComponent, NodeRendererProps } from "./registry";
