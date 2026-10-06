import { z } from "zod";
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type AIResult<T> = {
  data: T;
  inputTokens: number;
  outputTokens: number;
};
export interface AIProvider {
  readonly model: string;
  chat(messages: Message[]): Promise<AIResult<string>>;
  generateStructured<T>(
    messages: Message[],
    schema: z.ZodType<T>,
  ): Promise<AIResult<T>>;
  streamChat(messages: Message[]): AsyncIterable<string>;
  generateCandidate?(
    messages: Message[],
    schema: z.ZodType,
  ): Promise<AIResult<unknown>>;
}
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
