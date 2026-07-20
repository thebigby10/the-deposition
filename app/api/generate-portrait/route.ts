import { generateImage, gateway } from 'ai';
import { IMAGE_MODEL } from '@/lib/game';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { appearance = '', role = '' } = await req.json().catch(() => ({}));
  const prompt = `Portrait of ${String(appearance).slice(0, 300)}. ${String(role).slice(0, 100)}.
Neutral expression, direct gaze at camera, head and shoulders, centred,
plain dark background.
Style: 1970s crime film still, muted desaturated palette, hard side
lighting, deep shadow, 35mm grain, photographic.`;

  try {
    const { image } = await generateImage({
      model: gateway.imageModel(IMAGE_MODEL),
      prompt,
      aspectRatio: '1:1',
    });
    return Response.json({
      dataUrl: `data:${image.mediaType};base64,${image.base64}`,
    });
  } catch {
    // client falls back to the silhouette — never block the game on an image
    return Response.json({ dataUrl: null }, { status: 502 });
  }
}
