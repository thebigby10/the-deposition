# The Deposition

*One suspect. One secret. Twelve questions.*

## Description

A fully next-gen narrative game — not a single line of it is a predefined tree. Pick a case from the presets or write your own, and the AI generates a suspect to interrogate. You have the case file, a timeline, and a handful of evidence; your job is to extract the facts and make the suspect confess the truth — without tripping their suspicion, and inside 12 questions. Press what you find, corner them, and get the confession before the questions run out.

## Inspiration

Every detective game I've played has the same flaw: the interrogation is a dialogue tree. The suspect says what the writers wrote, you click the option the designers planned, and the "aha" moment was decided months before you sat down. I wanted the opposite — an interrogation where the suspect is genuinely improvising, genuinely lying, and genuinely breaks when *you* find the seam. LLMs are famously bad at keeping secrets, which is exactly what makes this interesting: can you build a game around a model that desperately wants to confess?

## What it does

You're an investigator with one interview and twelve questions. The suspect — name, face, voice, secret, and all — is generated from a one-line premise you type (or pick from a set of case chips, or punch up with an **Enhance** button that rewrites your rough idea into something sharper).

Every case is built around a strict contract:

- one **concrete secret** — a single action with a time and a place
- a **motive** for hiding it, so the model keeps lying under pressure
- exactly **three contradictions**, each anchored to a piece of evidence you hold
- a specific **breaking point** — the one confrontation that cracks them

You press the evidence, watch a suspicion meter climb through *cooperative → guarded → hostile*, extract facts, and either walk them into their breaking point or stake everything on a formal accusation. Push blind and they lawyer up; run out of questions and the secret walks out the door.

The suspect's portrait is a living thing: a single AI-generated image driven procedurally by Pixi.js. As suspicion rises the portrait breathes faster and deeper, leans away from you, trembles, desaturates, and the vignette closes in. A hard question lands as a red pulse. No sprite sheets, no pre-rendered emotions — every visible state is a pure function of one number, $s \in [0, 100]$, eased each frame:

$$es \leftarrow es + 0.06\left(\frac{s}{100} - es\right)$$

## How we built it

- **Next.js** (App Router) with four small API routes: `generate-case`, `turn`, `accuse`, `enhance`, plus a portrait proxy.
- **Vercel AI SDK + Gemini** with `generateObject` and **Zod schemas** for every LLM call. The case, each turn (`reply`, `tell`, `suspicion_delta`, `new_facts`, `cracked`), and the accusation verdict are all structured output — the model never free-texts game state.
- **A case validator** re-checks every generated case (secret non-empty, exactly three contradictions, each `evidence_ref` resolving to a real evidence item). Invalid case → one retry → a hand-authored fallback case, so the game *always* starts.
- **Game balance in the prompt, enforcement in code.** The model proposes a suspicion delta from a scoring rubric (accusation without evidence +15…+25, citing evidence +5…+15, sympathy −5…−15), but the server clamps it; the client owns the counter, the endings, and the fact log.
- **Pollinations** for keyless portrait generation, fetched server-side and returned as a data URL.
- **Pixi.js** for the reactive portrait: displacement noise, color-matrix grading, procedural breathing, tremor, and impact pulses — all driven off the eased suspicion value.

## Challenges we ran into

**LLMs want to confess.** The first suspects folded on question two. The fix wasn't more "don't reveal the secret" shouting — it was *structure*: a motive with a real cost (someone the suspect protects), an explicit breaking point that is the *only* trigger for confession, and a rule that persistence, sympathy, and evidence-free accusation never crack them. Secrets also had to be a single concrete action; a vague secret can't be defended consistently and the model drifts into accidental admissions.

**Free-tier quota is a game mechanic you didn't design.** Our first model choice allowed 20 requests per day — one playthrough is ~13 calls. The app degraded so gracefully (fallback case, canned deflections) that generation looked "broken" rather than rate-limited. We moved to a model with a far larger free bucket and learned to distrust our own silent fallbacks.

**The portrait that only existed sometimes.** The portrait rendered in the dossier but never on the interrogation screen. Root cause: the image host returns **403 to any request carrying an `Origin` header** — and a canvas texture load (`crossOrigin='anonymous'`) sends one, while a plain `<img>` doesn't. Same URL, two outcomes. Fix: fetch the image server-side and hand the client a data URL the canvas can use untainted.

**Solvable but not spoiled.** Early cases had evidence that stated the contradiction outright — the game played itself. The generation contract now demands evidence that *hints* while the player closes the gap, and the validator plus a fallback keeps a bad generation from ever reaching the table.

## What we learned

- Treat the LLM as an actor, not an author: it improvises inside a structure that code owns. Every number that matters gets clamped server-side.
- Structured output + schema validation + a deterministic fallback turns "the model returned something weird" from a crash into a non-event.
- Silent fallbacks need loud logs. Two of our three worst bugs were invisible *because* our error handling worked.
- One well-driven parameter beats a hundred assets: the entire emotional performance of the suspect is one eased number feeding scale, rotation, jitter, saturation, and vignette.

## What's next

- **Voice** — the suspect already has a written "voice"; give them a spoken one, with stress bleeding into the delivery as suspicion climbs.
- **Case files that connect** — multi-suspect cases where cracking one deposition unlocks the next.
- **Sharable cases** — a seed link so two players can interrogate the same suspect and compare transcripts.
- **A real tell system** — the model already emits a physical "tell" every turn; surface it in the portrait animation instead of a caption.
