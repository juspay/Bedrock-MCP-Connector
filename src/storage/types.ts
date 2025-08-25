import { Message } from '../types.js';

/**
 * Configuration for Redis storage
 */
export interface RedisStorageConfig {
    /** Redis host (default: 'localhost') */
    host?: string;
    /** Redis port (default: 6379) */
    port?: number;
    /** Redis password */
    password?: string;
    /** Redis database number (default: 0) */
    db?: number;
    /** Key prefix for conversation storage (default: 'bedrock-mcp:conversation:') */
    keyPrefix?: string;
    /** TTL for conversation keys in seconds (default: 86400 - 24 hours) */
    ttl?: number;
    /** Redis connection options */
    connectionOptions?: {
        connectTimeout?: number;
        lazyConnect?: boolean;
        retryDelayOnFailover?: number;
        maxRetriesPerRequest?: number;
        [key: string]: any;
    };
}

/**
 * Storage configuration union type
 */
export type StorageConfig = 
    | { type: 'memory' }
    | { type: 'redis'; config: RedisStorageConfig };

/**
 * Session identifier for conversation storage
 */
export interface SessionIdentifier {
    /** Unique session ID */
    sessionId: string;
    /** Optional user ID for multi-user scenarios */
    userId?: string;
}