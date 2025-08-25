import { Message } from '../types.js';
import { SessionIdentifier } from './types.js';

/**
 * Abstract interface for message storage
 */
export interface MessageStorage {
    /**
     * Initialize the storage connection
     */
    initialize(): Promise<void>;

    /**
     * Close the storage connection
     */
    close(): Promise<void>;

    /**
     * Store messages for a session
     * 
     * @param session - Session identifier
     * @param messages - Array of messages to store
     */
    storeMessages(session: SessionIdentifier, messages: Message[]): Promise<void>;

    /**
     * Retrieve messages for a session
     * 
     * @param session - Session identifier
     * @returns Array of messages for the session
     */
    getMessages(session: SessionIdentifier): Promise<Message[]>;

    /**
     * Add a single message to a session
     * 
     * @param session - Session identifier
     * @param message - Message to add
     */
    addMessage(session: SessionIdentifier, message: Message): Promise<void>;

    /**
     * Update a specific message in a session
     * 
     * @param session - Session identifier
     * @param messageIndex - Index of the message to update
     * @param message - Updated message
     */
    updateMessage(session: SessionIdentifier, messageIndex: number, message: Message): Promise<void>;

    /**
     * Clear all messages for a session
     * 
     * @param session - Session identifier
     */
    clearMessages(session: SessionIdentifier): Promise<void>;

    /**
     * Get the number of messages in a session
     * 
     * @param session - Session identifier
     * @returns Number of messages
     */
    getMessageCount(session: SessionIdentifier): Promise<number>;

    /**
     * Check if storage is healthy/connected
     * 
     * @returns True if storage is healthy
     */
    isHealthy(): Promise<boolean>;
}