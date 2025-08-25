# Bedrock MCP Connector

A TypeScript client for interacting with AWS Bedrock and MCP (Model Context Protocol) servers.

## Features

- Seamless integration with AWS Bedrock's Converse API
- Support for Claude and other Bedrock models
- Connect to MCP servers to discover and use available tools
- Register custom tool handlers
- Event-based architecture for streaming responses
- TypeScript support with full type definitions
- Command-line interface for interactive usage
- Modular design for easy integration into other projects

## Installation

```bash
npm install @juspay/bedrock-mcp-connector
```

## Usage

### Basic Usage

```typescript
import { BedrockMCPClient, LogLevel } from "@juspay/bedrock-mcp-connector";

// Create a client
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  systemPrompt: "You are a helpful assistant.",
  mcpServerUrl: "http://localhost:5713/sse", // Optional
});

// Set the log level (optional)
// LogLevel.INFO - Default, shows important information
// LogLevel.DEBUG - Shows detailed debugging information
// LogLevel.WARN - Shows only warnings and errors
// LogLevel.ERROR - Shows only errors
// LogLevel.NONE - Suppresses all logs
client.setLogLevel(LogLevel.INFO);

// Connect to MCP server (if URL is provided)
if (client.mcpServerUrl) {
  await client.connect();
}

// Send a prompt
const response = await client.sendPrompt("What is the capital of France?");
console.log("Response:", response);

// Disconnect when done
if (client.isConnectedToMCP()) {
  await client.disconnect();
}
```

### Using Redis for Persistent Storage

The package supports both in-memory and Redis storage for conversation history:

```typescript
import { BedrockMCPClient } from "@juspay/bedrock-mcp-connector";

// Using Redis storage for persistent conversations
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  sessionId: "user-session-123", // Unique session identifier
  userId: "user-456", // Optional user identifier
  storage: {
    type: "redis",
    config: {
      host: "localhost",
      port: 6379,
      password: "your-redis-password", // Optional
      db: 0, // Redis database number
      keyPrefix: "bedrock-mcp:", // Key prefix for Redis keys
      ttl: 86400, // TTL in seconds (24 hours)
      connectionOptions: {
        connectTimeout: 5000,
        lazyConnect: true
      }
    }
  }
});

// Conversations are now persistent across client restarts
const response = await client.sendPrompt("Remember this: my favorite color is blue");
console.log("Response:", response);

// Later, in a new client instance with the same sessionId...
const newClient = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  sessionId: "user-session-123", // Same session ID
  storage: { type: "redis", config: { /* same config */ } }
});

const response2 = await newClient.sendPrompt("What's my favorite color?");
// The model will remember the previous conversation!
```

### Storage Configuration Options

#### In-Memory Storage (Default)
```typescript
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  // No storage config = in-memory storage
  // OR explicitly specify:
  storage: { type: "memory" }
});
```

#### Redis Storage
```typescript
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  storage: {
    type: "redis",
    config: {
      host: "localhost",        // Redis host (default: 'localhost')
      port: 6379,              // Redis port (default: 6379)
      password: "password",    // Redis password (optional)
      db: 0,                   // Redis database (default: 0)
      keyPrefix: "myapp:",     // Key prefix (default: 'bedrock-mcp:conversation:')
      ttl: 3600,              // TTL in seconds (default: 86400 - 24 hours)
      connectionOptions: {     // Additional Redis connection options
        connectTimeout: 5000,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      }
    }
  }
});
```

### With Event Listeners

```typescript
import { BedrockMCPClient, LogLevel } from "@juspay/bedrock-mcp-connector";

// Create a client
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
});

// Set the log level (optional)
client.setLogLevel(LogLevel.INFO);

// Set up event listeners
const emitter = client.getEmitter();

emitter.on("message", (message) => {
  console.log(`Message: ${message}`);
});

emitter.on("error", (error) => {
  console.error(`Error: ${error.message}`);
});

emitter.on("tool:start", (toolName, input) => {
  console.log(`Tool started: ${toolName}`);
});

emitter.on("tool:end", (toolName, result) => {
  console.log(`Tool completed: ${toolName}`);
});

emitter.on("response:start", () => {
  console.log("Response started");
});

emitter.on("response:chunk", (chunk) => {
  console.log(`Response chunk: ${chunk.substring(0, 50)}...`);
});

emitter.on("response:end", (fullResponse) => {
  console.log("Response completed");
});

// Send a prompt
const response = await client.sendPrompt("What is the capital of France?");
```

