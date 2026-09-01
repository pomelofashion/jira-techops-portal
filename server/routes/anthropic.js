// server/routes/anthropic.js
// Anthropic-backed AI routes (document extraction, chat assistant, ticket
// triage), mounted at /api/v1. The API key never leaves this process.

import { Router } from 'express';
import { z } from 'zod';
import { log } from '../lib/log.js';

const router = Router();

const messageContentSchema = z.union([z.string(), z.array(z.object({}).passthrough())]);

const extractContentSchema = z
  .object({
    model: z.string().min(1).max(200),
    max_tokens: z.number().int().positive().max(200000),
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: messageContentSchema,
          })
          .strict()
      )
      .min(1),
    system: z.union([z.string(), z.array(z.object({}).passthrough())]).optional(),
    temperature: z.number().min(0).max(1).optional(),
    betas: z.array(z.string().min(1).max(100)).max(10).optional(),
  })
  .strict();

// ─── POST /api/extract-content ────────────────────────────────────────────────
// Accepts { model, max_tokens, messages, betas? } and forwards to Anthropic.
// The optional `betas` array becomes the anthropic-beta header (stripped from body).
router.post('/extract-content', async (req, res, next) => {
  const parsed = extractContentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid extraction payload.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Anthropic API key is not configured on the server.' });
  }

  try {
    const { betas, ...anthropicBody } = parsed.data;

    const anthropicHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (Array.isArray(betas) && betas.length > 0) {
      anthropicHeaders['anthropic-beta'] = betas.join(',');
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders,
      body: JSON.stringify(anthropicBody),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      log('error', 'Anthropic upstream error', { status: upstream.status, err });
      return res.status(upstream.status).json({ error: 'Failed to extract content.' });
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

const triageSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().min(1).max(8000),
    currentResult: z.string().max(4000).optional(),
    expectedResult: z.string().max(4000).optional(),
    docs: z
      .array(
        z
          .object({
            title: z.string().max(200),
            description: z.string().max(500),
            category: z.string().max(80),
          })
          .strict()
      )
      .max(100)
      .optional(),
  })
  .strict();

router.post('/triage', async (req, res, next) => {
  const parsed = triageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid triage payload.' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI triage is not configured on the server.' });

  const { title, description, currentResult, expectedResult, docs } = parsed.data;
  const docCatalog = (docs || [])
    .map(d => `- ${d.title} (${d.category}): ${d.description}`)
    .join('\n');

  const systemPrompt = `You are an IT triage assistant for an internal TechOps portal. Given a ticket draft, return strict JSON only — no preamble, no markdown fences.

Schema:
{
  "priority": "Critical" | "High" | "Medium" | "Low",
  "reasoning": string (1-2 sentences explaining the priority),
  "suggestedDocs": string[] (zero to three exact doc TITLES from the catalog that likely solve the user's problem),
  "confidence": "low" | "medium" | "high"
}

Priority guidance:
- Critical: prod outage, security incident, > 50% of users blocked.
- High: significant blocker for one team or critical user.
- Medium: non-blocking but real impact.
- Low: minor inconvenience, cosmetic, or single user with workaround.

Docs catalog (only suggest titles from this list, exact match):
${docCatalog || '(no docs available)'}`;

  const userPrompt = `Title: ${title}
Description: ${description}${currentResult ? `\nCurrent result: ${currentResult}` : ''}${expectedResult ? `\nExpected result: ${expectedResult}` : ''}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      log('error', 'Triage upstream error', { status: upstream.status, err });
      return res.status(upstream.status).json({ error: 'Triage request failed.' });
    }
    const data = await upstream.json();
    const text = ((data.content || []).find(b => b.type === 'text')?.text || '').trim();
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    let parsedBody;
    try {
      parsedBody = JSON.parse(jsonText);
    } catch {
      log('warn', 'Triage JSON parse failed', { sample: text.slice(0, 200) });
      return res.status(502).json({ error: 'Triage response could not be parsed.' });
    }
    const priority = ['Critical', 'High', 'Medium', 'Low'].includes(parsedBody.priority)
      ? parsedBody.priority
      : 'Medium';
    const suggestedDocs = Array.isArray(parsedBody.suggestedDocs)
      ? parsedBody.suggestedDocs.slice(0, 3).filter(s => typeof s === 'string')
      : [];
    return res.json({
      priority,
      reasoning: typeof parsedBody.reasoning === 'string' ? parsedBody.reasoning.slice(0, 600) : '',
      suggestedDocs,
      confidence: ['low', 'medium', 'high'].includes(parsedBody.confidence)
        ? parsedBody.confidence
        : 'medium',
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
