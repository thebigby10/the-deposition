export const maxDuration = 60;

// ponytail: fetched server-side and returned as a data URL — Pollinations 403s any
// request that carries an Origin header, and Pixi's crossOrigin='anonymous' load
// sends one, so the browser can never fetch this cross-origin itself.
export async function POST(req: Request) {
  const { appearance = '', role = '' } = await req.json().catch(() => ({}));
  const prompt = `Portrait of ${String(appearance).slice(0, 300)}. ${String(role).slice(0, 100)}.
Neutral expression, direct gaze at camera, head and shoulders, centred,
plain dark background.
Style: 1970s crime film still, muted desaturated palette, hard side
lighting, deep shadow, 35mm grain, photographic.`;

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return Response.json({ error: 'portrait failed' }, { status: 502 });
  const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  const type = res.headers.get('content-type') ?? 'image/jpeg';
  return Response.json({ dataUrl: `data:${type};base64,${b64}` });
}
