import type { Application } from "../server/application";
import { getCronTabRoutes } from "./crontab";
import { getConfigRoutes } from "./config";
import { getDatastudioRoutes } from "./datastudio";
import { getDayInLifeRoutes } from "./day_in_life";
import { getGeneralRoutes } from "./general";
import { getNewsRoutes } from "./news";
import { getNewsImpactRoutes } from "./news_impact";
import { getNewsSearchRoutes } from "./news_search";
import { getPipelineRoutes } from "./pipeline";
import { getPolygonRoutes } from "./polygon";
import { getPolymarketRoutes } from "./polymarket";
import { getPolyTrustFactorRoutes } from "./polytrustfactor";
import { getPredictionRoutes } from "./predictions";
import { getSystemRoutes } from "./system";
import { getWantedRoutes } from "./wanted";
import { getWhalePositionsRoutes } from "./whale_positions";
import { getWalletFlowRoutes } from "./wallet_flow";

export const getApiRoutes = (app: Application) => ({
  ...getCronTabRoutes(),
  ...getNewsImpactRoutes(),
  ...getNewsSearchRoutes(),
  ...getSystemRoutes(app),
  ...getWantedRoutes(),
  ...getPredictionRoutes(app),
  ...getConfigRoutes(),
  ...getGeneralRoutes(),
  ...getPipelineRoutes(app),
  ...getNewsRoutes(),
  ...getPolymarketRoutes(),
  ...getPolyTrustFactorRoutes(),
  ...getPolygonRoutes(app),
  ...getDatastudioRoutes(app),
  ...getWhalePositionsRoutes(),
  ...getDayInLifeRoutes(),
  ...getWalletFlowRoutes(),
});
