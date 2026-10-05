import { OpenAICompatibleProvider } from "./openai-compatible";
import { MockAIProvider } from "./mock";
export const isMockAI = () => process.env.AI_PROVIDER === "mock";
export const isAIConfigured = () =>
  Boolean(process.env.AI_BASE_URL?.trim() && process.env.AI_API_KEY?.trim());
export function getAIProvider() {
  return isMockAI() ? new MockAIProvider() : new OpenAICompatibleProvider();
}
