import { EventEmitter } from "events";
import { MCPClient } from "mcp-client";
import { ConverseAgent } from "../core/ConverseAgent.js";
import { ToolManager } from "../core/ToolManager.js";
import { LogLevel } from "../utils/logging.js";
import { BedrockMCPClientConfig, BedrockMCPClientEmitter, ToolHandler } from "../types.js";
import {
    MessageStorage,
    InMemoryMessageStorage,
    RedisMessageStorage,
    SessionIdentifier
} from "../storage/index.js";

/**
 * Client for interacting with AWS Bedrock and MCP servers
 */
export class BedrockMCPClient {
    private agent: ConverseAgent;
    private toolManager: ToolManager;
    private messageStorage: MessageStorage;
    private mcpClient: MCPClient | null = null;
    private mcpServerUrl: string | null = null;
    private clientName: string;
    private clientVersion: string;
    private emitter: BedrockMCPClientEmitter;
    private isConnected: boolean = false;

    /**
     * Create a new BedrockMCPClient
     *
     * @param config - Configuration options
     */
    constructor(config: BedrockMCPClientConfig) {
        // Initialize the tool manager
        this.toolManager = new ToolManager();

        // Initialize storage based on configuration
        this.messageStorage = this.createStorage(config);

        // Create session identifier
        const session: SessionIdentifier = {
            sessionId: config.sessionId || this.generateSessionId(),
            userId: config.userId
        };

        // Initialize the agent
        this.agent = new ConverseAgent(config.modelId, {
            region: config.region,
            systemPrompt: config.systemPrompt,
            toolManager: this.toolManager,
            responseOutputTags: config.responseOutputTags,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
            messageStorage: this.messageStorage,
            session: session
        });

        // Store MCP configuration
        this.mcpServerUrl = config.mcpServerUrl || null;
        this.clientName = config.clientName || "BedrockMCPClient";
        this.clientVersion = config.clientVersion || "1.0.0";

        // Initialize event emitter
        this.emitter = new EventEmitter() as BedrockMCPClientEmitter;

        // Initialize storage
        this.initializeStorage();
    }

    /**
     * Create storage instance based on configuration
     */
    private createStorage(config: BedrockMCPClientConfig): MessageStorage {
        if (!config.storage || config.storage.type === 'memory') {
            return new InMemoryMessageStorage();
        } else if (config.storage.type === 'redis') {
            return new RedisMessageStorage(config.storage.config);
        } else {
            throw new Error(`Unsupported storage type: ${(config.storage as any).type}`);
        }
    }

    /**
     * Initialize storage connection
     */
    private async initializeStorage(): Promise<void> {
        try {
            await this.messageStorage.initialize();
        } catch (error) {
            this.emitter.emit("error", new Error(`Failed to initialize storage: ${error instanceof Error ? error.message : String(error)}`));
        }
    }

    /**
     * Generate a unique session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Connect to the MCP server
     * 
     * @returns A promise that resolves when the connection is established
     * @throws Error if the MCP server URL is not provided
     */
    async connect(): Promise<void> {
        if (!this.mcpServerUrl) {
            throw new Error("MCP server URL is required to connect");
        }

        try {
            this.emitter.emit("message", "Connecting to MCP server...");

            // Initialize MCP client
            this.mcpClient = new MCPClient({
                name: this.clientName,
                version: this.clientVersion,
            });

            // Connect to the MCP server
            await this.mcpClient.connect({
                type: "sse",
                url: this.mcpServerUrl
            });

            this.emitter.emit("message", "Connected to MCP server");
            this.emitter.emit("connected");
            this.isConnected = true;

            // Register MCP tools
            await this.registerMCPTools();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitter.emit("error", new Error(`Error connecting to MCP server: ${errorMessage}`));
            throw error;
        }
    }

    /**
     * Disconnect from the MCP server and close storage
     *
     * @returns A promise that resolves when the connection is closed
     */
    async disconnect(): Promise<void> {
        if (this.mcpClient) {
            try {
                // MCPClient doesn't have a disconnect method, so we just mark as disconnected
                this.mcpClient = null;
                this.emitter.emit("message", "Disconnected from MCP server");
                this.emitter.emit("disconnected");
                this.isConnected = false;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.emitter.emit("error", new Error(`Error disconnecting from MCP server: ${errorMessage}`));
                throw error;
            }
        }

        // Close storage connection
        try {
            await this.messageStorage.close();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitter.emit("error", new Error(`Error closing storage: ${errorMessage}`));
        }
    }

    /**
     * Check if the client is connected to the MCP server
     * 
     * @returns True if connected, false otherwise
     */
    isConnectedToMCP(): boolean {
        return this.isConnected;
    }

