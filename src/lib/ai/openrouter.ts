import { z } from 'zod/v4';

// Zod schema for summary validation
export const SummarySchema = z.object({
  overview: z.string(),
  key_points: z.array(z.string()),
  action_items: z.array(z.string()),
  tags_suggested: z.array(z.string()),
});

export type Summary = z.infer<typeof SummarySchema>;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function generateSummary(noteTitle: string, noteContent: string): Promise<Summary> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MINIMAX_MODEL || 'minimax/minimax-m2.7';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const prompt = `Analyze the following note and provide a structured summary in JSON format.

Title: ${noteTitle}

Content: ${noteContent}

Respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):
{
  "overview": "2-3 sentence summary of the note",
  "key_points": ["key point 1", "key point 2", ...],
  "action_items": ["action item 1", "action item 2", ...],
  "tags_suggested": ["tag1", "tag2", ...]
}`;

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
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes notes and provides structured summaries. Always respond with valid JSON only, no markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
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

  // Clean potential markdown code fences
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Parse and validate with Zod
  const parsed = JSON.parse(cleaned);
  const result = SummarySchema.safeParse(parsed);

  if (!result.success) {
    console.error('Summary validation failed:', result.error);
    throw new Error('AI returned invalid summary structure');
  }

  return result.data;
}
