'use client';

import { useEffect, useRef } from 'react';
import {
  Application,
  ColorMatrixFilter,
  DisplacementFilter,
  Sprite,
  Texture,
} from 'pixi.js';

const SIZE = 360;

// One static image; all emotion is procedural, driven by suspicion 0-100.
export default function Portrait({
  src,
  suspicion,
  pulseKey,
}: {
  src: string;
  suspicion: number;
  pulseKey: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const suspicionRef = useRef(suspicion);
  const pulseAtRef = useRef(0);

  suspicionRef.current = suspicion;

  useEffect(() => {
    if (pulseKey > 0) pulseAtRef.current = performance.now();
  }, [pulseKey]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let destroyed = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: SIZE,
        height: SIZE,
        backgroundColor: 0x08080a,
        antialias: true,
      });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);

      // draw the image to a canvas first — uniform path for data URLs and SVG
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        /* broken image: leave a dark frame rather than crash */
      }
      if (destroyed) return;
      const pc = document.createElement('canvas');
      pc.width = pc.height = 512;
      const pg = pc.getContext('2d')!;
      pg.fillStyle = '#111114';
      pg.fillRect(0, 0, 512, 512);
      if (img.naturalWidth) pg.drawImage(img, 0, 0, 512, 512);
      const portrait = new Sprite(Texture.from(pc));
      portrait.anchor.set(0.5);
      const baseScale = SIZE / 512;
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      portrait.position.set(cx, cy);

      // scrolling noise for the displacement (instability) filter
      const nc = document.createElement('canvas');
      nc.width = nc.height = 256;
      const ng = nc.getContext('2d')!;
      const nd = ng.createImageData(256, 256);
      for (let i = 0; i < nd.data.length; i += 4) {
        const v = Math.floor(Math.random() * 256);
        nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v;
        nd.data[i + 3] = 255;
      }
      ng.putImageData(nd, 0, 0);
      const noiseSprite = new Sprite(Texture.from(nc));
      noiseSprite.texture.source.addressMode = 'repeat';
      noiseSprite.renderable = false;
      app.stage.addChild(noiseSprite);

      const cm = new ColorMatrixFilter();
      const disp = new DisplacementFilter({ sprite: noiseSprite, scale: 0 });
      portrait.filters = [cm, disp];
      app.stage.addChild(portrait);

      // vignette: radial gradient sprite over everything
      const vc = document.createElement('canvas');
      vc.width = vc.height = SIZE;
      const vg = vc.getContext('2d')!;
      const grad = vg.createRadialGradient(cx, cy, SIZE * 0.25, cx, cy, SIZE * 0.62);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      vg.fillStyle = grad;
      vg.fillRect(0, 0, SIZE, SIZE);
      const vig = new Sprite(Texture.from(vc));
      vig.anchor.set(0.5);
      vig.position.set(cx, cy);
      app.stage.addChild(vig);

      let es = 0; // eased suspicion, 0..1 — everything derives from this
      app.ticker.add(() => {
        es += (suspicionRef.current / 100 - es) * 0.06;
        const t = performance.now() / 1000;

        const sincePulse = performance.now() - pulseAtRef.current;
        const p = pulseAtRef.current && sincePulse < 250 ? 1 - sincePulse / 250 : 0;

        // breathing: faster and deeper as suspicion rises
        const period = 4.0 - 2.2 * es;
        const amp = 0.006 + 0.008 * es;
        const breathe = 1 + amp * Math.sin((t * 2 * Math.PI) / period);
        portrait.scale.set(baseScale, baseScale * breathe);

        // lean: toward camera when calm, pulled back when hostile
        portrait.rotation = ((1.5 - 4 * es) * Math.PI) / 180;

        // tremor + impact shake
        const jit = 1.5 * es + 6 * p;
        portrait.x = cx + (Math.random() - 0.5) * 2 * jit;
        portrait.y = cy + 4 * es + (Math.random() - 0.5) * 2 * (1.5 * es);

        // colour grade: desaturate + harden as suspicion rises
        cm.reset();
        cm.saturate(-0.35 * es, false);
        cm.contrast(0.2 * es, true);

        // impact pulse: red tint decaying over 250ms
        const k = Math.round(255 * (1 - 0.7 * p));
        portrait.tint = (255 << 16) | (k << 8) | Math.round(k * 0.9);

        vig.alpha = 0.3 + 0.5 * es + 0.2 * p;
        vig.scale.set(1.6 - 0.6 * es);

        disp.scale.x = disp.scale.y = 8 * es;
        noiseSprite.x = -((t * 30) % 256);
        noiseSprite.y = -((t * 17) % 256);
      });
    })();

    return () => {
      destroyed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [src]);

  return <div ref={mountRef} style={{ width: SIZE, height: SIZE }} />;
}
