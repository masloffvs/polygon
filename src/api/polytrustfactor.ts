/**
 * PolyTrustFactor API Routes
 * REST API endpoints for trader risk analysis
 */

import { logger } from '../server/utils/logger';
import { analyzeTrader } from '../polytrustfactor';

export const getPolyTrustFactorRoutes = () => ({
  '/api/polytrustfactor/analyze/:address': {
    async GET(req: Request) {
      const url = new URL(req.url);
      const address = url.pathname.split('/').pop();

      if (!address || !address.startsWith('0x')) {
        return new Response(
          JSON.stringify({ error: 'Invalid Ethereum address' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const maxPositions = parseInt(url.searchParams.get('maxPositions') || '50000');
      const format = url.searchParams.get('format') || 'full'; // full, summary, json

      try {
        logger.info({ address, maxPositions }, 'Analyzing trader via API');

        const analysis = await analyzeTrader(address, { maxPositions });

        if (format === 'summary') {
          return Response.json({
            address: analysis.address,
            trustLevel: analysis.trustLevel,
            riskScore: analysis.overallRiskScore,
            flags: analysis.flags,
            stats: {
              totalPositions: analysis.stats.totalPositions,
              winRate: analysis.stats.winRate,
              totalPnl: analysis.stats.totalPnl,
              profitFactor: analysis.stats.profitFactor,
            },
          });
        }

        return Response.json(analysis);
      } catch (error) {
        logger.error({ error, address }, 'Failed to analyze trader');
        return new Response(
          JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Analysis failed' 
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
  },

  '/api/polytrustfactor/batch': {
    async POST(req: Request) {
      try {
        const body = await req.json();
        const addresses = body.addresses as string[];

        if (!Array.isArray(addresses) || addresses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid request: addresses array required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (addresses.length > 10) {
          return new Response(
            JSON.stringify({ error: 'Maximum 10 addresses per batch request' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        logger.info({ count: addresses.length }, 'Batch analysis request');

        const results = await Promise.allSettled(
          addresses.map(address => analyzeTrader(address, { maxPositions: 10000 }))
        );

        const response = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return {
              address: addresses[index],
              success: true,
              data: {
                trustLevel: result.value.trustLevel,
                riskScore: result.value.overallRiskScore,
                flags: result.value.flags,
                stats: {
                  totalPositions: result.value.stats.totalPositions,
                  winRate: result.value.stats.winRate,
                  totalPnl: result.value.stats.totalPnl,
                },
              },
            };
          } else {
            return {
              address: addresses[index],
              success: false,
              error: result.reason instanceof Error ? result.reason.message : 'Analysis failed',
            };
          }
        });

        return Response.json(response);
      } catch (error) {
        logger.error({ error }, 'Batch analysis failed');
        return new Response(
          JSON.stringify({ error: 'Batch analysis failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
  },
});
