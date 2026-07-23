import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

// ponytail: flash-lite, not gemini-3.5-flash — 3.5-flash free tier is 20 req/day/model,
// one game (1 case + up to 12 turns) burns most of it, then every call 429s and the app
// silently degrades to PRESET_CASE + SHRUG_LINES. flash-lite has its own, far larger
// free bucket. Pro models still have 0 free quota on this key. Bump once billing's on.
const FAST_ID = process.env.TEXT_MODEL_FAST ?? 'gemini-3.1-flash-lite';
const PRO_ID = process.env.TEXT_MODEL_PRO ?? 'gemini-3.1-flash-lite';
export const TEXT_MODEL_FAST = google(FAST_ID);
export const TEXT_MODEL_PRO = google(PRO_ID);

// A player can bring their own Gemini key to dodge the shared free-tier quota.
// Given one, build a provider bound to it; otherwise use the server's default.
export function pickModel(apiKey?: string, pro = false) {
  const id = pro ? PRO_ID : FAST_ID;
  if (apiKey && apiKey.trim()) return createGoogleGenerativeAI({ apiKey: apiKey.trim() })(id);
  return pro ? TEXT_MODEL_PRO : TEXT_MODEL_FAST;
}

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

// Five difficulty levels. Each one changes the generated story, the suspect's
// behaviour under questioning, the accusation grading, and the table rules.
export const DIFFICULTIES = [
  {
    name: 'Beat Cop',
    tagline: 'A nervous suspect, a paper-thin alibi. Fourteen questions.',
    questions: 14,
    wrongAccusePenalty: 15,
    showTells: true,
    showSuspicionNumber: true,
    deltaMin: -15,
    deltaMax: 20,
    casePrompt:
      'DIFFICULTY — EASY. The suspect is an amateur under pressure. Evidence details may come close to stating the contradiction outright. One simple story thread, a plain motive. The timeline is loose — it spans hours with one OBVIOUS unexplained gap, and the secret sits squarely in that gap. Evidence items carry plain times and dates that point at the gap directly. breaking_point may be broad — any firm confrontation with the right evidence.',
    turnPrompt:
      'YOUR DISCIPLINE AS A LIAR: poor. You over-explain, contradict yourself when nervous, and let small damaging truths slip when a question surprises you. If the investigator presses the same contradiction twice with its evidence, treat that as reaching your breaking point. Your tells are obvious — trembling hands, broken eye contact.',
    accusePrompt:
      'Grade VERY generously: if the accusation points at roughly the right act or the right motive, even half-formed, it is correct.',
  },
  {
    name: 'Gumshoe',
    tagline: 'They rehearsed a story — but nerves show at the seams. Twelve questions.',
    questions: 12,
    wrongAccusePenalty: 20,
    showTells: true,
    showSuspicionNumber: true,
    deltaMin: -15,
    deltaMax: 25,
    casePrompt:
      'DIFFICULTY — LIGHT. The suspect prepared a cover story but is not a practiced liar. Evidence hints clearly at each contradiction without stating it. A straightforward story with one small wrinkle. The timeline is simple with a visible gap where the secret sits; evidence times line up with the gap without much cross-referencing.',
    turnPrompt:
      'YOUR DISCIPLINE AS A LIAR: adequate but nervous. Your cover story holds under casual questioning, but direct evidence makes you stumble — you hedge, revise details, and your tells are readable.',
    accusePrompt:
      'Grade generously: the right act and roughly the right motive is correct, even with details wrong or missing.',
  },
  {
    name: 'Inspector',
    tagline: 'A practiced liar, oblique evidence, one false lead. Ten questions.',
    questions: 10,
    wrongAccusePenalty: 30,
    showTells: true,
    showSuspicionNumber: true,
    deltaMin: -10,
    deltaMax: 30,
    casePrompt:
      'DIFFICULTY — HARD. The suspect is a disciplined, practiced liar. Evidence must be oblique — each item requires an inference to connect to its contradiction. The timeline is tight and minute-level: the suspect looks accounted for except one NARROW window, and the secret fits inside it. Evidence timestamps only incriminate when checked against the timeline. Include exactly one detail in the evidence or timeline that LOOKS incriminating but has an innocent explanation (a red herring). breaking_point must be narrow and exact.',
    turnPrompt:
      'YOUR DISCIPLINE AS A LIAR: excellent. You answer only what is asked, concede nothing without proof, and calmly offer innocent explanations for incriminating details. Only your exact breaking point cracks you — pressure, repetition, and partial evidence never do. Your tells are faint and ambiguous, easy to misread.',
    accusePrompt:
      'Grade on substance but require both the right act AND the right motive; one without the other misses.',
  },
  {
    name: 'Hardboiled',
    tagline: 'Evidence that only speaks in pairs — and a false confession waiting. Eight questions.',
    questions: 8,
    wrongAccusePenalty: 40,
    showTells: true,
    showSuspicionNumber: true,
    deltaMin: -5,
    deltaMax: 35,
    casePrompt:
      'DIFFICULTY — VERY HARD. The suspect is a hardened, disciplined liar. Evidence must be highly oblique — each item meaningful only when combined with another. The timeline is dense and minute-by-minute, and on first read it fully accounts for the suspect; the true window only appears when two evidence timestamps are cross-referenced against it. Include one red herring that LOOKS incriminating but has an innocent explanation, and make the incident plausibly support a SECOND, wrong theory of what happened. breaking_point must be narrow and exact — a specific name plus a specific piece of evidence.',
    turnPrompt:
      'YOUR DISCIPLINE AS A LIAR: exceptional. You answer only what is asked and give misleading but technically true answers. If cornered, "reluctantly" confess to a smaller embarrassing decoy — something plausible within the incident that is NOT your secret — to make the investigator believe they have won. Only your exact breaking point cracks you. Your tells are faint, and sometimes deliberately performed to mislead.',
    accusePrompt:
      'Grade strictly: require the right act, the right motive, and roughly how it was done. A decoy or partial theory misses.',
  },
  {
    name: 'Cold Case',
    tagline: 'They have told this lie for years and believe it. Six questions. No tells. No meter.',
    questions: 6,
    wrongAccusePenalty: 50,
    showTells: false,
    showSuspicionNumber: false,
    deltaMin: -5,
    deltaMax: 40,
    casePrompt:
      'DIFFICULTY — BRUTAL. The suspect has lived inside this lie so long it feels true. Evidence must be highly oblique — meaningful only when two items are combined against the timeline. The timeline must read as AIRTIGHT: minute-by-minute, the suspect apparently accounted for the entire incident, with the real window hidden inside an entry that sounds innocent. It must also contain one innocent-looking inconsistency that leads nowhere, and the incident must strongly support a SECOND, wrong theory of what happened that the evidence superficially favors. breaking_point must be a single precise combination of a name and a piece of evidence.',
    turnPrompt:
      'YOUR DISCIPLINE AS A LIAR: total. You have rehearsed this interview in your head for years. Give misleading but technically true answers, and actively steer the investigator toward a wrong theory of the incident. If cornered, "reluctantly" confess to a smaller embarrassing decoy that is NOT your secret. Only your exact breaking point, stated precisely with its evidence, cracks you — never accusation, sympathy, or persistence. You have no visible tells; describe composure only. Sympathetic questions barely lower suspicion; you distrust warmth.',
    accusePrompt:
      'Grade strictly: the accusation must name the right act, the right motive, and how it was done. Anything less — a decoy, a partial theory, the wrong mechanism — misses.',
  },
] as const;

export const DifficultySchema = z.number().int().min(0).max(4).catch(1);

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
