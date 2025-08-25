import { createClient, RedisClientType } from 'redis';
import { Message } from '../types.js';
import { MessageStorage } from './MessageStorage.js';
import { SessionIdentifier, RedisStorageConfig } from './types.js';
import { Logger, LogLevel, createDefaultLogger } from '../utils/logging.js';

/**
 * Redis implementation of MessageStorage
 * Provides persistent storage for conversation messages using Redis
 */
export class RedisMessageStorage implements MessageStorage {
    private client: RedisClientType | null = null;
    private config: Required<RedisStorageConfig>;
    private logger: Logger;
    private isInitialized: boolean = false;

    constructor(config: RedisStorageConfig = {}) {
        // Set default configuration
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 6379,
            password: config.password || '',
            db: config.db || 0,
            keyPrefix: config.keyPrefix || 'bedrock-mcp:conversation:',
            ttl: config.ttl || 86400, // 24 hours default
            connectionOptions: config.connectionOptions || {}
        };

        this.logger = createDefaultLogger('RedisMessageStorage');
        this.logger.setLevel(LogLevel.INFO);
    }

    /**
     * Generate a Redis key for a session
     */
    private getRedisKey(session: SessionIdentifier): string {
        const sessionKey = session.userId ? `${session.userId}:${session.sessionId}` : session.sessionId;
        return `${this.config.keyPrefix}${sessionKey}`;
    }

    /**
     * Initialize the Redis connection
     */
    async initialize(): Promise<void> {
        if (this.isInitialized && this.client?.isOpen) {
            return;
        }

        try {
            const redisUrl = this.config.password 
                ? `redis://:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.db}`
                : `redis://${this.config.host}:${this.config.port}/${this.config.db}`;

            this.client = createClient({
                url: redisUrl,
                ...this.config.connectionOptions
            });

            this.client.on('error', (err) => {
                this.logger.error('Redis client error:', err);
            });

            this.client.on('connect', () => {
                this.logger.info('Connected to Redis');
            });

            this.client.on('disconnect', () => {
                this.logger.warn('Disconnected from Redis');
            });

            await this.client.connect();
            this.isInitialized = true;
            this.logger.info(`Redis storage initialized at ${this.config.host}:${this.config.port}`);
        } catch (error) {
            this.logger.error('Failed to initialize Redis storage:', error);
            throw new Error(`Redis initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Close the Redis connection
     */
    async close(): Promise<void> {
        if (this.client?.isOpen) {
            await this.client.disconnect();
            this.logger.info('Redis connection closed');
        }
        this.isInitialized = false;
    }

    /**
     * Ensure Redis is connected
     */
    private async ensureConnected(): Promise<void> {
        if (!this.isInitialized || !this.client?.isOpen) {
            await this.initialize();
        }
    }

    /**
     * Store messages for a session
     */
    async storeMessages(session: SessionIdentifier, messages: Message[]): Promise<void> {
        await this.ensureConnected();
        
        const key = this.getRedisKey(session);
        const serializedMessages = JSON.stringify(messages);
        
        try {
            await this.client!.setEx(key, this.config.ttl, serializedMessages);
            this.logger.debug(`Stored ${messages.length} messages for session ${session.sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to store messages for session ${session.sessionId}:`, error);
            throw new Error(`Redis store operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Retrieve messages for a session
     */
    async getMessages(session: SessionIdentifier): Promise<Message[]> {
        await this.ensureConnected();
        
        const key = this.getRedisKey(session);
        
        try {
            const serializedMessages = await this.client!.get(key);
            
            if (!serializedMessages) {
                this.logger.debug(`No messages found for session ${session.sessionId}`);
                return [];
            }
            
            const messages = JSON.parse(serializedMessages) as Message[];
            this.logger.debug(`Retrieved ${messages.length} messages for session ${session.sessionId}`);
            return messages;
        } catch (error) {
            this.logger.error(`Failed to retrieve messages for session ${session.sessionId}:`, error);
            throw new Error(`Redis get operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Add a single message to a session
     */
    async addMessage(session: SessionIdentifier, message: Message): Promise<void> {
        const messages = await this.getMessages(session);
        messages.push(message);
        await this.storeMessages(session, messages);
    }

    /**
     * Update a specific message in a session
     */
    async updateMessage(session: SessionIdentifier, messageIndex: number, message: Message): Promise<void> {
        const messages = await this.getMessages(session);
        
        if (messageIndex >= 0 && messageIndex < messages.length) {
            messages[messageIndex] = message;
            await this.storeMessages(session, messages);
        } else {
            throw new Error(`Message index ${messageIndex} out of bounds for session ${session.sessionId}`);
        }
    }

    /**
     * Clear all messages for a session
     */
    async clearMessages(session: SessionIdentifier): Promise<void> {
        await this.ensureConnected();
        
        const key = this.getRedisKey(session);
        
        try {
            await this.client!.del(key);
            this.logger.debug(`Cleared messages for session ${session.sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to clear messages for session ${session.sessionId}:`, error);
            throw new Error(`Redis delete operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get the number of messages in a session
     */
    async getMessageCount(session: SessionIdentifier): Promise<number> {
        const messages = await this.getMessages(session);
        return messages.length;
    }

    /**
     * Check if Redis storage is healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            await this.ensureConnected();
            await this.client!.ping();
            return true;
        } catch (error) {
            this.logger.error('Redis health check failed:', error);
            return false;
        }
    }

    /**
     * Set TTL for a specific session
     */
    async setSessionTTL(session: SessionIdentifier, ttlSeconds: number): Promise<void> {
        await this.ensureConnected();
        
        const key = this.getRedisKey(session);
        
        try {
            await this.client!.expire(key, ttlSeconds);
            this.logger.debug(`Set TTL of ${ttlSeconds}s for session ${session.sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to set TTL for session ${session.sessionId}:`, error);
            throw new Error(`Redis expire operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get all session keys matching the prefix (useful for debugging)
     */
    async getActiveSessions(): Promise<string[]> {
        await this.ensureConnected();
        
        try {
            const keys = await this.client!.keys(`${this.config.keyPrefix}*`);
            return keys.map(key => key.replace(this.config.keyPrefix, ''));
        } catch (error) {
            this.logger.error('Failed to get active sessions:', error);
            throw new Error(`Redis keys operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get Redis client info (useful for monitoring)
     */
    async getRedisInfo(): Promise<string> {
        await this.ensureConnected();
        
        try {
            return await this.client!.info();
        } catch (error) {
            this.logger.error('Failed to get Redis info:', error);
            throw new Error(`Redis info operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Set log level for the storage
     */
    setLogLevel(level: LogLevel): void {
        this.logger.setLevel(level);
    }
}