## Creating and Registering Tools

Tools are a powerful feature that allow the LLM to perform actions and access external data. This section provides detailed guidance on how to create and register tools effectively.

### Tool Registration Basics

The `registerTool` method takes four parameters:

```typescript
client.registerTool(
  name, // String: Unique identifier for the tool
  handler, // Function: Async function that implements the tool
  description, // String: Human-readable description of what the tool does
  inputSchema // Object: JSON Schema defining the tool's parameters
);
```

### Best Practices for Tool Design

1. **Single Responsibility**: Each tool should do one thing well
2. **Clear Naming**: Use descriptive, action-oriented names (e.g., `getCurrentTime`, `searchDatabase`)
3. **Comprehensive Descriptions**: Provide detailed descriptions that help the LLM understand when to use the tool
4. **Thorough Input Validation**: Always validate inputs to prevent errors
5. **Informative Error Messages**: Return clear error messages when something goes wrong
6. **Consistent Return Format**: Always return results in the same format
7. **Appropriate Logging**: Include logging to help with debugging

### Detailed Tool Registration Example

```typescript
import { BedrockMCPClient, LogLevel } from "@juspay/bedrock-mcp-connector";

// Create a client
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
});

// Set the log level (optional)
client.setLogLevel(LogLevel.INFO);

// Register a custom tool
client.registerTool(
  // Name: Use a clear, descriptive name
  "getCurrentTime",

  // Handler: Implement the tool's functionality
  async (name, input) => {
    // Input validation with default values
    const timezone = input.timezone || "UTC";

    try {
      // Core functionality
      const date = new Date().toLocaleString("en-US", { timeZone: timezone });

      // Return successful result
      return {
        content: [{ text: `The current time is ${date} in ${timezone}` }],
      };
    } catch (error) {
      // Error handling
      return {
        content: [{ text: `Error getting time: ${error.message}` }],
        isError: true,
      };
    }
  },

  // Description: Clearly explain what the tool does
  "Get the current time in the specified timezone. This tool returns the current date and time formatted according to US locale conventions.",

  // Input Schema: Define the parameters using JSON Schema
  {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description:
          "The timezone to get the time for (e.g., UTC, America/New_York, Europe/London)",
        examples: ["UTC", "America/New_York", "Europe/Paris", "Asia/Tokyo"],
      },
    },
    required: [], // Empty array means no parameters are required
  }
);

// Send a prompt that might use the tool
const response = await client.sendPrompt("What time is it now in Tokyo?");
```

### Input Schema Design

The input schema uses JSON Schema format to define the parameters your tool accepts:

```typescript
{
  type: "object",
  properties: {
    // Define each parameter
    paramName: {
      type: "string" | "number" | "boolean" | "array" | "object",
      description: "Clear description of the parameter",
      examples: ["example1", "example2"], // Optional but helpful
      enum: ["option1", "option2"],       // For parameters with fixed options
      minimum: 1,                         // For number validation
      maximum: 100,                       // For number validation
      pattern: "^[a-z]+$",                // For string validation with regex
      // Additional JSON Schema properties as needed
    },
    // More parameters...
  },
  required: ["paramName1", "paramName2"],  // List required parameters
  additionalProperties: false              // Prevent extra parameters (optional)
}
```

### Error Handling in Tools

Proper error handling is crucial for tools:

