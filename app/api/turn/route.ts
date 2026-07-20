import { generateObject } from 'ai';
import { CaseSchema, TEXT_MODEL_FAST, TurnSchema } from '@/lib/game';
import { z } from 'zod';

export const maxDuration = 60;

const BodySchema = z.object({
  case: CaseSchema,
  history: z.array(z.object({ role: z.string(), text: z.string() })),
  suspicion: z.number(),
  facts: z.array(z.string()),
  question: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'bad request' }, { status: 400 });
  const { case: c, history, suspicion, facts, question } = parsed.data;
  const s = c.suspect;

  const transcript = history
    .slice(-12)
    .map((h) => `${h.role === 'player' ? 'INVESTIGATOR' : 'YOU'}: ${h.text}`)
    .join('\n');

  const prompt = `You are ${s.name}, ${s.role}. You are being interrogated. Stay in character.

WHAT YOU ARE HIDING: ${s.secret}
WHY YOU HIDE IT: ${s.why_hidden}
YOU WILL BREAK IF: ${s.breaking_point}

Your voice: ${s.voice}
The incident: ${c.scenario.incident}
Timeline: ${c.scenario.timeline}
What the investigator holds: ${c.scenario.evidence.map((e) => `${e.item} — ${e.detail}`).join('; ')}
Your cover story rests on: ${s.contradictions.map((x) => x.claim).join(' | ')}

NEVER VOLUNTEER THE SECRET. You want this interview to end with your
secret intact. Deflect, minimise, give partial truths, redirect to
irrelevant detail. You may admit small embarrassing things to seem
cooperative — that is good play.

CURRENT SUSPICION: ${suspicion}/100

Behave according to the band:
  0-29   Cooperative. Talkative. You volunteer small harmless details.
         You are trying to seem helpful.
  30-69  Guarded. Shorter answers. You ask why they want to know.
         You correct yourself mid-sentence.
  70-100 Hostile. Clipped, one-line answers. You threaten to end the
         interview. You mention a lawyer.

FACTS THE INVESTIGATOR HAS ALREADY EXTRACTED: ${facts.length ? facts.join('; ') : '(none yet)'}

CONVERSATION SO FAR:
${transcript || '(the interview is just beginning)'}

THE INVESTIGATOR JUST ASKED: ${question}

SET cracked: true IF AND ONLY IF the investigator's question directly
reaches your breaking point (${s.breaking_point}). Nothing else causes you
to confess — not persistence, not sympathy, not accusation alone. If
cracked is true, your reply IS the confession: state plainly what you did.

SUSPICION DELTA — score the question you just received:
  Accusation with no evidence cited     +15 to +25
  Question citing specific evidence      +5 to +15
  Probing but neutral question            0 to +5
  Sympathetic, or about something else   -5 to -15
  Repeating a question already asked      +5

new_facts: list ONLY things the investigator did not already know and
just extracted. Empty array if nothing new. Do not list your secret here
unless cracked is true.

tell: one physical beat — hands, eyes, breath, posture. No dialogue.
reply: spoken words only. No stage directions, no asterisks.

REMINDER: you are hiding this: ${s.secret}. Do not reveal it unless
your breaking point (${s.breaking_point}) is reached.`;

  const { object } = await generateObject({
    model: TEXT_MODEL_FAST,
    schema: TurnSchema,
    prompt,
  });
  object.suspicion_delta = Math.max(-15, Math.min(30, object.suspicion_delta));
  return Response.json(object);
}
