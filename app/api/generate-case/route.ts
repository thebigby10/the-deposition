import { generateObject } from 'ai';
import { CaseSchema, PRESET_CASE, pickModel, validateCase } from '@/lib/game';

export const maxDuration = 60;

const CASE_PROMPT = `You generate playable interrogation cases. Return one JSON object.

The player is an investigator with ONE interview and twelve questions.
The suspect is concealing something specific. Build a case that is solvable
by a careful player and unsolvable by a careless one.

HARD CONSTRAINTS:

1. The secret must be a SINGLE CONCRETE ACTION with a time and a place.
   Good: "She switched off the lamp for eleven minutes at 11:52pm to signal
   her son's boat into the cove."
   Bad: "She was involved in the smuggling operation."
   A vague secret cannot be defended consistently and ruins the game.

2. why_hidden must be a genuine motive with a cost — someone the suspect
   protects, something they lose. This is the reason they keep lying when
   pressed. Without it the model confesses on turn two.

3. Exactly THREE contradictions. Each must be independently discoverable —
   no chains where the second only makes sense after the first.

4. Each contradiction's evidence_ref must EXACTLY equal the "item" name of
   one evidence item, and NO evidence item may state a contradiction
   outright. Evidence hints; the player closes the gap. An evidence item
   that gives away the answer is a failed case.

5. State the timeline ONCE, explicitly, in scenario.timeline. The secret
   must sit inside it. All times must agree.

6. breaking_point must be specific enough that reaching it feels earned —
   a name, an object, a time. Not "when the player is persistent".

7. voice: ONE sentence. appearance: physical description only, no emotion,
   no backstory — it feeds an image generator.

Tone: grounded procedural drama. No supernatural elements. No confessions
in the opening_line. All characters are fictional; if the premise names a
real living person, invent a fictional character instead.

USER PREMISE: {description}

If the premise describes a person, build the incident around them.
If it describes an incident, build the person who did it.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // ponytail: strip newlines + cap length blunts prompt injection into the generator
  const premise = String(body.description ?? '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 200);
  const prompt = CASE_PROMPT.replace('{description}', premise || 'an interrogation worth playing');
  const model = pickModel(body.apiKey, true);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model,
        schema: CaseSchema,
        prompt,
      });
      if (validateCase(object)) return Response.json(object);
    } catch {
      // retry once, then fall through to the cached case
    }
  }
  return Response.json(PRESET_CASE);
}
