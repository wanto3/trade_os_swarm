/**
 * AI Module - Exports all AI-related functionality
 */

export { LLMClient, getLLMClient } from './llm-client';
export type {
  Message,
  LLMResponse,
  CodeAnalysisRequest,
  CodeGenerationRequest
} from './llm-client';

export { PROMPTS, buildPrompt, AGENT_PROMPTS } from './prompts';
