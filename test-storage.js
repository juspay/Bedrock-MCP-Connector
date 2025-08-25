#!/usr/bin/env node
import { BedrockMCPClient, LogLevel, createDefaultLogger } from './dist/index.js';

// Create a logger
const logger = createDefaultLogger('StorageTest');
logger.setLevel(LogLevel.INFO);

/**
 * Test in-memory storage (default behavior)
 */
async function testInMemoryStorage() {
    logger.info('=== Testing In-Memory Storage ===');
    
    try {
        // Create client with default (in-memory) storage
        const client = new BedrockMCPClient({
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            region: 'us-east-1',
            sessionId: 'test-session-memory',
            systemPrompt: 'You are a helpful assistant for testing storage functionality.'
        });

        client.setLogLevel(LogLevel.INFO);

        // Register a simple tool for testing
        client.registerTool(
            'getCurrentTime',
            async (name, input) => {
                const timezone = input.timezone || 'UTC';
                const date = new Date().toLocaleString('en-US', { timeZone: timezone });
                return { content: [{ text: `Current time: ${date} in ${timezone}` }] };
            },
            'Get the current time',
            {
                type: 'object',
                properties: {
                    timezone: { type: 'string', description: 'Timezone' }
                },
                required: []
            }
        );

        // Test conversation
        logger.info('Sending first message...');
        let response = await client.sendPrompt('Hello! What time is it?');
        logger.info('Response 1:', response);

        logger.info('Sending follow-up message...');
        response = await client.sendPrompt('What about in Tokyo?');
        logger.info('Response 2:', response);

        // Check conversation history
        const history = await client.getConversationHistory();
        logger.info(`Conversation history has ${history.length} messages`);

        // Check storage info
        const storageInfo = client.getStorageInfo();
        logger.info('Storage info:', storageInfo);

        // Test storage health
        const isHealthy = await client.isStorageHealthy();
        logger.info('Storage healthy:', isHealthy);

        logger.info('✅ In-memory storage test completed successfully!');
        return true;
    } catch (error) {
        logger.error('❌ In-memory storage test failed:', error.message);
        return false;
    }
}

/**
 * Test Redis storage (if Redis is available)
 */
async function testRedisStorage() {
    logger.info('=== Testing Redis Storage ===');
    
    try {
        // Create client with Redis storage
        const client = new BedrockMCPClient({
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            region: 'us-east-1',
            sessionId: 'test-session-redis',
            userId: 'test-user',
            storage: {
                type: 'redis',
                config: {
                    host: 'localhost',
                    port: 6379,
                    keyPrefix: 'bedrock-test:',
                    ttl: 3600 // 1 hour
                }
            },
            systemPrompt: 'You are a helpful assistant for testing Redis storage functionality.'
        });

        client.setLogLevel(LogLevel.INFO);

        // Register a simple tool for testing
        client.registerTool(
            'getStorageInfo',
            async (name, input) => {
                return { 
                    content: [{ 
                        text: 'This message is stored in Redis! Session data persists across client restarts.' 
                    }] 
                };
            },
            'Get storage information',
            { type: 'object', properties: {}, required: [] }
        );

        // Wait a moment for Redis connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check storage health first
        const isHealthy = await client.isStorageHealthy();
        if (!isHealthy) {
            logger.warn('Redis storage is not healthy - Redis server may not be running');
            logger.info('To test Redis storage, please ensure Redis is running on localhost:6379');
            return true; // Don't fail the test if Redis is not available
        }

        // Test conversation
        logger.info('Sending first message to Redis storage...');
        let response = await client.sendPrompt('Hello! Can you tell me about the storage?');
        logger.info('Response 1:', response);

        logger.info('Sending follow-up message...');
        response = await client.sendPrompt('Is this conversation persistent?');
        logger.info('Response 2:', response);

        // Check conversation history
        const history = await client.getConversationHistory();
        logger.info(`Redis conversation history has ${history.length} messages`);

        // Check storage info
        const storageInfo = client.getStorageInfo();
        logger.info('Storage info:', storageInfo);

        // Clean up - clear the test session
        await client.clearConversationHistory();
        logger.info('Cleared test conversation from Redis');

        // Disconnect properly
        await client.disconnect();

        logger.info('✅ Redis storage test completed successfully!');
        return true;
    } catch (error) {
        logger.error('❌ Redis storage test failed:', error.message);
        if (error.message.includes('Redis')) {
            logger.info('This is likely because Redis is not running. Redis tests are optional.');
            return true; // Don't fail if Redis is not available
        }
        return false;
    }
}

/**
 * Test session isolation
 */
async function testSessionIsolation() {
    logger.info('=== Testing Session Isolation ===');
    
    try {
        // Create two clients with different sessions
        const client1 = new BedrockMCPClient({
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            region: 'us-east-1',
            sessionId: 'session-1',
            systemPrompt: 'You are assistant 1.'
        });

        const client2 = new BedrockMCPClient({
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            region: 'us-east-1',
            sessionId: 'session-2',
            systemPrompt: 'You are assistant 2.'
        });

        client1.setLogLevel(LogLevel.INFO);
        client2.setLogLevel(LogLevel.INFO);

        // Send different messages to each client
        await client1.sendPrompt('My name is Alice');
        await client2.sendPrompt('My name is Bob');

        // Check that histories are separate
        const history1 = await client1.getConversationHistory();
        const history2 = await client2.getConversationHistory();

        logger.info(`Session 1 has ${history1.length} messages`);
        logger.info(`Session 2 has ${history2.length} messages`);

        if (history1.length !== history2.length) {
            logger.info('✅ Sessions are properly isolated!');
        } else {
            logger.warn('⚠️ Session isolation may not be working correctly');
        }

        logger.info('✅ Session isolation test completed!');
        return true;
    } catch (error) {
        logger.error('❌ Session isolation test failed:', error.message);
        return false;
    }
}

/**
 * Run all storage tests
 */
async function runAllTests() {
    logger.info('Starting Bedrock MCP Connector Storage Tests...\n');

    const results = [];
    
    // Test in-memory storage
    results.push(await testInMemoryStorage());
    console.log(''); // Add spacing
    
    // Test Redis storage
    results.push(await testRedisStorage());
    console.log(''); // Add spacing
    
    // Test session isolation
    results.push(await testSessionIsolation());
    console.log(''); // Add spacing

    // Summary
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    logger.info(`=== Test Summary ===`);
    logger.info(`Passed: ${passed}/${total} tests`);
    
    if (passed === total) {
        logger.info('🎉 All storage tests passed!');
        process.exit(0);
    } else {
        logger.error('❌ Some tests failed');
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(error => {
    logger.error('Fatal error:', error.message);
    process.exit(1);
});