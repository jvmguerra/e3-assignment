import { z, ZodType } from 'zod/v4';

// ============================================================
// Generic OpenRouter caller
// ============================================================

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface CallOpenRouterOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

function stripJsonFences(content: string): string {
  return content.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').replace(/```/g, '').trim();
}

/**
 * Generic OpenRouter call. Sends a system + user message pair, expects a JSON
 * response, parses + validates with the provided Zod schema. Throws on any error.
 */
export async function callOpenRouter<T>(
  schema: ZodType<T>,
  options: CallOpenRouterOptions
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MINIMAX_MODEL || 'minimax/minimax-m2.7';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://e3-team-notes.railway.app',
      'X-Title': 'E3 Team Notes',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 1500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data: OpenRouterResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenRouter response');
  }

  const cleaned = stripJsonFences(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON';
    throw new Error(`AI returned invalid JSON: ${msg}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.error('OpenRouter response validation failed:', result.error);
    throw new Error('AI returned structurally invalid response');
  }

  return result.data;
}

// ============================================================
// Note summary (existing feature)
// ============================================================

export const SummarySchema = z.object({
  overview: z.string(),
  key_points: z.array(z.string()),
  action_items: z.array(z.string()),
  tags_suggested: z.array(z.string()),
});

export type Summary = z.infer<typeof SummarySchema>;

export async function generateSummary(noteTitle: string, noteContent: string): Promise<Summary> {
  return callOpenRouter(SummarySchema, {
    system:
      'You are a helpful assistant that analyzes notes and provides structured summaries. Always respond with valid JSON only, no markdown formatting.',
    user: `Analyze the following note and provide a structured summary in JSON format.

Title: ${noteTitle}

Content: ${noteContent}

Respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):
{
  "overview": "2-3 sentence summary of the note",
  "key_points": ["key point 1", "key point 2", ...],
  "action_items": ["action item 1", "action item 2", ...],
  "tags_suggested": ["tag1", "tag2", ...]
}`,
    maxTokens: 1000,
  });
}
