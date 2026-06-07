'use client';

/**
 * app/page.jsx — Haroon's Weddings & Events
 *
 * Sequence orchestrator:
 *   1. IntroVideo  — new cinematic WebGL intro (THIS FILE triggers it)
 *   2. Loader      — original preloader (Loader.jsx, UNCHANGED)
 *   3. Site        — main website content
 *
 * The existing index.html is preserved as the site shell.
 * In GitHub Pages export mode the static HTML is served directly;
 * in Next.js dev / production it is embedded via iframe.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';

// SSR=false — both components use canvas/WebGL which requires a browser
const IntroVideo = dynamic(() => import('../IntroVideo'), { ssr: false });
const Loader     = dynamic(() => import('../Loader'),     { ssr: false });

export default function HomePage() {
  // 'intro' → 'loader' → 'site'
  const [stage, setStage] = useState('intro');

  return (
    <>
      {stage === 'intro' && (
        <IntroVideo onDone={() => setStage('loader')} />
      )}

      {stage === 'loader' && (
        <Loader onDone={() => setStage('site')} />
      )}

      {stage === 'site' && (
        <iframe
          src="/index.html"
          title="Haroon's Weddings & Events"
          style={{ width:'100%', height:'100vh', border:'none', display:'block' }}
          loading="lazy"
        />
      )}
    </>
  );
}
