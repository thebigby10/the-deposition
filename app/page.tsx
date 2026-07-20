'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { PRESET_CASE, type Case, type Turn } from '@/lib/game';

const Portrait = dynamic(() => import('@/components/Portrait'), { ssr: false });

const SILHOUETTE = '/silhouette.svg';
const MAX_QUESTIONS = 12;
const REVEAL_STEPS = 7; // name, role, incident, evidence x3, portrait

type Screen = 'select' | 'generating' | 'interrogation' | 'verdict';
type Ending = 'cracked' | 'lawyered' | 'out_of_time' | 'accused_right' | 'accused_wrong' | null;
type Msg = { role: 'player' | 'suspect' | 'system'; text: string; tell?: string };

const SHRUG_LINES = [
  "I've said what I have to say about that.",
  'Ask it plainer, inspector.',
  "You'll have to do better than that.",
];

const EXAMPLE_CHIPS = [
  'A celebrated chef whose rival collapsed during service at her restaurant',
  'A night-shift security guard at a museum where a painting vanished without a single alarm',
];

const RANKS: Record<string, { rank: string; blurb: string }> = {
  accused_right: { rank: 'Commendation', blurb: 'You named it before they broke. Clean work.' },
  cracked: { rank: 'Case Closed', blurb: 'You found the seam and pressed until it gave.' },
  out_of_time: { rank: 'Inconclusive', blurb: 'Twelve questions, and the secret walked out the door.' },
  lawyered: { rank: 'Dismissed', blurb: 'You pushed blind. The interview is over.' },
  accused_wrong: { rank: 'Dismissed', blurb: 'The accusation missed.' },
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>('select');
  const [kase, setKase] = useState<Case | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<Msg[]>([]);
  const [suspicion, setSuspicion] = useState(0);
  const [questionsLeft, setQuestionsLeft] = useState(MAX_QUESTIONS);
  const [facts, setFacts] = useState<string[]>([]);
  const [ending, setEnding] = useState<Ending>(null);
  const [input, setInput] = useState('');
  const [premise, setPremise] = useState('');
  const [busy, setBusy] = useState(false);
  const [accuseMode, setAccuseMode] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [revealStep, setRevealStep] = useState(0);
  const [peek, setPeek] = useState(false);
  const [finalVerdict, setFinalVerdict] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  // generating screen: reveal one dossier field every 400ms
  useEffect(() => {
    if (screen !== 'generating') return;
    const id = setInterval(() => setRevealStep((s) => Math.min(s + 1, REVEAL_STEPS)), 400);
    return () => clearInterval(id);
  }, [screen]);

  // enter interrogation only when both the animation and the real calls are done
  useEffect(() => {
    if (screen === 'generating' && revealStep >= REVEAL_STEPS && kase && portraitUrl && !peek) {
      const t = setTimeout(() => {
        setHistory([{ role: 'suspect', text: kase.suspect.opening_line }]);
        setScreen('interrogation');
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [screen, revealStep, kase, portraitUrl, peek]);

  async function startCase(preset: boolean) {
    setScreen('generating');
    setRevealStep(0);
    setPeek(false);
    setKase(null);
    setPortraitUrl(null);
    setSuspicion(0);
    setQuestionsLeft(MAX_QUESTIONS);
    setFacts([]);
    setEnding(null);
    setHistory([]);
    setAccuseMode(false);
    setFinalVerdict('');

    let c = PRESET_CASE;
    if (!preset) {
      try {
        const res = await fetch('/api/generate-case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: premise }),
        });
        if (res.ok) c = await res.json();
      } catch {
        /* fallback: preset case */
      }
    }
    setKase(c);
    try {
      const res = await fetch('/api/generate-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appearance: c.suspect.appearance, role: c.suspect.role }),
      });
      const data = res.ok ? await res.json() : null;
      setPortraitUrl(data?.dataUrl ?? SILHOUETTE);
    } catch {
      setPortraitUrl(SILHOUETTE);
    }
  }

  function end(e: Ending, extra?: string) {
    setEnding(e);
    if (extra) setFinalVerdict(extra);
    if (e === 'lawyered') {
      setHistory((h) => [
        ...h,
        { role: 'suspect', text: 'This interview is over. Anything else goes through my lawyer.' },
      ]);
    }
    setTimeout(() => setScreen('verdict'), e === 'cracked' || e === 'lawyered' ? 2500 : 800);
  }

  async function ask() {
    if (!input.trim() || busy || !kase || ending) return;
    const q = input.trim();
    setInput('');
    setBusy(true);
    const hist = history;
    setHistory((h) => [...h, { role: 'player', text: q }]);
    try {
      const res = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case: kase,
          history: hist.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, text: m.text })),
          suspicion,
          facts,
          question: q,
        }),
      });
      if (!res.ok) throw new Error();
      const t: Turn = await res.json();
      const next = Math.max(0, Math.min(100, suspicion + t.suspicion_delta));
      if (t.suspicion_delta > 12) setPulseKey((k) => k + 1);
      setSuspicion(next);
      setFacts((f) => [...f, ...t.new_facts.filter((x) => !f.includes(x))]);
      setHistory((h) => [...h, { role: 'suspect', text: t.reply, tell: t.tell }]);
      const left = questionsLeft - 1;
      setQuestionsLeft(left);
      if (t.cracked) end('cracked');
      else if (next >= 100) end('lawyered');
      else if (left <= 0) end('out_of_time');
    } catch {
      // in-character shrug; question not consumed
      setHistory((h) => [
        ...h,
        {
          role: 'suspect',
          text: SHRUG_LINES[Math.floor(Math.random() * SHRUG_LINES.length)],
          tell: 'They wait, giving nothing away.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function accuse() {
    if (!input.trim() || busy || !kase || ending) return;
    const a = input.trim();
    setInput('');
    setBusy(true);
    setAccuseMode(false);
    setHistory((h) => [...h, { role: 'player', text: `ACCUSATION: ${a}` }]);
    try {
      const res = await fetch('/api/accuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: kase.suspect.secret, accusation: a }),
      });
      if (!res.ok) throw new Error();
      const { correct, verdict } = await res.json();
      setHistory((h) => [...h, { role: 'system', text: verdict }]);
      if (correct) {
        end('accused_right', verdict);
      } else {
        setPulseKey((k) => k + 1);
        const next = Math.min(100, suspicion + 30);
        setSuspicion(next);
        if (next >= 100) end('lawyered');
      }
    } catch {
      setHistory((h) => [...h, { role: 'system', text: 'The accusation hangs in the air, unrecorded. Try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  const lastTell = [...history].reverse().find((m) => m.tell)?.tell;

  // ---------- screens ----------

  if (screen === 'select') {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col items-center justify-center gap-10 p-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-widest text-neutral-100">THE DEPOSITION</h1>
          <p className="mt-3 text-neutral-400">One suspect. One secret. Twelve questions.</p>
        </div>
        <button
          onClick={() => startCase(true)}
          className="w-full max-w-xl text-left border border-neutral-700 rounded-lg p-5 hover:border-amber-600 hover:bg-neutral-900 transition"
        >
          <div className="text-xs uppercase tracking-widest text-amber-600">Case File · Preset</div>
          <div className="mt-1 text-xl font-semibold">{PRESET_CASE.scenario.title}</div>
          <div className="mt-1 text-sm text-neutral-400">{PRESET_CASE.scenario.incident}</div>
        </button>
        <div className="w-full max-w-xl">
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Or open a new case</div>
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value.slice(0, 200))}
            placeholder="Describe a suspect, or describe an incident."
            rows={2}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm outline-none focus:border-amber-600 resize-none"
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            {EXAMPLE_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => setPremise(c)}
                className="text-xs border border-neutral-700 rounded-full px-3 py-1 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition"
              >
                {c.slice(0, 52)}…
              </button>
            ))}
          </div>
          <button
            onClick={() => premise.trim() && startCase(false)}
            disabled={!premise.trim()}
            className="mt-3 w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-700 rounded-lg py-2.5 font-semibold tracking-wide transition"
          >
            GENERATE CASE
          </button>
        </div>
      </main>
    );
  }

  if (screen === 'generating') {
    const rows: [string, string | undefined][] = kase
      ? [
          ['Suspect', kase.suspect.name],
          ['Role', kase.suspect.role],
          ['Incident', kase.scenario.incident],
          ...kase.scenario.evidence.map((e, i) => [`Evidence ${i + 1}`, e.item] as [string, string]),
        ]
      : [
          ['Suspect', undefined],
          ['Role', undefined],
          ['Incident', undefined],
          ['Evidence 1', undefined],
          ['Evidence 2', undefined],
          ['Evidence 3', undefined],
        ];
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-amber-600 animate-pulse">Compiling dossier…</div>
          <div className="mt-4 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
            {rows.map(([label, value], i) => (
              <div key={label} className="flex items-baseline gap-4 p-3">
                <span className="w-28 shrink-0 text-xs uppercase tracking-widest text-neutral-500">{label}</span>
                <span className={`text-sm transition-opacity duration-500 ${i < revealStep && value ? 'opacity-100' : 'opacity-0'}`}>
                  {value ?? '…'}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-4 p-3">
              <span className="w-28 shrink-0 text-xs uppercase tracking-widest text-neutral-500">Portrait</span>
              {revealStep >= REVEAL_STEPS && portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraitUrl} alt="suspect" className="w-20 h-20 rounded object-cover" />
              ) : (
                <span className="text-sm text-neutral-600 animate-pulse">developing…</span>
              )}
            </div>
          </div>
          {kase && (
            <button onClick={() => setPeek(!peek)} className="mt-4 text-xs text-neutral-600 hover:text-neutral-400 underline">
              {peek ? 'hide the engine — begin the interview' : 'peek at what the engine committed to'}
            </button>
          )}
          {kase && peek && (
            <div className="mt-2 border border-neutral-800 rounded-lg p-4 text-sm space-y-2">
              <p>
                <span className="text-amber-600">Secret:</span> {kase.suspect.secret}
              </p>
              {kase.suspect.contradictions.map((c, i) => (
                <p key={i} className="text-neutral-400">
                  <span className="text-neutral-500">Contradiction {i + 1}:</span> claims “{c.claim}” — but {c.truth}
                </p>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  if (screen === 'verdict' && kase) {
    const r = RANKS[ending ?? 'out_of_time'];
    const won = ending === 'cracked' || ending === 'accused_right';
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl text-center">
          <div className={`text-xs uppercase tracking-widest ${won ? 'text-emerald-500' : 'text-red-500'}`}>Verdict</div>
          <h2 className="mt-2 text-4xl font-bold tracking-widest">{r.rank}</h2>
          <p className="mt-2 text-neutral-400">{r.blurb}</p>
          {finalVerdict && <p className="mt-2 text-sm text-neutral-500 italic">{finalVerdict}</p>}
          <div className="mt-8 border border-neutral-800 rounded-lg p-5 text-left space-y-3 text-sm">
            <p>
              <span className="text-amber-600 uppercase text-xs tracking-widest">What they were hiding — </span>
              {kase.suspect.secret}
            </p>
            <p className="text-neutral-400">
              <span className="text-neutral-500 uppercase text-xs tracking-widest">Why — </span>
              {kase.suspect.why_hidden}
            </p>
            <div className="text-neutral-400">
              <span className="text-neutral-500 uppercase text-xs tracking-widest">The three seams — </span>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {kase.suspect.contradictions.map((c, i) => (
                  <li key={i}>
                    “{c.claim}” — but {c.truth} <span className="text-neutral-600">({c.evidence_ref})</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-neutral-500">
              Questions used: {MAX_QUESTIONS - questionsLeft} of {MAX_QUESTIONS} · Final suspicion: {suspicion}/100
            </p>
          </div>
          <button
            onClick={() => setScreen('select')}
            className="mt-8 bg-amber-700 hover:bg-amber-600 rounded-lg px-8 py-2.5 font-semibold tracking-wide transition"
          >
            NEW CASE
          </button>
        </div>
      </main>
    );
  }

  if (!kase) return null;

  const sColor = suspicion >= 70 ? 'bg-red-600' : suspicion >= 30 ? 'bg-amber-500' : 'bg-emerald-600';

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200 p-4 grid grid-cols-[280px_1fr_260px] gap-4 max-w-7xl mx-auto">
      {/* left: case file */}
      <aside className="border border-neutral-800 rounded-lg p-4 space-y-4 text-sm overflow-y-auto max-h-[calc(100vh-2rem)]">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-600">{kase.scenario.title}</div>
          <p className="mt-1 text-neutral-400">{kase.scenario.incident}</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500">Timeline</div>
          <p className="mt-1 text-neutral-400 text-xs leading-5">{kase.scenario.timeline}</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500">Evidence — click to cite</div>
          <div className="mt-1 space-y-2">
            {kase.scenario.evidence.map((e) => (
              <button
                key={e.item}
                onClick={() => {
                  setInput(`About the ${e.item.toLowerCase()} — `);
                  inputRef.current?.focus();
                }}
                className="w-full text-left border border-neutral-800 rounded p-2 hover:border-amber-700 transition"
              >
                <div className="font-semibold text-neutral-300">{e.item}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{e.detail}</div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-600">{kase.scenario.stakes}</p>
      </aside>

      {/* centre: portrait + conversation */}
      <section className="flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="flex flex-col items-center">
          <div className="rounded-lg overflow-hidden border border-neutral-800">
            <Portrait src={portraitUrl ?? SILHOUETTE} suspicion={suspicion} pulseKey={pulseKey} />
          </div>
          <p className="h-6 mt-2 text-sm italic text-neutral-500 text-center">{lastTell ?? ''}</p>
          <div className="text-sm text-neutral-400 font-semibold">
            {kase.suspect.name} · <span className="text-neutral-600 font-normal">{kase.suspect.role}</span>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto mt-3 space-y-3 pr-1">
          {history.map((m, i) =>
            m.role === 'system' ? (
              <p key={i} className="text-center text-xs uppercase tracking-widest text-red-400">
                {m.text}
              </p>
            ) : (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'player' ? 'ml-auto bg-neutral-800' : 'bg-neutral-900 border border-neutral-800'
                }`}
              >
                {m.text}
              </div>
            )
          )}
          {busy && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-500 max-w-[85%] animate-pulse">
              …
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (accuseMode ? accuse() : ask())}
            disabled={busy || !!ending}
            placeholder={accuseMode ? 'State what you think happened. Wrong costs +30 suspicion.' : 'Ask your question…'}
            className={`flex-1 bg-neutral-900 border rounded-lg px-3 py-2.5 text-sm outline-none transition ${
              accuseMode ? 'border-red-700 focus:border-red-500' : 'border-neutral-700 focus:border-amber-600'
            }`}
          />
          <button
            onClick={() => (accuseMode ? accuse() : ask())}
            disabled={busy || !input.trim() || !!ending}
            className={`px-4 rounded-lg font-semibold text-sm disabled:opacity-40 transition ${
              accuseMode ? 'bg-red-700 hover:bg-red-600' : 'bg-amber-700 hover:bg-amber-600'
            }`}
          >
            {accuseMode ? 'Accuse' : 'Ask'}
          </button>
          <button
            onClick={() => setAccuseMode(!accuseMode)}
            disabled={busy || !!ending}
            className="px-3 rounded-lg border border-neutral-700 text-xs text-neutral-400 hover:border-red-700 hover:text-red-400 disabled:opacity-40 transition"
          >
            {accuseMode ? 'Cancel' : 'Make Accusation'}
          </button>
        </div>
      </section>

      {/* right: state panel */}
      <aside className="border border-neutral-800 rounded-lg p-4 space-y-5 text-sm max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500">Questions remaining</div>
          <div className="text-3xl font-bold mt-1">{questionsLeft}</div>
        </div>
        <div>
          <div className="flex justify-between text-xs uppercase tracking-widest text-neutral-500">
            <span>Suspicion</span>
            <span>{suspicion}/100</span>
          </div>
          <div className="mt-1 h-2.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className={`h-full ${sColor} transition-all duration-700`} style={{ width: `${suspicion}%` }} />
          </div>
          <div className="mt-1 text-xs text-neutral-600">
            {suspicion >= 70 ? 'Hostile' : suspicion >= 30 ? 'Guarded' : 'Cooperative'}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500">Extracted facts</div>
          {facts.length === 0 ? (
            <p className="mt-1 text-xs text-neutral-600">Nothing yet. Press the evidence.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {facts.map((f, i) => (
                <li key={i} className="text-xs text-neutral-400 border-l-2 border-amber-700 pl-2">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </main>
  );
}