    /**
     * Send a prompt to the agent
     * 
     * @param prompt - The prompt to send
     * @returns A promise that resolves to the agent's response
     */
    async sendPrompt(prompt: string): Promise<string> {
        try {
            this.emitter.emit("response:start");
            this.emitter.emit("message", `Sending prompt to ${this.agent.constructor.name}...`);

            const response = await this.agent.invokeWithPrompt(prompt);

            this.emitter.emit("response:chunk", response);
            this.emitter.emit("response:end", response);

            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitter.emit("error", new Error(`Error sending prompt: ${errorMessage}`));
            throw error;
        }
    }

    /**
     * Register a custom tool
     * 
     * @param name - The name of the tool
     * @param handler - The function to execute when the tool is called
     * @param description - Optional description of the tool
     * @param inputSchema - Optional JSON schema for the tool's input
     */
    registerTool(
        name: string,
        handler: ToolHandler,
        description?: string,
        inputSchema?: Record<string, any>
    ): void {
        const wrappedHandler: ToolHandler = async (name, input) => {
            try {
                this.emitter.emit("tool:start", name, input);
                const result = await handler(name, input);
                this.emitter.emit("tool:end", name, result);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.emitter.emit("error", new Error(`Error executing tool ${name}: ${errorMessage}`));
                throw error;
            }
        };

        this.toolManager.registerTool(name, wrappedHandler, description, inputSchema);
    }

    /**
     * Get all registered tools
     * 
     * @returns An array of tool names and descriptions
     */
    getTools(): Array<{ name: string; description?: string }> {
        return this.toolManager.getTools();
    }

    /**
     * Get the event emitter
     * 
     * @returns The event emitter
     */
    getEmitter(): BedrockMCPClientEmitter {
        return this.emitter;
    }

    /**
     * Get the agent
     * 
     * @returns The agent
     */
    getAgent(): ConverseAgent {
        return this.agent;
    }

    /**
     * Get the conversation history
     *
     * @returns The conversation history
     */
    async getConversationHistory() {
        return await this.agent.getConversationHistory();
    }

    /**
     * Clear the conversation history
     */
    async clearConversationHistory(): Promise<void> {
        await this.agent.clearConversationHistory();
    }

    /**
     * Set the log level for the client and its components
     *
     * @param level - The log level to set
     */
    setLogLevel(level: LogLevel): void {
        // Access the logger property of the agent and toolManager
        // These properties are private, but we know they exist from our implementation
        (this.agent as any).logger?.setLevel(level);
        (this.toolManager as any).logger?.setLevel(level);
        
        // Set log level for storage if it supports it
        if (this.messageStorage && typeof (this.messageStorage as any).setLogLevel === 'function') {
            (this.messageStorage as any).setLogLevel(level);
        }
    }

    /**
     * Get storage health status
     *
     * @returns True if storage is healthy
     */
    async isStorageHealthy(): Promise<boolean> {
        try {
            return await this.messageStorage.isHealthy();
        } catch (error) {
            return false;
        }
    }

    /**
     * Get storage type information
     *
     * @returns Storage type and additional info
     */
    getStorageInfo(): { type: string; isHealthy?: boolean } {
        if (this.messageStorage instanceof InMemoryMessageStorage) {
            return { type: 'memory' };
        } else if (this.messageStorage instanceof RedisMessageStorage) {
            return { type: 'redis' };
        } else {
            return { type: 'unknown' };
        }
    }

    /**
     * Register tools from the MCP server
     * 
     * @private
     */
    private async registerMCPTools(): Promise<void> {
        if (!this.mcpClient) {
            return;
        }

        try {
            // Get tools from MCP client
            const tools = await this.mcpClient.getAllTools();

            if (tools.length === 0) {
                this.emitter.emit("message", "No tools available from MCP server");
                return;
            }

            // Register each tool
            for (const tool of tools) {
                if (!tool.name) {
                    this.emitter.emit("message", `Skipping tool with missing name: ${JSON.stringify(tool)}`);
                    continue;
                }

                try {
                    const toolFunction: ToolHandler = async (name, input) => {
                        try {
                            // Make sure input is an object with the expected structure
                            const formattedInput = input || {};
                            const callToolParams = {
                                name: name,
                                arguments: formattedInput
                            };

                            return await this.mcpClient!.callTool(callToolParams);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this.emitter.emit("error", new Error(`Error calling MCP tool ${name}: ${errorMessage}`));
                            throw error;
                        }
                    };

                    this.registerTool(
                        tool.name,
                        toolFunction,
                        tool.description || "",
                        tool.inputSchema || { type: "object", properties: {}, required: [] }
                    );

                    this.emitter.emit("message", `Registered MCP tool: ${tool.name}`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.emitter.emit("error", new Error(`Error registering tool ${tool.name}: ${errorMessage}`));
                }
            }

            this.emitter.emit("message", `Registered ${tools.length} MCP tools`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitter.emit("error", new Error(`Error getting tools from MCP client: ${errorMessage}`));
        }
    }
}
