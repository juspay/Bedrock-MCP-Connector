import { Message } from '../types.js';
import { MessageStorage } from './MessageStorage.js';
import { SessionIdentifier } from './types.js';

/**
 * In-memory implementation of MessageStorage
 * This is the default storage mechanism that maintains backward compatibility
 */
export class InMemoryMessageStorage implements MessageStorage {
    private sessions: Map<string, Message[]> = new Map();

    /**
     * Generate a unique key for a session
     */
    private getSessionKey(session: SessionIdentifier): string {
        return session.userId ? `${session.userId}:${session.sessionId}` : session.sessionId;
    }

    /**
     * Initialize the storage (no-op for in-memory)
     */
    async initialize(): Promise<void> {
        // No initialization needed for in-memory storage
    }

    /**
     * Close the storage (no-op for in-memory)
     */
    async close(): Promise<void> {
        // Clear all sessions on close
        this.sessions.clear();
    }

    /**
     * Store messages for a session
     */
    async storeMessages(session: SessionIdentifier, messages: Message[]): Promise<void> {
        const key = this.getSessionKey(session);
        this.sessions.set(key, [...messages]); // Create a copy to avoid reference issues
    }

    /**
     * Retrieve messages for a session
     */
    async getMessages(session: SessionIdentifier): Promise<Message[]> {
        const key = this.getSessionKey(session);
        const messages = this.sessions.get(key);
        return messages ? [...messages] : []; // Return a copy to avoid reference issues
    }

    /**
     * Add a single message to a session
     */
    async addMessage(session: SessionIdentifier, message: Message): Promise<void> {
        const key = this.getSessionKey(session);
        const messages = this.sessions.get(key) || [];
        messages.push(message);
        this.sessions.set(key, messages);
    }

    /**
     * Update a specific message in a session
     */
    async updateMessage(session: SessionIdentifier, messageIndex: number, message: Message): Promise<void> {
        const key = this.getSessionKey(session);
        const messages = this.sessions.get(key) || [];
        
        if (messageIndex >= 0 && messageIndex < messages.length) {
            messages[messageIndex] = message;
            this.sessions.set(key, messages);
        } else {
            throw new Error(`Message index ${messageIndex} out of bounds for session ${key}`);
        }
    }

    /**
     * Clear all messages for a session
     */
    async clearMessages(session: SessionIdentifier): Promise<void> {
        const key = this.getSessionKey(session);
        this.sessions.delete(key);
    }

    /**
     * Get the number of messages in a session
     */
    async getMessageCount(session: SessionIdentifier): Promise<number> {
        const key = this.getSessionKey(session);
        const messages = this.sessions.get(key);
        return messages ? messages.length : 0;
    }

    /**
     * Check if storage is healthy (always true for in-memory)
     */
    async isHealthy(): Promise<boolean> {
        return true;
    }

    /**
     * Get all active session keys (useful for debugging)
     */
    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Get total number of active sessions
     */
    getActiveSessionCount(): number {
        return this.sessions.size;
    }
}