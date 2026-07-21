import { generateText } from 'ai';
import { TEXT_MODEL_FAST } from '@/lib/game';

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const premise = String(body.description ?? '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 200)
    .trim();
  if (!premise) return Response.json({ error: 'bad request' }, { status: 400 });

  const { text } = await generateText({
    model: TEXT_MODEL_FAST,
    prompt: `Rewrite this premise for an interrogation game into ONE vivid, specific
sentence: a suspect or incident with a concrete hook — a place, a time,
an object, a relationship. Keep the user's core idea; sharpen it, don't
replace it. No real living people. Maximum 200 characters.
Return only the rewritten premise. No quotes, no preamble.

PREMISE: ${premise}`,
  });
  return Response.json({ description: text.trim().replace(/^"|"$/g, '').slice(0, 200) });
}
