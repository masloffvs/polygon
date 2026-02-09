import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * TelegramAdsPublish: Creates/publishes ads on Telegram Ads platform.
 * Uses the internal Telegram Ads API.
 */
export default class TelegramAdsPublishNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // Get auth credentials from settings
    const apiHash = this.config.apiHash;
    const stelToken = this.config.stelToken;
    const stelSsid = this.config.stelSsid;
    const ownerId = this.config.stelAdowner;

    if (!apiHash || !stelToken || !stelSsid || !ownerId) {
      return {
        result: new DataPacket(null),
        adId: new DataPacket(null),
        error: new DataPacket({
          code: "MISSING_AUTH",
          message:
            "Missing required auth credentials (apiHash, stelToken, stelSsid, stelAdowner)",
        }),
      };
    }

    // Get ad content - input ports override settings
    const title = inputs.title?.value ?? this.config.title ?? "";
    const text = inputs.text?.value ?? this.config.text ?? "";
    const promoteUrl = this.config.promoteUrl ?? "";
    const channels = inputs.channels?.value ?? this.config.channels ?? "";

    if (!title || !text) {
      return {
        result: new DataPacket(null),
        adId: new DataPacket(null),
        error: new DataPacket({
          code: "MISSING_CONTENT",
          message: "Ad title and text are required",
        }),
      };
    }

    if (!promoteUrl) {
      return {
        result: new DataPacket(null),
        adId: new DataPacket(null),
        error: new DataPacket({
          code: "MISSING_URL",
          message: "Promote URL is required",
        }),
      };
    }

    // Build form data
    const formData = new URLSearchParams();
    formData.append("owner_id", ownerId);
    formData.append("title", title);
    formData.append("text", text);
    formData.append("promote_url", promoteUrl);
    formData.append("website_name", this.config.websiteName ?? "");
    formData.append("website_photo", this.config.websitePhoto ?? "");
    formData.append("media", this.config.media ?? "");
    formData.append("ad_info", "");
    formData.append("cpm", String(this.config.cpm ?? 0.1));
    formData.append("views_per_user", String(this.config.viewsPerUser ?? 1));
    formData.append("budget", String(this.config.budget ?? 0.1));
    formData.append("daily_budget", String(this.config.dailyBudget ?? 0));
    formData.append("active", String(this.config.active ?? 0));
    formData.append("target_type", this.config.targetType ?? "channels");
    formData.append("placement", "");
    formData.append("channels", channels);
    formData.append("bots", this.config.bots ?? "");
    formData.append("search_queries", this.config.searchQueries ?? "");
    formData.append("method", "createAd");

    // Build cookies
    const cookies = [
      `stel_ssid=${stelSsid}`,
      "stel_dt=0",
      `stel_token=${stelToken}`,
      `stel_adowner=${ownerId}`,
    ].join("; ");

    try {
      context.logger.info(
        { title, promoteUrl, targetType: this.config.targetType },
        "TelegramAdsPublish: Creating ad",
      );

      const response = await fetch(
        `https://ads.telegram.org/api?hash=${apiHash}`,
        {
          method: "POST",
          headers: {
            accept: "application/json, text/javascript, */*; q=0.01",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            cookie: cookies,
            origin: "https://ads.telegram.org",
            referer: "https://ads.telegram.org/account/ad/new",
            "x-requested-with": "XMLHttpRequest",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.7059.100 Safari/537.36",
          },
          body: formData.toString(),
        },
      );

      const responseText = await response.text();
      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok) {
        context.logger.error(
          { status: response.status, data },
          "TelegramAdsPublish: API error",
        );
        return {
          result: new DataPacket({ status: response.status, ...data }),
          adId: new DataPacket(null),
          error: new DataPacket({
            code: "API_ERROR",
            status: response.status,
            message: data.error || data.message || `HTTP ${response.status}`,
            response: data,
          }),
        };
      }

      context.logger.info(
        { data },
        "TelegramAdsPublish: Ad created successfully",
      );

      // Extract ad ID from response if available
      const adId = data.ad_id || data.id || data.result?.ad_id || null;

      return {
        result: new DataPacket({
          success: true,
          ...data,
          request: {
            title,
            text,
            promoteUrl,
            cpm: this.config.cpm,
            budget: this.config.budget,
            targetType: this.config.targetType,
            channels: channels,
          },
        }),
        adId: new DataPacket(adId),
        error: new DataPacket(null),
      };
    } catch (err: any) {
      context.logger.error(
        { err: err.message },
        "TelegramAdsPublish: Request failed",
      );
      return {
        result: new DataPacket(null),
        adId: new DataPacket(null),
        error: new DataPacket({
          code: "REQUEST_FAILED",
          message: err.message || "Network request failed",
        }),
      };
    }
  }
}
