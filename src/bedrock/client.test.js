import { describe, it, expect } from 'vitest';
import { endpoint, converse } from './client.js';

describe('bedrock client', () => {
  it('builds the correct endpoint URL', () => {
    expect(endpoint({ region: 'us-west-2', modelId: 'us.anthropic.claude-sonnet-4-6' }))
      .toBe('https://bedrock-runtime.us-west-2.amazonaws.com/model/us.anthropic.claude-sonnet-4-6/converse');
  });

  it('throws when BEDROCK_API_KEY is missing', async () => {
    await expect(converse({ messages: [], apiKey: undefined }))
      .rejects.toThrow('BEDROCK_API_KEY is not set');
  });

  it('connects to Bedrock and gets a valid response', { timeout: 20000 }, async () => {
    const apiKey = process.env.BEDROCK_API_KEY;
    if (!apiKey) {
      console.warn('Skipping live test: BEDROCK_API_KEY not set');
      return;
    }

    const result = await converse({
      messages: [{ role: 'user', content: [{ text: 'Reply with only the word "pong".' }] }],
      inferenceConfig: { maxTokens: 16 },
    });

    expect(result).toHaveProperty('output.message');
    expect(result.output.message.role).toBe('assistant');
    const text = result.output.message.content
      .filter((b) => b.text)
      .map((b) => b.text)
      .join('');
    expect(text.toLowerCase()).toContain('pong');
  });
});