```typescript
client.registerTool(
  "divideNumbers",
  async (name, input) => {
    // Parameter validation
    if (typeof input.dividend !== "number") {
      return {
        content: [{ text: "Error: dividend must be a number" }],
        isError: true,
      };
    }

    if (typeof input.divisor !== "number") {
      return {
        content: [{ text: "Error: divisor must be a number" }],
        isError: true,
      };
    }

    // Business logic validation
    if (input.divisor === 0) {
      return {
        content: [{ text: "Error: Cannot divide by zero" }],
        isError: true,
      };
    }

    try {
      // Perform the operation
      const result = input.dividend / input.divisor;

      return {
        content: [
          {
            text: `${input.dividend} divided by ${input.divisor} equals ${result}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ text: `Calculation error: ${error.message}` }],
        isError: true,
      };
    }
  },
  "Divide two numbers",
  {
    type: "object",
    properties: {
      dividend: {
        type: "number",
        description: "The number to be divided",
      },
      divisor: {
        type: "number",
        description: "The number to divide by (cannot be zero)",
      },
    },
    required: ["dividend", "divisor"],
  }
);
```

### Examples of Different Tool Types

#### 1. Data Retrieval Tool

```typescript
client.registerTool(
  "getWeatherForecast",
  async (name, input) => {
    const { city, days = 3 } = input;

    if (!city) {
      return {
        content: [{ text: "Error: city parameter is required" }],
        isError: true,
      };
    }

    try {
      // In a real implementation, this would call a weather API
      const forecast = await weatherService.getForecast(city, days);

      return {
        content: [
          {
            text: `Weather forecast for ${city} for the next ${days} days:\n\n${forecast}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ text: `Error getting weather forecast: ${error.message}` }],
        isError: true,
      };
    }
  },
  "Get weather forecast for a city",
  {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The city to get the weather forecast for",
      },
      days: {
        type: "number",
        description: "Number of days to forecast (default: 3)",
        minimum: 1,
        maximum: 10,
      },
    },
    required: ["city"],
  }
);
```

#### 2. Computational Tool

```typescript
client.registerTool(
  "calculateStatistics",
  async (name, input) => {
    const { numbers } = input;

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return {
        content: [
          { text: "Error: numbers must be a non-empty array of numbers" },
        ],
        isError: true,
      };
    }

    if (!numbers.every((n) => typeof n === "number")) {
      return {
        content: [{ text: "Error: all elements in numbers must be numbers" }],
        isError: true,
      };
    }

    try {
      const sum = numbers.reduce((a, b) => a + b, 0);
      const mean = sum / numbers.length;
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const median =
        sortedNumbers.length % 2 === 0
          ? (sortedNumbers[sortedNumbers.length / 2 - 1] +
              sortedNumbers[sortedNumbers.length / 2]) /
            2
          : sortedNumbers[Math.floor(sortedNumbers.length / 2)];

      return {
        content: [
          {
            text: `Statistics for [${numbers.join(
              ", "
            )}]:\n- Sum: ${sum}\n- Mean: ${mean}\n- Median: ${median}\n- Min: ${Math.min(
              ...numbers
            )}\n- Max: ${Math.max(...numbers)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ text: `Error calculating statistics: ${error.message}` }],
        isError: true,
      };
    }
  },
  "Calculate basic statistics for an array of numbers",
  {
    type: "object",
    properties: {
      numbers: {
        type: "array",
        items: {
          type: "number",
        },
        description: "Array of numbers to calculate statistics for",
      },
    },
    required: ["numbers"],
  }
);
```

#### 3. External API Tool

```typescript
client.registerTool(
  "searchWikipedia",
  async (name, input) => {
    const { query, limit = 3 } = input;

    if (!query || typeof query !== "string") {
      return {
        content: [
          { text: "Error: query parameter is required and must be a string" },
        ],
        isError: true,
      };
    }

    try {
      // In a real implementation, this would call the Wikipedia API
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=${limit}&namespace=0&format=json`;
      const response = await fetch(searchUrl);
      const [searchTerm, titles, descriptions, urls] = await response.json();

      let resultText = `Wikipedia search results for "${query}":\n\n`;

      for (let i = 0; i < titles.length; i++) {
        resultText += `${i + 1}. ${titles[i]}\n`;
        resultText += `   ${descriptions[i]}\n`;
        resultText += `   ${urls[i]}\n\n`;
      }

      return {
        content: [{ text: resultText }],
      };
    } catch (error) {
      return {
        content: [{ text: `Error searching Wikipedia: ${error.message}` }],
        isError: true,
      };
    }
  },
  "Search Wikipedia for information on a topic",
  {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 3)",
        minimum: 1,
        maximum: 10,
      },
    },
    required: ["query"],
  }
);
```

### Tips for Effective Tool Usage

1. **Provide Clear Instructions in System Prompt**: Guide the LLM on when and how to use tools
2. **Use Descriptive Tool Names**: Names should clearly indicate the tool's purpose
3. **Include Detailed Parameter Descriptions**: Help the LLM understand what each parameter does
4. **Add Examples in Parameter Descriptions**: Show valid values for parameters
5. **Implement Thorough Validation**: Check all inputs before processing
6. **Return Structured Data**: Format tool results consistently
7. **Handle Errors Gracefully**: Provide clear error messages
8. **Test Tools Thoroughly**: Ensure they work with various inputs

### Advanced Tool Registration

For more complex tools, you can structure your code to make it more maintainable:

```typescript
// Define tool handlers in separate files
import { searchDatabase } from "./tools/database.js";
import { processImage } from "./tools/image.js";
import { translateText } from "./tools/translation.js";

// Import tool schemas
import {
  searchDatabaseSchema,
  processImageSchema,
  translateTextSchema,
} from "./schemas/toolSchemas.js";

// Register tools
client.registerTool(
  "searchDatabase",
  searchDatabase,
  "Search the database for records matching the query",
  searchDatabaseSchema
);

client.registerTool(
  "processImage",
  processImage,
  "Process and analyze an image",
  processImageSchema
);

client.registerTool(
  "translateText",
  translateText,
  "Translate text between languages",
  translateTextSchema
);
```

By following these best practices, you can create tools that are easy for the LLM to understand and use effectively, resulting in better responses for your users.

### Command Line Interface

The package includes a command-line interface for interactive usage:

```bash
npx @juspay/bedrock-mcp-connector
```

Or install globally:

```bash
npm install -g @juspay/bedrock-mcp-connector
@juspay/bedrock-mcp-connector
```

#### CLI Options

```
Options:
  -m, --model <id>           AWS Bedrock model ID (default: anthropic.claude-3-sonnet-20240229-v1:0)
  -r, --region <region>      AWS region (default: us-east-1)
  -s, --system-prompt <text> System prompt for the model
  -u, --mcp-url <url>        MCP server URL
  -n, --name <name>          Client name
  -v, --version <version>    Client version
  -h, --help                 Show this help message
```

## Session Management and Multi-User Support

The package supports sophisticated session management for multi-user applications:

### Session Isolation
```typescript
// User 1's conversation
const user1Client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  sessionId: "session-user1-chat1",
  userId: "user1",
  storage: { type: "redis", config: { /* redis config */ } }
});

// User 2's conversation (completely isolated)
const user2Client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  sessionId: "session-user2-chat1",
  userId: "user2",
  storage: { type: "redis", config: { /* redis config */ } }
});
```

### Storage Health Monitoring
```typescript
// Check if storage is healthy
const isHealthy = await client.isStorageHealthy();
if (!isHealthy) {
  console.log("Storage connection issues detected");
}

// Get storage information
const storageInfo = client.getStorageInfo();
console.log("Storage type:", storageInfo.type); // 'memory' or 'redis'
```

### Redis Key Management

When using Redis storage, keys are structured as follows:
- Pattern: `{keyPrefix}{userId}:{sessionId}` or `{keyPrefix}{sessionId}`
- Default prefix: `bedrock-mcp:conversation:`
- Example keys:
  - `bedrock-mcp:conversation:user123:session456`
  - `bedrock-mcp:conversation:anonymous-session789`

### Storage Migration

You can migrate between storage types by copying conversation history:

```typescript
// Get history from in-memory client
const memoryClient = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  storage: { type: "memory" }
});

const history = await memoryClient.getConversationHistory();

// Create Redis client and restore history
const redisClient = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  storage: { type: "redis", config: { /* config */ } }
});

// Note: Direct history restoration requires custom implementation
// The storage layer handles this automatically for same-session clients
```

## API Reference

### BedrockMCPClient

#### Constructor

```typescript
new BedrockMCPClient(config: {
  modelId: string;
  region?: string;
  systemPrompt?: string;
  mcpServerUrl?: string;
  clientName?: string;
  clientVersion?: string;
  maxTokens?: number;
  temperature?: number;
  responseOutputTags?: [string, string];
  storage?: StorageConfig;
  sessionId?: string;
  userId?: string;
})
```

#### Methods

- `connect(): Promise<void>` - Connect to the MCP server
- `disconnect(): Promise<void>` - Disconnect from the MCP server and close storage
- `isConnectedToMCP(): boolean` - Check if the client is connected to the MCP server
- `sendPrompt(prompt: string): Promise<string>` - Send a prompt to the agent
- `registerTool(name: string, handler: ToolHandler, description?: string, inputSchema?: Record<string, any>): void` - Register a custom tool
- `getTools(): Array<{ name: string; description?: string }>` - Get all registered tools
- `getEmitter(): BedrockMCPClientEmitter` - Get the event emitter
- `getAgent(): ConverseAgent` - Get the agent
- `getConversationHistory(): Promise<Message[]>` - Get the conversation history
- `clearConversationHistory(): Promise<void>` - Clear the conversation history
- `setLogLevel(level: LogLevel): void` - Set the log level for the client and its components
- `isStorageHealthy(): Promise<boolean>` - Check if storage is healthy
- `getStorageInfo(): { type: string; isHealthy?: boolean }` - Get storage type information

### Storage Types

#### StorageConfig
```typescript
type StorageConfig =
  | { type: 'memory' }
  | { type: 'redis'; config: RedisStorageConfig };
```

#### RedisStorageConfig
```typescript
interface RedisStorageConfig {
  host?: string;                    // Redis host (default: 'localhost')
  port?: number;                    // Redis port (default: 6379)
  password?: string;                // Redis password
  db?: number;                      // Redis database number (default: 0)
  keyPrefix?: string;               // Key prefix (default: 'bedrock-mcp:conversation:')
  ttl?: number;                     // TTL in seconds (default: 86400)
  connectionOptions?: {             // Additional Redis connection options
    connectTimeout?: number;
    lazyConnect?: boolean;
    retryDelayOnFailover?: number;
    maxRetriesPerRequest?: number;
    [key: string]: any;
  };
}
```

#### SessionIdentifier
```typescript
interface SessionIdentifier {
  sessionId: string;                // Unique session ID
  userId?: string;                  // Optional user ID for multi-user scenarios
}
```

### Events

- `message` - Emitted when a message is logged
- `error` - Emitted when an error occurs
- `tool:start` - Emitted when a tool starts executing
- `tool:end` - Emitted when a tool finishes executing
- `response:start` - Emitted when a response starts
- `response:chunk` - Emitted when a response chunk is received
- `response:end` - Emitted when a response ends
- `connected` - Emitted when connected to the MCP server
- `disconnected` - Emitted when disconnected from the MCP server

## Logging System

The package includes a comprehensive logging system that allows you to control the verbosity of logs and debug information.

### Log Levels

The following log levels are available (from most to least verbose):

- `LogLevel.DEBUG` (0) - Detailed debugging information
- `LogLevel.INFO` (1) - General information messages (default)
- `LogLevel.WARN` (2) - Warning messages
- `LogLevel.ERROR` (3) - Error messages
- `LogLevel.NONE` (4) - No logging

### Setting the Log Level

You can set the log level for the client and all its components:

```typescript
import { BedrockMCPClient, LogLevel } from "@juspay/bedrock-mcp-connector";

// Create a client
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
});

// Set the log level
client.setLogLevel(LogLevel.INFO); // Default level
// or
client.setLogLevel(LogLevel.DEBUG); // For detailed debugging
```

### What Gets Logged at Each Level

- **DEBUG**: All messages, including detailed API responses, tool execution details, and internal state changes
- **INFO**: General operational information, tool requests, connection status, and important events
- **WARN**: Potential issues that don't prevent operation but might need attention
- **ERROR**: Errors that affect operation but don't necessarily crash the application
- **NONE**: No logs will be output (except for unhandled exceptions)

### Use Cases

#### Development and Debugging (LogLevel.DEBUG)

Use the DEBUG level when:

- Developing new features or tools
- Troubleshooting issues with API responses
- Debugging tool execution problems
- Understanding the flow of data through the system

```typescript
// Enable detailed debugging
client.setLogLevel(LogLevel.DEBUG);

// Now you'll see detailed information about:
// - Full API responses from Bedrock
// - Tool input and output details
// - Message content and processing
```

#### Production Usage (LogLevel.INFO or LogLevel.WARN)

For production environments:

- Use INFO to keep track of normal operations
- Use WARN to only see potential issues

```typescript
// For normal operation with important information
client.setLogLevel(LogLevel.INFO);

// Or for minimal logging (only warnings and errors)
client.setLogLevel(LogLevel.WARN);
```

#### Audit and Monitoring (LogLevel.INFO)

When you need to track tool usage and interactions:

```typescript
client.setLogLevel(LogLevel.INFO);

// This will log:
// - When tools are requested and executed
// - Connection events
// - Response start/end events
```

#### Silent Operation (LogLevel.NONE)

When you want to suppress all logs:

```typescript
client.setLogLevel(LogLevel.NONE);
```

## Conversation Management

The package maintains conversation history automatically, allowing for natural back-and-forth interactions with the model. This enables the model to remember context from previous messages and provide coherent responses throughout a conversation.

### How Conversation History Works

1. Each message sent to and received from the model is stored in memory
2. The full conversation history is included with each new request to the model
3. This allows the model to reference previous messages and maintain context

### Managing Conversation History

You can access and manage the conversation history using these methods:

```typescript
// Get the current conversation history
const history = client.getConversationHistory();
console.log("Current conversation:", history);

// Clear the conversation history to start a new conversation
client.clearConversationHistory();
console.log("Started a new conversation");
```

### Example: Multi-turn Conversation

```typescript
import { BedrockMCPClient } from "@juspay/bedrock-mcp-connector";

const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
});

// First message
let response = await client.sendPrompt("What are the three primary colors?");
console.log("Response 1:", response);

// Follow-up question (model remembers the context)
response = await client.sendPrompt(
  "And what colors do you get when you mix them?"
);
console.log("Response 2:", response);

// Start a new conversation
client.clearConversationHistory();

// This is now a completely new conversation with no memory of the previous exchange
response = await client.sendPrompt("What's the tallest mountain in the world?");
console.log("New conversation response:", response);
```

### Tool Results Across Multiple API Calls

The package maintains tool results across multiple API calls, ensuring that all tool results are included in the final response. This is particularly useful when the model needs to use multiple tools to answer a complex question.

### Handling Missing Required Parameters

When using tools that require specific parameters, you can implement an interactive flow where the model asks for missing information. There are two key approaches to handling missing parameters:

#### 1. Using a Specialized System Prompt

You can guide the model's behavior with a specialized system prompt that instructs it on how to handle missing parameters:

```typescript
const client = new BedrockMCPClient({
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  region: "us-east-1",
  systemPrompt: `You are a helpful assistant with access to external tools.
                  - Use available tools **only when necessary** to provide accurate or up-to-date information.
                  - If a question can be answered based on your knowledge, respond directly **without using tools**.
                  - If a tool is required:
                      1. **Check if all necessary parameters are available.** If they are, use the tool directly.
                      2. **If any parameters are missing, do not proceed.** Instead, ask the user for the required information, explaining why it is needed.
                      3. **Wait for the user's response before using the tool.**
                  - If the user asks multiple questions, **handle them one by one**.
                  - If some questions require tools and others don't, **answer what you can immediately**, then use tools as needed.
                  - After using a tool, continue answering any remaining questions.
                  `,
});
```

This system prompt instructs the model to:

- Not attempt to use tools with incomplete parameters
- Clearly explain which parameters are missing and why they're needed
- Ask the user for the missing information
- Only use the tool once all required parameters are available

#### 2. Implementing Parameter Validation in Tools

Implement thorough parameter validation in your tool handlers to ensure they handle missing parameters gracefully:

```typescript
client.registerTool(
  "calculator",
  async (name, input) => {
    const { operation, a, b } = input;

    // Validate required parameters
    if (!operation) {
      return {
        content: [
          { text: `Error: Operation parameter is required for calculator` },
        ],
        isError: true,
      };
    }

    if (a === undefined || a === null) {
      return {
        content: [
          { text: `Error: First operand (a) is required for calculator` },
        ],
        isError: true,
      };
    }

    if (b === undefined || b === null) {
      return {
        content: [
          { text: `Error: Second operand (b) is required for calculator` },
        ],
        isError: true,
      };
    }

    // Tool implementation...
    let result;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      content: [{ text: `The result of ${a} ${operation} ${b} is ${result}` }],
    };
  },
  "Perform basic arithmetic operations",
  {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description:
          "The operation to perform (add, subtract, multiply, divide)",
        enum: ["add", "subtract", "multiply", "divide"],
      },
      a: { type: "number", description: "The first operand" },
      b: { type: "number", description: "The second operand" },
    },
    required: ["operation", "a", "b"],
  }
);
```

#### 3. Interactive Conversation Flow

Implement an interactive conversation flow that handles the back-and-forth between the user and the model:

```typescript
import { BedrockMCPClient } from "@juspay/bedrock-mcp-connector";
import * as readline from "readline";

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
const getUserInput = (question) =>
  new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });

async function runInteractiveSession() {
  const client = new BedrockMCPClient({
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    region: "us-east-1",
    systemPrompt: `You are a helpful assistant with access to external tools.
                  - Use available tools **only when necessary** to provide accurate or up-to-date information.
                  - If a question can be answered based on your knowledge, respond directly **without using tools**.
                  - If a tool is required:
                      1. **Check if all necessary parameters are available.** If they are, use the tool directly.
                      2. **If any parameters are missing, do not proceed.** Instead, ask the user for the required information, explaining why it is needed.
                      3. **Wait for the user's response before using the tool.**
                  - If the user asks multiple questions, **handle them one by one**.
                  - If some questions require tools and others don't, **answer what you can immediately**, then use tools as needed.
                  - After using a tool, continue answering any remaining questions.
                  `,
  });

  // Register tools (calculator, weather forecast, etc.)
  // ...

  // Start the conversation
  console.log("Ask me anything! (Type 'exit' to quit)");

  while (true) {
    // Get user input
    const userInput = await getUserInput("> ");

    if (userInput.toLowerCase() === "exit") break;

    // Send to the model
    const response = await client.sendPrompt(userInput);
    console.log("\nAssistant:", response);
  }

  rl.close();
}

runInteractiveSession().catch(console.error);
```

#### 4. Managing Tool Results Between Conversations

When implementing multi-turn conversations, it's important to clear accumulated tool results between separate conversations to prevent results from previous conversations affecting new ones:

```typescript
// After completing a conversation or when starting a new one
client.clearConversationHistory();
client.getAgent().clearAccumulatedToolResults();
```

This ensures that tool results from previous conversations don't appear in new conversations.

#### Example: Complete Conversation Flow

Here's an example of a complete conversation flow where the model asks for missing parameters:

1. User asks a question with incomplete parameters:

   ```
   User: "Can you calculate something for me? I want to multiply 42 by something."
   ```

2. Model responds, asking for the missing parameter:

   ```
   Assistant: "I'd be happy to help you with that calculation. To use the calculator tool,
   I need two operands (numbers) and the operation. You've provided one number (42) and
   mentioned you want to multiply, but I'm missing the second operand.
   Could you please tell me what number you want to multiply 42 by?"
   ```

3. User provides the missing parameter:

   ```
   User: "The second number is 7."
   ```

4. Model uses the tool with complete parameters:
   ```
   Assistant: "I've calculated that 42 multiplied by 7 equals 294."
   ```

This pattern allows for natural conversations where the model can request missing information and then use that information to complete the tool execution.

### Creating a Custom Logger

You can create your own logger for other parts of your application:

```typescript
import { createDefaultLogger, LogLevel } from "@juspay/bedrock-mcp-connector";

// Create a logger with a custom prefix
const logger = createDefaultLogger("MyComponent");

// Set the log level
logger.setLevel(LogLevel.INFO);

// Use the logger
logger.info("Application started");
logger.debug("This won't be shown unless log level is DEBUG");
logger.warn("Something might be wrong");
logger.error("An error occurred", errorObject);
```

## License

MIT
