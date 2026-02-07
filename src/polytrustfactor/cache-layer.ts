/**
 * PolyTrustFactor Cache Layer
 * 
 * Persistent caching layer using MongoDB to store trader positions
 * and avoid re-fetching old data from Polymarket API
 */

import { logger } from '../server/utils/logger';
import { getCollection, initMongoDB } from '../storage/mongodb';
import type { TraderPosition } from './types';

const COLLECTION_NAME = 'polytrustfactor_positions';
// No TTL - we store ALL history forever to avoid re-indexing

export interface CachedPosition extends TraderPosition {
  _id?: any;
  cachedAt: Date;
  address: string; // Trader address for indexing
}

export interface CacheStats {
  cachedCount: number;
  newCount: number;
  totalCount: number;
  cacheHitRate: number;
  oldestCached?: Date;
  newestCached?: Date;
}

/**
 * Initialize cache layer and create indexes
 */
export async function initCacheLayer(): Promise<void> {
  try {
    await initMongoDB();
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);

    // Drop old indexes if they exist
    try {
      await collection.dropIndex('address_1_transactionHash_1');
      logger.info('Dropped old index: address_1_transactionHash_1');
    } catch (err) {
      // Index might not exist, that's fine
    }

    // Create indexes for fast queries
    await collection.createIndex({ address: 1, timestamp: -1 });
    
    // Unique index: address + asset + conditionId + timestamp
    // This combination uniquely identifies a closed position
    await collection.createIndex(
      { 
        address: 1, 
        asset: 1, 
        conditionId: 1, 
        timestamp: 1 
      }, 
      { unique: true }
    );
    
    // NO TTL INDEX - we keep all history forever!

    logger.info({ collection: COLLECTION_NAME }, 'PolyTrustFactor cache layer initialized (permanent storage)');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize cache layer');
    throw error;
  }
}

/**
 * Get cached positions for a trader
 */
export async function getCachedPositions(
  address: string,
  afterTimestamp?: number
): Promise<CachedPosition[]> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const query: any = { address: address.toLowerCase() };
    if (afterTimestamp) {
      query.timestamp = { $gt: afterTimestamp };
    }

    const positions = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .toArray();

    logger.info(
      { address, count: positions.length, afterTimestamp },
      'Retrieved cached positions'
    );

    return positions;
  } catch (error) {
    logger.error({ error, address }, 'Failed to get cached positions');
    return [];
  }
}

/**
 * Get the latest cached position timestamp for a trader
 */
export async function getLatestCachedTimestamp(address: string): Promise<number | null> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const latest = await collection
      .find({ address: address.toLowerCase() })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    if (latest.length === 0 || !latest[0]) {
      return null;
    }

    return latest[0].timestamp;
  } catch (error) {
    logger.error({ error, address }, 'Failed to get latest cached timestamp');
    return null;
  }
}

/**
 * Cache new positions
 */
export async function cachePositions(
  address: string,
  positions: TraderPosition[]
): Promise<number> {
  if (positions.length === 0) {
    return 0;
  }

  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const cachedPositions: CachedPosition[] = positions.map(pos => ({
      ...pos,
      address: address.toLowerCase(),
      cachedAt: new Date(),
    }));

    // Use bulkWrite with upsert to avoid duplicates
    // Unique key: address + asset + conditionId + timestamp
    const operations = cachedPositions.map(pos => ({
      updateOne: {
        filter: {
          address: pos.address,
          asset: pos.asset,
          conditionId: pos.conditionId,
          timestamp: pos.timestamp,
        },
        update: { $set: pos },
        upsert: true,
      },
    }));

    try {
      const result = await collection.bulkWrite(operations, { ordered: false });

      const insertedCount = result.upsertedCount + result.modifiedCount;

      logger.info(
        { 
          address, 
          total: positions.length, 
          upserted: result.upsertedCount,
          modified: result.modifiedCount,
          matched: result.matchedCount,
          inserted: insertedCount,
        },
        'Cached positions'
      );

      return insertedCount;
    } catch (bulkError: any) {
      // Log bulk write errors but continue
      const writeErrors = bulkError.writeErrors || [];
      const firstError = writeErrors[0];
      
      logger.warn(
        { 
          error: bulkError.message,
          writeErrors: writeErrors.length,
          firstErrorCode: firstError?.code,
          firstErrorMessage: firstError?.errmsg,
          firstErrorKey: firstError?.keyValue,
          address,
        },
        'Bulk write had errors (some positions may have been cached)'
      );
      
      // Return count of successful operations
      const result = bulkError.result;
      if (result) {
        return (result.nUpserted || 0) + (result.nModified || 0);
      }
      return 0;
    }
  } catch (error) {
    logger.error({ error, address, count: positions.length }, 'Failed to cache positions');
    return 0;
  }
}

/**
 * Get cache statistics for a trader
 */
export async function getCacheStats(address: string): Promise<CacheStats> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const positions = await collection
      .find({ address: address.toLowerCase() })
      .sort({ timestamp: -1 })
      .toArray();

    const stats: CacheStats = {
      cachedCount: positions.length,
      newCount: 0,
      totalCount: positions.length,
      cacheHitRate: positions.length > 0 ? 1 : 0,
    };

    if (positions.length > 0) {
      const newest = positions[0];
      const oldest = positions[positions.length - 1];
      if (newest && oldest) {
        stats.newestCached = new Date(newest.timestamp * 1000);
        stats.oldestCached = new Date(oldest.timestamp * 1000);
      }
    }

    return stats;
  } catch (error) {
    logger.error({ error, address }, 'Failed to get cache stats');
    return {
      cachedCount: 0,
      newCount: 0,
      totalCount: 0,
      cacheHitRate: 0,
    };
  }
}

/**
 * Clear cache for a specific trader
 */
export async function clearTraderCache(address: string): Promise<number> {
  try {
    await initMongoDB();
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const result = await collection.deleteMany({ address: address.toLowerCase() });

    logger.info({ address, deleted: result.deletedCount }, 'Cleared trader cache');

    return result.deletedCount;
  } catch (error) {
    logger.error({ error, address }, 'Failed to clear trader cache');
    return 0;
  }
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<number> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    
    const result = await collection.deleteMany({});

    logger.info({ deleted: result.deletedCount }, 'Cleared all cache');

    return result.deletedCount;
  } catch (error) {
    logger.error({ error }, 'Failed to clear all cache');
    return 0;
  }
}

/**
 * Get cache size (total documents)
 */
export async function getCacheSize(): Promise<number> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    return await collection.countDocuments();
  } catch (error) {
    logger.error({ error }, 'Failed to get cache size');
    return 0;
  }
}

/**
 * Get unique traders count in cache
 */
export async function getCachedTradersCount(): Promise<number> {
  try {
    const collection = getCollection<CachedPosition>(COLLECTION_NAME);
    const traders = await collection.distinct('address');
    return traders.length;
  } catch (error) {
    logger.error({ error }, 'Failed to get cached traders count');
    return 0;
  }
}

/**
 * Merge cached and new positions, removing duplicates
 */
export function mergePositions(
  cached: TraderPosition[],
  fresh: TraderPosition[]
): TraderPosition[] {
  const seen = new Set<string>();
  const merged: TraderPosition[] = [];

  // Add all positions, using unique key: asset + conditionId + timestamp
  for (const pos of [...fresh, ...cached]) {
    const key = `${pos.asset}-${pos.conditionId}-${pos.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(pos);
    }
  }

  // Sort by timestamp descending
  merged.sort((a, b) => b.timestamp - a.timestamp);

  return merged;
}
