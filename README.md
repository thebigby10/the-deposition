# THE DEPOSITION

**A single-suspect interrogation game. Gemini plays a character who is actively concealing one specific fact — and defends it under pressure.**

You get a case file, three pieces of evidence, and twelve questions. The suspect has a hidden secret, a motive for hiding it, three discoverable contradictions, and a breaking point. Find the seam, press it with evidence, and they crack. Push blind and they lawyer up.

Every case — incident, evidence, suspect, secret, and the suspect's portrait — is generated at runtime from a one-line description. The AI is not decorating the game; it *is* the game.

## What to click (30 seconds)

1. Pick the preset case **The Dark at Point Alder**, or type a one-line premise and hit **Generate Case**.
2. On the dossier screen, click **"peek at what the engine committed to"** — the secret and three contradictions were generated *before* play started and are held for the whole session.
3. Click an evidence item to cite it in your question. Watch the suspicion meter — and the portrait — react.
4. **Make Accusation** at any point: right and you win early, wrong is +30 suspicion.

## Setup

```bash
npm install
cp .env.example .env.local   # add your AI_GATEWAY_API_KEY (Vercel AI Gateway)
npm run dev
```

One `AI_GATEWAY_API_KEY` covers both text and image models. Model IDs are overridable via `TEXT_MODEL_FAST` / `TEXT_MODEL_PRO` / `IMAGE_MODEL` env vars — verify the text IDs against your gateway's model list before trusting the defaults in `lib/game.ts`.

Without a key the game still runs: case generation falls back to the authored preset case and the portrait falls back to a silhouette (all Pixi effects still run on it).

## Design decision: one image, procedural emotion

Runtime image generation costs 5–15s per image and can't hold character consistency across calls — a suspect whose face changes between turns destroys the illusion. So the game generates **one neutral portrait per case** (hidden behind the dossier animation) and PixiJS drives all the reactivity from a single suspicion value: breathing rate, colour grade, vignette tightening, tremor, lean, displacement instability, and a red impact pulse on hard accusations. See `components/Portrait.tsx` — every effect derives from one eased scalar.

## The interesting part of the repo

The two prompts:

- **Case generator** — `app/api/generate-case/route.ts`. Hard constraints: a secret that is one concrete action with a time and place, a motive with a cost, exactly three independently discoverable contradictions each anchored to an evidence item that *hints* without giving it away, and a specific breaking point.
- **Play loop** — `app/api/turn/route.ts`. The suspect never volunteers the secret, behaves per suspicion band (cooperative / guarded / hostile), scores each question's suspicion delta, extracts new facts, and sets `cracked: true` only when the question reaches the breaking point. The secret is stated twice — top and bottom — to prevent turn-six drift.

## Endings

| Ending | Trigger |
|---|---|
| Commendation | correct accusation before they break |
| Case Closed | you reach the breaking point; confession |
| Inconclusive | twelve questions spent |
| Dismissed | suspicion hits 100 (lawyered up) or your accusation missed badly |

## Stack

Next.js (App Router) · TypeScript · Tailwind · Vercel AI SDK (`generateObject` + `generateImage` via AI Gateway) · PixiJS v8 (client-only)
