import { google } from '@ai-sdk/google';
import { z } from 'zod';

// ponytail: flash-lite, not gemini-3.5-flash — 3.5-flash free tier is 20 req/day/model,
// one game (1 case + up to 12 turns) burns most of it, then every call 429s and the app
// silently degrades to PRESET_CASE + SHRUG_LINES. flash-lite has its own, far larger
// free bucket. Pro models still have 0 free quota on this key. Bump once billing's on.
export const TEXT_MODEL_FAST = google(process.env.TEXT_MODEL_FAST ?? 'gemini-3.1-flash-lite');
export const TEXT_MODEL_PRO = google(process.env.TEXT_MODEL_PRO ?? 'gemini-3.1-flash-lite');

export const EvidenceSchema = z.object({
  item: z.string(),
  detail: z.string(),
});

export const ContradictionSchema = z.object({
  claim: z.string(),
  truth: z.string(),
  evidence_ref: z.string(),
});

export const ScenarioSchema = z.object({
  title: z.string(),
  incident: z.string(),
  your_role: z.string(),
  location: z.string(),
  stakes: z.string(),
  timeline: z.string(),
  evidence: z.array(EvidenceSchema).length(3),
});

export const SuspectSchema = z.object({
  name: z.string(),
  role: z.string(),
  voice: z.string(),
  appearance: z.string(),
  secret: z.string(),
  why_hidden: z.string(),
  contradictions: z.array(ContradictionSchema).length(3),
  breaking_point: z.string(),
  opening_line: z.string(),
});

export const CaseSchema = z.object({
  scenario: ScenarioSchema,
  suspect: SuspectSchema,
});

// ponytail: no min/max on delta — bounds are stated in the prompt and clamped
// server-side; schema bounds would kill a whole turn on a model overshoot
export const TurnSchema = z.object({
  reply: z.string(),
  tell: z.string(),
  suspicion_delta: z.number(),
  new_facts: z.array(z.string()),
  cracked: z.boolean(),
});

export type Case = z.infer<typeof CaseSchema>;
export type Turn = z.infer<typeof TurnSchema>;

export function validateCase(c: Case): boolean {
  if (!c.suspect.secret.trim()) return false;
  if (c.suspect.contradictions.length !== 3) return false;
  const items = c.scenario.evidence.map((e) => e.item.toLowerCase());
  return c.suspect.contradictions.every((con) => {
    const ref = con.evidence_ref.toLowerCase();
    return items.some((i) => i.includes(ref) || ref.includes(i));
  });
}

export const PRESET_CASE: Case = {
  scenario: {
    title: 'The Dark at Point Alder',
    incident:
      'At 11:52pm on March 3rd, the Point Alder lighthouse went dark for eleven minutes. The freighter Cormorant, running the channel, struck the shoals. Two crew are missing.',
    your_role:
      'Maritime insurance investigator. You have one interview before the inquiry closes the case as mechanical failure.',
    location: "The keeper's cottage, Point Alder.",
    stakes:
      "The inquiry rules tomorrow morning. If 'mechanical failure' stands, the file closes forever and the missing crew's families get nothing.",
    timeline:
      "11:40pm — keeper logs 'all systems normal'. 11:52pm — light goes dark. 12:03am — light returns. 12:07am — Cormorant strikes the shoals. 12:30am — keeper radios the coast guard.",
    evidence: [
      {
        item: 'Lighthouse log',
        detail:
          "The 11pm–midnight page is written in unusually neat, unbroken handwriting; every other page in the book has smudges and corrections. Final entry: 'Lamp fault, self-resolved.'",
      },
      {
        item: 'Coast guard radio transcript',
        detail:
          "The keeper's 12:30am distress call gives the Cormorant's position on the shoals — a spot not visible from the lamp room, only from the cove-side window of the cottage.",
      },
      {
        item: 'Fuel dock receipt',
        detail:
          "A receipt from Halloway's fuel dock, timed 9:15pm that night, for the fishing boat 'Petrel' — registered to one Danny Voss. Found tucked inside the keeper's log.",
      },
    ],
  },
  suspect: {
    name: 'Marta Voss',
    role: 'Lighthouse keeper, Point Alder Light — thirty-one years',
    voice:
      'Dry, unhurried coastal cadence; answers like someone who has spent thirty years talking to the sea instead of people.',
    appearance:
      "Woman in her early sixties, weathered lined face, grey hair pulled back tight, wool fisherman's sweater, steady pale grey eyes.",
    secret:
      "She switched the lamp off deliberately at 11:52pm for eleven minutes to guide her son Danny's boat, the Petrel, into the dark cove past the patrol — he was running unstamped medicine ashore.",
    why_hidden:
      "Danny is on his last suspended sentence. If the outage is ruled deliberate he is identified within a day, and the wreck of the Cormorant turns it into manslaughter.",
    contradictions: [
      {
        claim:
          'The lamp failed on its own — a fault in the rotation motor. I logged it as it happened.',
        truth:
          'The log page was rewritten after the fact in one clean sitting; the outage was manual.',
        evidence_ref: 'Lighthouse log',
      },
      {
        claim: 'I was in the lamp room the whole night.',
        truth:
          'She was at the cove-side window of the cottage watching for the Petrel when the Cormorant struck.',
        evidence_ref: 'Coast guard radio transcript',
      },
      {
        claim: "I haven't seen Danny in months — he keeps to the mainland.",
        truth:
          'Danny fueled the Petrel at 9:15pm that night, and she was holding his receipt.',
        evidence_ref: 'Fuel dock receipt',
      },
    ],
    breaking_point:
      "Being confronted with Danny by name together with the 9:15pm Petrel fuel receipt — proof he was on the water that night.",
    opening_line:
      "You've come a long way for a burned-out motor, inspector. Ask what you came to ask.",
  },
};

// self-check: preset must satisfy its own schema + validator
CaseSchema.parse(PRESET_CASE);
if (!validateCase(PRESET_CASE)) throw new Error('preset case fails validation');
