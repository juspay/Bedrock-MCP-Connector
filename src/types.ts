import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { MCPClient } from "mcp-client";
import { EventEmitter } from "events";
import { StorageConfig } from "./storage/types.js";

/**
 * Configuration options for the Bedrock MCP Client
 */
export interface BedrockMCPClientConfig {
    /** The AWS Bedrock model ID to use */
    modelId: string;
    /** The AWS region to use (default: 'us-east-1') */
    region?: string;
    /** The system prompt to use for the model */
    systemPrompt?: string;
    /** The MCP server URL to connect to */
    mcpServerUrl?: string;
    /** The name of the client application */
    clientName?: string;
    /** The version of the client application */
    clientVersion?: string;
    /** Maximum tokens to generate in responses */
    maxTokens?: number;
    /** Temperature for model generation (0.0 to 1.0) */
    temperature?: number;
    /** Optional response output tags to extract specific content */
    responseOutputTags?: [string, string];
    /** Storage configuration for conversation history (default: in-memory) */
    storage?: StorageConfig;
    /** Session identifier for conversation storage */
    sessionId?: string;
    /** User identifier for multi-user scenarios */
    userId?: string;
}

/**
 * Message content item for text
 */
export interface TextContent {
    text: string;
}

/**
 * Message content item for tool use
 */
export interface ToolUseContent {
    toolUse: {
        toolUseId: string;
        name: string;
        input?: Record<string, any>;
    };
}

/**
 * Message content item for tool result
 */
export interface ToolResultContent {
    toolResult: {
        toolUseId: string;
        content: Array<{ text: string }>;
        status: 'success' | 'error';
    };
}

/**
 * Union type for all message content types
 */
export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

/**
 * Message structure for conversation
 */
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: MessageContent[];
}

/**
 * Tool specification for Bedrock
 */
export interface ToolSpec {
    name: string;
    description?: string;
    inputSchema?: {
        json: Record<string, any>;
    };
}

/**
 * Tool configuration for Bedrock
 */
export interface ToolConfig {
    tools: Array<{
        toolSpec: ToolSpec;
    }>;
}

/**
 * Tool request structure
 */
export interface ToolRequest {
    toolUseId: string;
    name: string;
    input?: Record<string, any>;
}

/**
 * Tool response structure
 */
export interface ToolResponse {
    toolUseId: string;
    content: Array<{ text: string }>;
    status: 'success' | 'error';
}

/**
 * Tool handler function type
 */
export type ToolHandler = (name: string, input: Record<string, any>) => Promise<any>;

/**
 * Events emitted by the BedrockMCPClient
 */
export interface BedrockMCPClientEvents {
    'message': (message: string) => void;
    'error': (error: Error) => void;
    'tool:start': (toolName: string, input: Record<string, any>) => void;
    'tool:end': (toolName: string, result: any) => void;
    'response:start': () => void;
    'response:chunk': (chunk: string) => void;
    'response:end': (fullResponse: string) => void;
    'connected': () => void;
    'disconnected': () => void;
}

/**
 * Typed EventEmitter for BedrockMCPClient
 */
export type BedrockMCPClientEmitter = EventEmitter & {
    on<E extends keyof BedrockMCPClientEvents>(
        event: E,
        listener: BedrockMCPClientEvents[E]
    ): BedrockMCPClientEmitter;

    emit<E extends keyof BedrockMCPClientEvents>(
        event: E,
        ...args: Parameters<BedrockMCPClientEvents[E]>
    ): boolean;
};
