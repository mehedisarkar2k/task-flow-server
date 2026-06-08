import { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import { env } from '../../config/env';
import { buildSystemPrompt } from './assistant.guard';
import { executeTool, getToolDefs, type AssistantUser } from './assistant.tools';

const client = new AzureOpenAI({
  apiKey: env.AZURE_OPENAI_API_KEY,
  endpoint: env.AZURE_OPENAI_ENDPOINT,
  apiVersion: env.AZURE_OPENAI_API_VERSION,
});

// Prefer the cheaper/faster mini deployment for tool-use; fall back to the main one.
const MODEL = env.AZURE_OPENAI_MINI_MODEL ?? env.AZURE_OPENAI_MODEL;

/** Max LLM <-> tool round-trips before we give up (prevents infinite loops). */
const MAX_TOOL_ROUNDS = 5;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunAssistantInput {
  user: AssistantUser | null;
  message: string;
  history?: ChatTurn[];
}

/**
 * Runs one assistant turn: feeds the message + history to Azure OpenAI, executes
 * any role-scoped tools it asks for, and returns the final natural-language reply.
 */
export const runAssistant = async ({
  user,
  message,
  history = [],
}: RunAssistantInput): Promise<{ reply: string }> => {
  const tools = getToolDefs(user);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(user) },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    messages.push(choice);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { reply: choice.content ?? '' };
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;

      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      let result: unknown;
      try {
        result = await executeTool(call.function.name, user, args);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Tool execution failed.' };
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { reply: "Sorry, I couldn't complete that request. Please try rephrasing." };
};
