import { describe, it, expect } from 'vitest';
import { SummarySchema } from '@/lib/ai/openrouter';

const validSummary = {
  overview: 'This note covers the Q3 planning session.',
  key_points: ['Budget approved', 'Timeline set for Q3'],
  action_items: ['Schedule kickoff meeting', 'Assign leads'],
  tags_suggested: ['planning', 'Q3', 'budget'],
};

describe('SummarySchema', () => {
  it('passes validation for valid summary JSON', () => {
    const result = SummarySchema.safeParse(validSummary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overview).toBe(validSummary.overview);
      expect(result.data.key_points).toEqual(validSummary.key_points);
      expect(result.data.action_items).toEqual(validSummary.action_items);
      expect(result.data.tags_suggested).toEqual(validSummary.tags_suggested);
    }
  });

  it('fails validation when required fields are missing', () => {
    const missing = { overview: 'Some overview' };
    const result = SummarySchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it('fails validation when array fields are wrong type', () => {
    const wrongTypes = {
      ...validSummary,
      key_points: 'not an array',
    };
    const result = SummarySchema.safeParse(wrongTypes);
    expect(result.success).toBe(false);
  });

  it('fails validation for completely empty object', () => {
    const result = SummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('markdown code fence cleaning', () => {
  it('removes json code fence and parses valid summary', () => {
    const fenced = '```json\n' + JSON.stringify(validSummary) + '\n```';
    const cleaned = fenced.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const result = SummarySchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('removes plain code fence and parses valid summary', () => {
    const fenced = '```\n' + JSON.stringify(validSummary) + '\n```';
    const cleaned = fenced.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const result = SummarySchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('leaves non-fenced content unchanged', () => {
    const raw = JSON.stringify(validSummary);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    expect(cleaned).toBe(raw);
  });
});
