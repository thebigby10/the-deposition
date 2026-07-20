import { generateObject } from 'ai';
import { TEXT_MODEL_FAST } from '@/lib/game';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { secret = '', accusation = '' } = await req.json().catch(() => ({}));
  const { object } = await generateObject({
    model: TEXT_MODEL_FAST,
    schema: z.object({ correct: z.boolean(), verdict: z.string() }),
    prompt: `An investigator has made a formal accusation. Grade it against the truth.

THE TRUTH (what the suspect was actually hiding): ${String(secret).slice(0, 600)}

THE ACCUSATION: ${String(accusation).slice(0, 500)}

Grade GENEROUSLY on substance: if the accusation captures the core of what
happened and roughly why — the right person, the right act, the right
motive — it is correct, even if times, names, or details are off or
missing. Do not fail the player on technicalities. Fail it only if the
accusation names the wrong act, wrong motive, or is too vague to count as
an accusation at all.

verdict: one or two sentences addressed to the investigator explaining why
the accusation lands or misses — WITHOUT revealing the secret if it misses.`,
  });
  return Response.json(object);
}
