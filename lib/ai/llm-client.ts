/**
 * LLM Client - Anthropic API integration for code analysis and generation
 * Handles streaming, retries, and error handling
 */

import Anthropic from '@anthropic-ai/sdk';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface CodeAnalysisRequest {
  code: string;
  filePath: string;
  context?: string;
}

export interface CodeGenerationRequest {
  prompt: string;
  currentCode?: string;
  filePath?: string;
  context?: string[];
}

export class LLMClient {
  private client: Anthropic;
  private maxRetries = 3;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set - LLM features will be limited');
    }
    this.client = new Anthropic({
      apiKey: apiKey || 'dummy-key',
    });
  }

  private isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Generate a completion with retry logic
   */
  async generate(
    messages: Message[],
    system: string = '',
    maxTokens: number = 4096
  ): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          system,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        });

        const content = response.content
          .filter(block => block.type === 'text')
          .map(block => 'text' in block ? block.text : '')
          .join('\n');

        return {
          content,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
          }
        };
      } catch (error: any) {
        const isRetryable = error.status?.toString().startsWith('5') ||
                            error.error?.type === 'rate_limit_error' ||
                            error.message?.includes('timeout');

        if (isRetryable && attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`🔄 LLM retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Stream a completion for real-time feedback
   */
  async *stream(
    messages: Message[],
    system: string = '',
    maxTokens: number = 4096
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    try {
      const stream = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        system,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    }
  }

  /**
   * Analyze code for improvements
   */
  async analyzeCode(request: CodeAnalysisRequest): Promise<string> {
    const system = `You are an expert code analyst specializing in TypeScript, React, and Next.js applications.
Your task is to identify:
1. Bugs and potential errors
2. Performance issues
3. Missing features or incomplete implementations
4. UX improvements
5. Type safety issues
6. TODO/FIXME comments that need attention
7. Missing error handling

Respond in JSON format:
{
  "issues": [
    {
      "type": "bug|performance|feature|ux|type|todo|error_handling",
      "severity": "critical|high|medium|low",
      "title": "Brief description",
      "description": "Detailed explanation",
      "line": 0,
      "suggestedFix": "How to fix it"
    }
  ],
  "summary": "Overall assessment"
}`;

    const messages: Message[] = [
      {
        role: 'user',
        content: `Analyze this file: ${request.filePath}

${request.context ? `Context: ${request.context}\n` : ''}

\`\`\`typescript
${request.code}
\`\`\`

Provide actionable improvement suggestions.`
      }
    ];

    const response = await this.generate(messages, system);
    return response.content;
  }

  /**
   * Generate code improvements
   */
  async generateImprovement(request: CodeGenerationRequest): Promise<string> {
    const system = `You are an expert developer specializing in TypeScript, React, and Next.js.
When asked to improve or generate code:

1. Maintain existing code style and patterns
2. Add proper TypeScript types
3. Include error handling where needed
4. Add helpful comments for complex logic
5. Ensure accessibility (ARIA labels, keyboard navigation)
6. Optimize for performance

Return ONLY the complete code block, no explanations outside the code.
Wrap code in \`\`\`typescript ... \`\`\` markers.`;

    let prompt = request.prompt;
    if (request.currentCode) {
      prompt = `${prompt}

Current code:
\`\`\`typescript
${request.currentCode}
\`\`\`
`;
    }
    if (request.context) {
      prompt = `\nContext:\n${request.context.join('\n')}\n\n${prompt}`;
    }

    const messages: Message[] = [
      { role: 'user', content: prompt }
    ];

    const response = await this.generate(messages, system);
    return response.content;
  }

  /**
   * Generate a trading insight or recommendation
   */
  async generateTradingInsight(marketData: any, context: string[]): Promise<string> {
    const system = `You are an expert cryptocurrency trading analyst.
Analyze market data and provide actionable insights.

Focus on:
1. Trend identification (bullish/bearish/sideways)
2. Key support/resistance levels
3. Risk/reward ratios
4. Potential catalysts
5. Recommended stop-loss and take-profit levels

Be concise but thorough. Format with markdown.`;

    const messages: Message[] = [
      {
        role: 'user',
        content: `Market Data:
${JSON.stringify(marketData, null, 2)}

Context:
${context.join('\n')}

Provide trading analysis and recommendations.`
      }
    ];

    const response = await this.generate(messages, system, 2048);
    return response.content;
  }

  /**
   * Generate a research report on a trading topic
   */
  async generateResearchReport(topic: string, sources: string[] = []): Promise<string> {
    const system = `You are a cryptocurrency market researcher.
Create comprehensive, well-structured research reports.

Include:
1. Executive summary
2. Key findings
3. Data analysis
4. Actionable recommendations
5. Risk factors

Use markdown formatting with headers, bullet points, and tables where appropriate.`;

    let prompt = `Research topic: ${topic}`;
    if (sources.length > 0) {
      prompt += `\n\nSources to consider:\n${sources.join('\n')}`;
    }

    const messages: Message[] = [
      { role: 'user', content: prompt }
    ];

    const response = await this.generate(messages, system, 6144);
    return response.content;
  }

  /**
   * Generate test code for a component
   */
  async generateTests(componentCode: string, filePath: string): Promise<string> {
    const system = `You are a testing expert specializing in Vitest and React testing.
Generate comprehensive tests that cover:
1. Component rendering
2. User interactions
3. Edge cases
4. Error states
5. Accessibility

Use Vitest and @testing-library/react conventions.`;

    const messages: Message[] = [
      {
        role: 'user',
        content: `Generate tests for:\n${filePath}

\`\`\`typescript
${componentCode}
\`\`\`

Return the complete test file.`
      }
    ];

    const response = await this.generate(messages, system);
    return response.content;
  }
}

// Singleton
let llmInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!llmInstance) {
    llmInstance = new LLMClient();
  }
  return llmInstance;
}
