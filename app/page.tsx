'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { DIFFICULTIES, PRESET_CASE, presetCase, type Case, type Turn } from '@/lib/game';

const Portrait = dynamic(() => import('@/components/Portrait'), { ssr: false });

const SILHOUETTE = '/silhouette.svg';
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
  'A volunteer firefighter who was first on the scene of a blaze at his own storage unit',
  'An air-traffic controller on shift the night two planes came within fifty feet over the bay',
  'A retirement-home nurse whose patients keep rewriting their wills in her favor',
  'A rideshare driver whose last passenger never arrived at the address in the app',
  'An antiques dealer offering a lost Fabergé egg the week one vanished from a private vault',
  'A church organist on duty the night the donation box disappeared and the vestry lock was changed',
  'A glaciologist whose research partner fell into a crevasse the day their findings diverged',
  'A wedding planner whose groom vanished between the rehearsal dinner and the ceremony',
];

const TUTORIAL_STEPS = [
  { n: '01', title: 'Open the file', line: 'Pick the preset case or write your own suspect.' },
  { n: '02', title: 'Interrogate', line: 'Limited questions. Press the evidence in the dossier.' },
  { n: '03', title: 'Watch the meter', line: 'Suspicion climbs cooperative → guarded → hostile.' },
  { n: '04', title: 'Break them', line: 'Corner them into a confession — or make the accusation.' },
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
  const [difficulty, setDifficulty] = useState(1);
  const [questionsLeft, setQuestionsLeft] = useState<number>(DIFFICULTIES[1].questions);
  const [facts, setFacts] = useState<string[]>([]);
  const [ending, setEnding] = useState<Ending>(null);
  const [input, setInput] = useState('');
  const [premise, setPremise] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accuseMode, setAccuseMode] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [revealStep, setRevealStep] = useState(0);
  const [peek, setPeek] = useState(false);
  const [finalVerdict, setFinalVerdict] = useState('');
  const [showTutorial, setShowTutorial] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const diff = DIFFICULTIES[difficulty];

  useEffect(() => {
    setApiKey(localStorage.getItem('gemini_api_key') ?? '');
  }, []);

  function saveKey(k: string) {
    setApiKey(k);
    localStorage.setItem('gemini_api_key', k);
  }

  function closeTutorial() {
    setShowTutorial(false);
  }

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
    setQuestionsLeft(diff.questions);
    setFacts([]);
    setEnding(null);
    setHistory([]);
    setAccuseMode(false);
    setFinalVerdict('');

    let c = presetCase(difficulty);
    if (!preset) {
      try {
        const res = await fetch('/api/generate-case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: premise, apiKey, difficulty }),
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

  async function enhance() {
    if (!premise.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: premise, apiKey }),
      });
      const d = res.ok ? await res.json() : null;
      if (d?.description) setPremise(String(d.description).slice(0, 200));
    } catch {
      /* keep the original premise */
    } finally {
      setEnhancing(false);
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
          apiKey,
          difficulty,
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
        body: JSON.stringify({ secret: kase.suspect.secret, accusation: a, apiKey, difficulty }),
      });
      if (!res.ok) throw new Error();
      const { correct, verdict } = await res.json();
      setHistory((h) => [...h, { role: 'system', text: verdict }]);
      if (correct) {
        end('accused_right', verdict);
      } else {
        setPulseKey((k) => k + 1);
        const next = Math.min(100, suspicion + diff.wrongAccusePenalty);
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
      <main className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center p-8">
        {showTutorial && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-2xl">
              <div className="h-1 bg-amber-600" />
              <div className="p-6">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-600">
                    {showSettings ? 'Bring Your Own Key' : 'Field Briefing'}
                  </span>
                  <button
                    onClick={() => setShowSettings((v) => !v)}
                    title="Use your own Gemini API key"
                    aria-label="Settings"
                    className={`w-7 h-7 flex items-center justify-center rounded border transition ${
                      showSettings
                        ? 'border-amber-600 text-amber-500'
                        : 'border-neutral-700 text-neutral-500 hover:border-amber-600 hover:text-amber-500'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                </div>

                {showSettings ? (
                  <div className="py-4">
                    <p className="text-sm text-neutral-400">
                      Skip the shared free-tier quota — run the game on your own Gemini
                      key. It&apos;s stored only in this browser and sent straight to Google.
                    </p>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => saveKey(e.target.value)}
                      placeholder="Paste your Gemini API key"
                      className="mt-3 w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm font-mono text-neutral-100 focus:border-amber-600 focus:outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className={apiKey.trim() ? 'text-amber-500' : 'text-neutral-600'}>
                        {apiKey.trim() ? '● Using your key' : '○ Using the shared default'}
                      </span>
                      {apiKey.trim() && (
                        <button onClick={() => saveKey('')} className="text-neutral-500 hover:text-neutral-300">
                          clear
                        </button>
                      )}
                    </div>
                    <ol className="mt-4 space-y-1.5 text-sm text-neutral-400 list-decimal list-inside marker:text-amber-600 marker:font-mono">
                      <li>
                        Open <span className="text-neutral-200">aistudio.google.com/apikey</span>
                      </li>
                      <li>Sign in with your Google account</li>
                      <li>
                        Click <span className="text-neutral-200">Create API key</span>
                      </li>
                      <li>Copy it and paste it above</li>
                    </ol>
                  </div>
                ) : (
                  <ol className="divide-y divide-neutral-800">
                    {TUTORIAL_STEPS.map((step) => (
                      <li key={step.n} className="flex items-center gap-4 py-4">
                        <span className="shrink-0 w-9 h-9 flex items-center justify-center rounded border border-amber-700/40 font-mono text-sm text-amber-600">
                          {step.n}
                        </span>
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-wide text-neutral-100">
                            {step.title}
                          </div>
                          <div className="text-sm text-neutral-400">{step.line}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  onClick={showSettings ? () => setShowSettings(false) : closeTutorial}
                  className="mt-2 w-full bg-amber-700 hover:bg-amber-600 rounded py-2.5 font-semibold uppercase tracking-widest text-sm transition"
                >
                  {showSettings ? 'Done' : 'Begin'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="w-full max-w-6xl grid gap-8 md:grid-cols-[minmax(0,1fr)_380px] items-stretch">
          {/* left: case selection */}
          <div className="flex flex-col gap-8">
            <div className="relative self-start">
              <h1 className="text-5xl font-bold tracking-widest text-neutral-100">THE DEPOSITION</h1>
              <p className="mt-3 text-neutral-400">One suspect. One secret. {diff.questions} questions.</p>
              <button
                onClick={() => setShowTutorial(true)}
                title="How to play"
                className="absolute -top-1 -right-8 w-7 h-7 rounded-full border border-neutral-700 text-neutral-400 hover:border-amber-600 hover:text-amber-500 transition text-sm"
              >
                ?
              </button>
            </div>
            <button
              onClick={() => startCase(true)}
              className="w-full text-left border border-neutral-700 rounded-lg p-5 hover:border-amber-600 hover:bg-neutral-900 transition"
            >
              <div className="text-xs uppercase tracking-widest text-amber-600">
                Case File · Preset · {diff.name}
              </div>
              <div className="mt-1 text-xl font-semibold">{PRESET_CASE.scenario.title}</div>
              <div key={difficulty} className="reel mt-1 text-sm text-neutral-400">
                {presetCase(difficulty).scenario.incident}
              </div>
            </button>
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Or open a new case</div>
              <textarea
                value={premise}
                onChange={(e) => setPremise(e.target.value.slice(0, 200))}
                placeholder="Describe a suspect, or describe an incident."
                rows={2}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-sm outline-none focus:border-amber-600 resize-none"
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                {EXAMPLE_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPremise(c)}
                    title={c}
                    className="text-xs text-left truncate border border-neutral-700 rounded-full px-3 py-1 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={enhance}
                  disabled={!premise.trim() || enhancing}
                  className="px-4 border border-neutral-700 rounded-lg py-2.5 text-sm text-neutral-300 hover:border-amber-600 disabled:opacity-40 transition"
                >
                  {enhancing ? 'Enhancing…' : 'Enhance'}
                </button>
                <button
                  onClick={() => premise.trim() && startCase(false)}
                  disabled={!premise.trim() || enhancing}
                  className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-700 rounded-lg py-2.5 font-semibold tracking-wide transition"
                >
                  GENERATE CASE
                </button>
              </div>
            </div>
          </div>

          {/* right: difficulty */}
          <aside className="flex flex-col border border-neutral-800 rounded-lg p-6">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Assignment Grade</div>
            <div className="mt-3 rounded border border-neutral-700 bg-neutral-900 overflow-hidden">
              <div
                key={difficulty}
                className="reel px-4 py-3.5 text-center font-mono text-2xl uppercase tracking-[0.25em] text-amber-500 whitespace-nowrap"
              >
                {diff.name}
              </div>
            </div>
            <div className="mt-6 flex flex-1 justify-center gap-8">
              <input
                type="range"
                min={0}
                max={4}
                step={1}
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                aria-label="Difficulty"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                className="h-56 accent-amber-600 cursor-pointer"
              />
              <div className="flex h-56 flex-col-reverse justify-between">
                {DIFFICULTIES.map((d, i) => (
                  <button
                    key={d.name}
                    onClick={() => setDifficulty(i)}
                    className={`flex items-center gap-3 text-xs font-mono uppercase tracking-widest transition ${
                      i === difficulty ? 'text-amber-500' : 'text-neutral-600 hover:text-neutral-400'
                    }`}
                  >
                    <span className={`h-px w-4 ${i === difficulty ? 'bg-amber-500' : 'bg-neutral-700'}`} />
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-6 min-h-[3.5rem] text-sm text-neutral-500 italic border-l-2 border-amber-700/50 pl-3">
              {diff.tagline}
            </p>
          </aside>
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
              Grade: {diff.name} · Questions used: {diff.questions - questionsLeft} of {diff.questions} · Final
              suspicion: {suspicion}/100
            </p>
          </div>
          <button
            onClick={() => {
              setScreen('select');
              setShowTutorial(true);
            }}
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
          <p className="h-6 mt-2 text-sm italic text-neutral-500 text-center">{diff.showTells ? lastTell ?? '' : ''}</p>
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
            placeholder={
              accuseMode
                ? `State what you think happened. Wrong costs +${diff.wrongAccusePenalty} suspicion.`
                : 'Ask your question…'
            }
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
            {diff.showSuspicionNumber && <span>{suspicion}/100</span>}
          </div>
          {diff.showSuspicionNumber ? (
            <div className="mt-1 h-2.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className={`h-full ${sColor} transition-all duration-700`} style={{ width: `${suspicion}%` }} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-neutral-600 italic">The meter stays in your gut on a cold case.</p>
          )}
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
