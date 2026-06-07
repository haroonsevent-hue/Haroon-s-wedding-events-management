/**
 * Loader.jsx  —  Haroon's Weddings & Events
 *
 * Engineering principles applied (from the "Resource Economy" conversation):
 *
 * 1. OBJECT POOLING          — Pre-allocated particle array. No `new Particle()` inside
 *                              the render loop. Removes GC pressure → zero frame spikes.
 *
 * 2. FRAME BUDGET MONITORING — Every frame measures its own cost. If dt > budget the
 *                              quality factor drops; if dt is healthy it climbs back.
 *                              The system self-regulates like biological homeostasis.
 *
 * 3. FALSE 3D (no Three.js)  — A z-axis (0 = near, 1 = far) on every particle drives:
 *                              · Scale (near = large, far = tiny)
 *                              · Opacity / depth fog (near = bright, far = dim)
 *                              · Parallax offset on mouse move (near = more shift)
 *                              · Color temperature (near = warm gold, far = cool)
 *                              · Depth-sorted render (painter's algorithm)
 *                              Result: perceived 3D galaxy with zero GPU geometry.
 *
 * 4. ADDITIVE BLENDING       — globalCompositeOperation = 'screen' makes overlapping
 *                              particles appear brighter. 150 smart particles > 1500 dumb.
 *
 * 5. IMPLOSION EXIT          — On completion, all particles rush toward the logo center,
 *                              rings contract, UI elements collapse inward, then the logo
 *                              flashes and cross-fades to the hero page. Every visual
 *                              element ends its journey at the same gravitational point.
 *
 * 6. SPRING PHYSICS          — Curtain: [0.76, 0, 0.24, 1] (strong sine in/out).
 *                              Content: [0.16, 1, 0.3, 1] (expo out — physical snap).
 *                              Motion feels like real physics, not tweening.
 *
 * 7. ZERO LAYOUT THRASH      — All particle positions in canvas pixel space.
 *                              No DOM reads inside the rAF loop.
 *
 * 8. TRUST BOUNDARIES        — React owns phase state + progress display.
 *                              Canvas owns all particle visual state.
 *                              Neither system crosses into the other's domain.
 *
 * Phase timeline (~5.5s total):
 *   loading  (0 → 100%)   : ~4.2s — particles float in depth field, rings rotate, progress fills
 *   collapse              : ~0.7s — everything implodes into logo; particles rush center
 *   flash                 : ~0.5s — logo pulses gold supernova, fills screen
 *   done                  : unmount → hero fades in
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImage from '../assets/logo.png';

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTS — The Computational Budget Committee allocates here.
   Total 16.67ms frame budget:
     Canvas draw  ≈ 7ms   GPU thread
     Compositor   ≈ 2ms   browser
     React        ≈ 1ms   main thread
     Reserve      ≈ 6ms   headroom
───────────────────────────────────────────────────────────────────────── */
const FRAME_BUDGET_MS = 16;
const POOL_SIZE       = 280;   // pre-allocated — never grows at runtime
const BASE_ACTIVE     = 150;   // target active particles at quality 1.0
const SPAWN_INTERVAL  = 2;     // spawn every N frames
const TAU             = 6.283185307179586; // 2π — literal in hot loop avoids Math call

/* Brand letters for staggered reveal */
const BRAND_CHARS = "HAROON'S".split('');

/* ─────────────────────────────────────────────────────────────────────────
   OBJECT POOL — Allocate once. Recycle forever. GC never fires inside rAF.
───────────────────────────────────────────────────────────────────────── */
function createPool(size) {
  const pool = new Array(size);
  for (let i = 0; i < size; i++) {
    pool[i] = {
      x: 0, y: 0,
      z: 0,           // fake depth: 0 = near camera, 1 = far background
      vx: 0, vy: 0,
      life: 0, maxLife: 1,
      baseSize: 1,
      active: false,
      colorR: 197, colorG: 160, colorB: 89,
    };
  }
  return pool;
}

function acquireFromPool(pool, pointer) {
  const len = pool.length;
  for (let i = 0; i < len; i++) {
    const idx = (pointer + i) % len;
    if (!pool[idx].active) return idx;
  }
  return -1; // pool exhausted — drop the spawn
}

/* ─────────────────────────────────────────────────────────────────────────
   SPAWN — Initialise a recycled particle.
   Particles originate from all four edges, converging inward so the
   viewer feels like they are inside a depth field collapsing toward center.
───────────────────────────────────────────────────────────────────────── */
function spawnParticle(p, W, H) {
  p.active = true;
  p.z = Math.random() * 0.85 + 0.05;
  const depthScale = 1 - p.z * 0.72;
  p.baseSize = (Math.random() * 2.8 + 0.4) * depthScale;

  const edge = (Math.random() * 4) | 0;
  if (edge === 0)      { p.x = Math.random() * W; p.y = -8; }
  else if (edge === 1) { p.x = W + 8;             p.y = Math.random() * H; }
  else if (edge === 2) { p.x = Math.random() * W; p.y = H + 8; }
  else                 { p.x = -8;                p.y = Math.random() * H; }

  const cx = W * 0.5, cy = H * 0.5;
  const dx = cx - p.x, dy = cy - p.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const speed   = (Math.random() * 0.55 + 0.12) * depthScale;
  const scatter = (Math.random() - 0.5) * 0.35;
  p.vx = (dx / len) * speed + scatter;
  p.vy = (dy / len) * speed + scatter;

  p.life    = 0;
  p.maxLife = (Math.random() * 280 + 180) | 0;

  // Color temperature: near = warm gold (#C5A059), far = cooler, dimmer
  p.colorR = (197 - p.z * 55) | 0;
  p.colorG = (160 - p.z * 80) | 0;
  p.colorB = (89  - p.z * 30) | 0;
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function Loader({ onDone }) {
  const canvasRef        = useRef(null);
  const mouseRef         = useRef({ x: 0.5, y: 0.5 });
  const phaseRef         = useRef('loading'); // mirrors state — readable inside rAF
  const collapseStartRef = useRef(0);         // timestamp when collapse phase begins

  const [pct,   setPct]   = useState(0);
  const [phase, setPhase] = useState('loading'); // loading | collapse | flash | done

  /* Keep the ref in sync with React state so the canvas loop reads it each frame */
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ── Canvas particle engine ─────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

    let W = 0, H = 0;
    let raf;
    let frameCount    = 0;
    let qualityFactor = 1.0;
    let lastTimestamp = 0;
    let poolPointer   = 0;

    const pool = createPool(POOL_SIZE);

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();

    /* Seed 65% of the pool so the screen is populated immediately */
    const seedCount = (POOL_SIZE * 0.65) | 0;
    for (let i = 0; i < seedCount; i++) {
      const idx = acquireFromPool(pool, poolPointer);
      if (idx < 0) break;
      pool[idx].active = true;
      pool[idx].z = Math.random() * 0.9 + 0.05;
      const ds = 1 - pool[idx].z * 0.72;
      pool[idx].baseSize = (Math.random() * 2.8 + 0.4) * ds;
      pool[idx].x = Math.random() * (window.innerWidth  || 1920);
      pool[idx].y = Math.random() * (window.innerHeight || 1080);
      pool[idx].vx = (Math.random() - 0.5) * 0.35 * ds;
      pool[idx].vy = (Math.random() - 0.5) * 0.35 * ds;
      pool[idx].life    = (Math.random() * 160) | 0;
      pool[idx].maxLife = ((Math.random() * 280 + 180)) | 0;
      pool[idx].colorR  = (197 - pool[idx].z * 55) | 0;
      pool[idx].colorG  = (160 - pool[idx].z * 80) | 0;
      pool[idx].colorB  = (89  - pool[idx].z * 30) | 0;
      poolPointer = (idx + 1) % POOL_SIZE;
    }

    /* ── Render loop ── */
    function frame(timestamp) {
      raf = requestAnimationFrame(frame);

      const dt = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      frameCount++;

      /* ── THERMAL PRESERVATION: frame budget monitoring ──
         If a frame cost too much → shrink quality.
         If headroom exists       → gently recover.
         Like biological homeostasis.                        */
      if (dt > FRAME_BUDGET_MS * 1.6) {
        qualityFactor = Math.max(0.25, qualityFactor - 0.06);
      } else if (dt < FRAME_BUDGET_MS * 0.85 && qualityFactor < 1.0) {
        qualityFactor = Math.min(1.0, qualityFactor + 0.015);
      }

      const currentPhase = phaseRef.current;
      const isLoading  = currentPhase === 'loading';
      const isCollapse = currentPhase === 'collapse';
      const isFlash    = currentPhase === 'flash';
      const cx = W * 0.5;
      const cy = H * 0.5;

      /* ── SPAWN: only during loading phase ── */
      if (isLoading && frameCount % SPAWN_INTERVAL === 0) {
        const target  = (BASE_ACTIVE * qualityFactor) | 0;
        let activeNow = 0;
        for (let i = 0; i < POOL_SIZE; i++) { if (pool[i].active) activeNow++; }
        if (activeNow < target) {
          const idx = acquireFromPool(pool, poolPointer);
          if (idx >= 0) {
            spawnParticle(pool[idx], W, H);
            poolPointer = (idx + 1) % POOL_SIZE;
          }
        }
      }

      ctx.clearRect(0, 0, W, H);

      /* ── DEPTH SORT (painter's algorithm): far first, near on top ── */
      const order = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        if (pool[i].active) order.push(i);
      }
      order.sort((a, b) => pool[b].z - pool[a].z);

      /* ── ADDITIVE BLENDING: overlapping particles brighten each other ── */
      ctx.globalCompositeOperation = 'screen';

      /* Mouse parallax offsets — computed once per frame */
      const mx = mouseRef.current.x - 0.5;
      const my = mouseRef.current.y - 0.5;

      /* Collapse pull factor — ramps from 0 → 1 over 700ms */
      let collapsePull = 0;
      if (isCollapse || isFlash) {
        const elapsed = Date.now() - collapseStartRef.current;
        collapsePull  = Math.min(1, elapsed / 700);
      }

      for (let oi = 0; oi < order.length; oi++) {
        const p = pool[order[oi]];

        p.life++;

        /* Normal life expiry only during loading */
        if (isLoading && p.life >= p.maxLife) {
          p.active = false;
          continue;
        }

        /* ── IMPLOSION PHYSICS ──
           During collapse, redirect each particle's velocity toward the center
           (where the logo sits). Pull strength ramps up over 700ms.
           Damping (× 0.88) prevents wild overshoot.
           Particles cull themselves when they reach the logo.            */
        if (isCollapse || isFlash) {
          const dx   = cx - p.x;
          const dy   = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          // Cull particles that have reached the center
          if (dist < 6) { p.active = false; continue; }

          // Add gravitational pull toward center
          const pullStrength = collapsePull * 1.2;
          p.vx += (dx / dist) * pullStrength;
          p.vy += (dy / dist) * pullStrength;

          // Dampen to prevent orbit
          p.vx *= 0.88;
          p.vy *= 0.88;
        }

        /* Advance position */
        p.x += p.vx;
        p.y += p.vy;

        /* Cull out-of-bounds during loading */
        if (isLoading && (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20)) {
          p.active = false;
          continue;
        }

        /* Life-progress alpha: fade in → plateau → fade out */
        const prog = Math.min(p.life / p.maxLife, 1);
        let lifeAlpha;
        if      (prog < 0.12) lifeAlpha = prog / 0.12;
        else if (prog > 0.78 && isLoading) lifeAlpha = (1 - prog) / 0.22;
        else                  lifeAlpha = 1;

        /* During implosion: fade as particle approaches center */
        if (isCollapse || isFlash) {
          const dx   = cx - p.x;
          const dy   = cy - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          lifeAlpha *= Math.min(1, dist / 80);
        }

        /* DEPTH FOG: far particles = dimmer (distance attenuation) */
        const depthAlpha = lifeAlpha * (1 - p.z * 0.75) * 0.75;
        if (depthAlpha < 0.005) continue;

        /* PARALLAX: near particles shift more on mouse move (disabled during collapse) */
        const parallaxStrength = isLoading ? (1 - p.z) * 30 : 0;
        const drawX = p.x + mx * parallaxStrength;
        const drawY = p.y + my * parallaxStrength;

        /* DEPTH SCALE: near = large, far = tiny */
        const depthScale = 1 - p.z * 0.72;
        const drawSize   = Math.max(0.3, p.baseSize * depthScale);

        ctx.globalAlpha = depthAlpha;
        ctx.beginPath();
        ctx.arc(drawX, drawY, drawSize, 0, TAU);
        ctx.fillStyle = `rgb(${p.colorR},${p.colorG},${p.colorB})`;
        ctx.fill();
      }

      /* ── FLASH PHASE: expanding radial gold supernova from center ── */
      if (isFlash) {
        const elapsed   = Date.now() - collapseStartRef.current;
        const flashProg = Math.max(0, Math.min(1, (elapsed - 700) / 500));
        const glowR     = flashProg * Math.max(W, H);
        const alpha     = 0.35 * (1 - flashProg);
        if (alpha > 0.002 && glowR > 0) {
          ctx.globalCompositeOperation = 'source-over';
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
          grad.addColorStop(0,   `rgba(197,160,89,${alpha})`);
          grad.addColorStop(0.3, `rgba(197,160,89,${alpha * 0.4})`);
          grad.addColorStop(1,   'transparent');
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, glowR, 0, TAU);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    raf = requestAnimationFrame(frame);

    const onResize = () => resize();
    const onMove   = (e) => {
      mouseRef.current = {
        x: e.clientX / (window.innerWidth  || 1),
        y: e.clientY / (window.innerHeight || 1),
      };
    };

    window.addEventListener('resize',    onResize, { passive: true });
    window.addEventListener('mousemove', onMove,   { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize',    onResize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  /* ── Progress counter (React manages this, Canvas ignores it) ─────── */
  useEffect(() => {
    let v = 0;

    /* Speed curve: fast burst start, deliberate slowdown near 65, crawl to 100.
       Total time: ~4.2 seconds to reach 100%. */
    const speed = () =>
      v > 82 ? Math.random() * 0.7 + 0.15    // 82-100%: crawl — build anticipation
      : v > 60 ? Math.random() * 2.5 + 0.5   // 60-82%:  slow — the dramatic pause
      : Math.random() * 7.0 + 1.8;            // 0-60%:   fast — immediate progress feel

    const id = setInterval(() => {
      v = Math.min(v + speed(), 100);
      setPct(Math.floor(v));
      if (v >= 100) {
        clearInterval(id);
        /* Mark the collapse start time BEFORE the state update
           so the canvas loop reads the correct timestamp immediately */
        collapseStartRef.current = Date.now();
        setPhase('collapse');
        /* After 700ms collapse completes → flash phase */
        setTimeout(() => {
          setPhase('flash');
          /* After 500ms flash → done */
          setTimeout(() => {
            setPhase('done');
            setTimeout(onDone, 80);
          }, 500);
        }, 700);
      }
    }, 50);

    return () => clearInterval(id);
  }, [onDone]);

  /* Derived booleans for cleaner JSX logic */
  const isCollapsing = phase === 'collapse' || phase === 'flash';
  const isCollapse   = phase === 'collapse';
  const isFlash      = phase === 'flash';

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
     React manages: the phase-driven UI shell.
     Canvas manages: every particle pixel.
     Neither crosses into the other's domain.
  ──────────────────────────────────────────────────────────────────────── */
  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          className="ldr-screen"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >

          {/* ── LAYER 0: Particle Canvas (all visual depth work happens here) ── */}
          <canvas ref={canvasRef} className="ldr-canvas" />

          {/* ── LAYER 1: Deep ambient glow (far depth plane) ── */}
          <motion.div
            className="ldr-glow-far"
            animate={isCollapsing
              ? { scale: 0, opacity: 0 }
              : { scale: [1, 1.18, 1], opacity: [0.12, 0.28, 0.12] }
            }
            transition={isCollapsing
              ? { duration: 0.55, ease: [0.76, 0, 0.24, 1] }
              : { duration: 5, repeat: Infinity, ease: 'easeInOut' }
            }
          />

          {/* ── LAYER 2: Mid ambient glow (mid depth plane) ── */}
          <motion.div
            className="ldr-glow-mid"
            animate={isCollapsing
              ? { scale: 0, opacity: 0 }
              : { scale: [1.05, 0.95, 1.05], opacity: [0.08, 0.18, 0.08] }
            }
            transition={isCollapsing
              ? { duration: 0.45, ease: [0.76, 0, 0.24, 1] }
              : { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }
            }
          />

          {/* ── LAYER 3: Horizontal scan line ── */}
          {!isCollapsing && (
            <motion.div
              className="ldr-scanline"
              animate={{ y: ['-8vh', '108vh'] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'linear', repeatDelay: 1.5 }}
            />
          )}

          {/* ── LAYER 4: Four corner frame brackets ──
              During collapse they converge inward toward the center. */}
          {[
            { top: 40,    left: 40  },
            { top: 40,    right: 40 },
            { bottom: 40, left: 40  },
            { bottom: 40, right: 40 },
          ].map((pos, i) => (
            <motion.div
              key={i}
              className="ldr-corner"
              style={{
                ...pos,
                borderTop:    i < 2      ? '1px solid rgba(197,160,89,0.22)' : 'none',
                borderBottom: i >= 2     ? '1px solid rgba(197,160,89,0.22)' : 'none',
                borderLeft:   i % 2 ===0 ? '1px solid rgba(197,160,89,0.22)' : 'none',
                borderRight:  i % 2 ===1 ? '1px solid rgba(197,160,89,0.22)' : 'none',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={isCollapsing
                ? {
                  opacity: 0, scale: 0,
                  x: i % 2 === 0 ?  50 : -50,
                  y: i < 2       ?  50 : -50,
                }
                : { opacity: 1, scale: 1, x: 0, y: 0 }
              }
              transition={isCollapsing
                ? { duration: 0.45, ease: [0.76, 0, 0.24, 1] }
                : { delay: 0.4 + i * 0.08, duration: 0.9, ease: [0.16, 1, 0.3, 1] }
              }
            />
          ))}

          {/* ── LAYER 5: Center content ── */}
          <motion.div
            className="ldr-center"
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
          >

            {/* ── LOGO: Three concentric rings at different perceived depths.
                Rotation speed inversely correlates with perceived distance:
                · Near ring: fast (6s)  — pulls toward viewer
                · Mid ring: medium (12s)
                · Far ring: slow (22s)  — recedes into background
                This is perceptual depth — not geometric depth.
                During collapse: all rings contract to zero simultaneously.
                During flash: the entire logo wrap scales up and fades out.  */}
            <motion.div
              className="ldr-logo-wrap"
              animate={isFlash
                ? { scale: 3.5, opacity: 0 }
                : { scale: 1, opacity: 1 }
              }
              transition={isFlash
                ? { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
                : {}
              }
            >

              {/* Far ring — slowest, faintest, largest perceived distance */}
              <motion.div
                className="ldr-ring ldr-ring-far"
                animate={isCollapse
                  ? { rotate: 360, scale: 0, opacity: 0 }
                  : { rotate: 360, scale: [1, 1.04, 1] }
                }
                transition={isCollapse
                  ? { duration: 0.6, ease: [0.76, 0, 0.24, 1] }
                  : {
                    rotate: { duration: 22, repeat: Infinity, ease: 'linear' },
                    scale:  { duration: 4,  repeat: Infinity, ease: 'easeInOut' },
                  }
                }
              />

              {/* Mid ring — medium speed, counter-rotates for depth tension */}
              <motion.div
                className="ldr-ring ldr-ring-mid"
                animate={isCollapse
                  ? { rotate: -360, scale: 0, opacity: 0 }
                  : { rotate: -360 }
                }
                transition={isCollapse
                  ? { duration: 0.55, ease: [0.76, 0, 0.24, 1] }
                  : { duration: 12, repeat: Infinity, ease: 'linear' }
                }
              />

              {/* Near ring — fastest, brightest, closest perceived depth */}
              <motion.div
                className="ldr-ring ldr-ring-near"
                animate={isCollapse
                  ? { rotate: 360, scale: 0, opacity: 0 }
                  : { rotate: 360 }
                }
                transition={isCollapse
                  ? { duration: 0.5, ease: [0.76, 0, 0.24, 1] }
                  : { duration: 6, repeat: Infinity, ease: 'linear' }
                }
              />

              {/* Logo disc — the gravitational center.
                  During collapse: grows its gold glow as rings + particles arrive.
                  During flash: expands and fades (supernova).                    */}
              <motion.div
                className="ldr-logo-disc"
                initial={{ boxShadow: '0 0 0px rgba(197,160,89,0)' }}
                animate={
                  isFlash
                  ? { scale: 2, opacity: 0, boxShadow: '0 0 160px rgba(197,160,89,1), 0 0 300px rgba(197,160,89,0.5)' }
                  : isCollapse
                  ? { scale: 1.12, boxShadow: '0 0 60px rgba(197,160,89,0.8), 0 0 120px rgba(197,160,89,0.4)', opacity: 1 }
                  : { scale: 1, boxShadow: '0 0 0px rgba(197,160,89,0)', opacity: 1 }
                }
                transition={
                  isFlash    ? { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
                  : isCollapse ? { duration: 0.7, ease: 'easeOut' }
                  : {}
                }
              >
                <motion.img
                  src={logoImage}
                  alt="Haroon's Weddings & Events"
                  className="ldr-logo-img"
                  initial={{ opacity: 0, scale: 0.55 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  onError={e => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                  }}
                />
                {/* Fallback letter if logo image fails to load */}
                <motion.span
                  className="ldr-logo-fallback"
                  initial={{ opacity: 0, scale: 0.55 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 1 }}
                  style={{ display: 'none' }}
                >
                  H
                </motion.span>
              </motion.div>
            </motion.div>

            {/* ── BRAND NAME: Letter-by-letter stagger reveal.
                Each character animates up independently, creating a
                typewriter-on-spring effect.
                During collapse: the entire brand moves upward and fades
                into the logo above it.                                   */}
            <motion.div
              className="ldr-brand"
              animate={isCollapsing
                ? { opacity: 0, y: -24, scale: 0.85 }
                : { opacity: 1,  y: 0,  scale: 1 }
              }
              transition={isCollapsing
                ? { duration: 0.4, ease: [0.76, 0, 0.24, 1] }
                : { duration: 0 }
              }
            >
              <div className="ldr-brand-name">
                {BRAND_CHARS.map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.55 + i * 0.07,
                      duration: 0.75,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{ display: 'inline-block' }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>
              <motion.div
                className="ldr-brand-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.25, duration: 0.9 }}
              >
                Weddings &amp; Events
              </motion.div>
            </motion.div>

            {/* ── GOLD DIVIDER — expands from center on entry, contracts on collapse ── */}
            <motion.div
              className="ldr-divider"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={isCollapsing
                ? { scaleX: 0, opacity: 0 }
                : { scaleX: 1, opacity: 1 }
              }
              transition={isCollapsing
                ? { duration: 0.35, ease: [0.76, 0, 0.24, 1] }
                : { delay: 0.8, duration: 1.1, ease: [0.16, 1, 0.3, 1] }
              }
            />

            {/* ── PROGRESS TRACK ── */}
            <motion.div
              className="ldr-progress-wrap"
              initial={{ opacity: 0 }}
              animate={isCollapsing
                ? { opacity: 0, y: 16, scale: 0.9 }
                : { opacity: 1, y: 0,  scale: 1 }
              }
              transition={isCollapsing
                ? { duration: 0.35, ease: [0.76, 0, 0.24, 1] }
                : { delay: 0.95, duration: 0.6 }
              }
            >
              <div className="ldr-progress-track">
                {/* Progress fill bar with glowing leading edge */}
                <div className="ldr-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="ldr-progress-labels">
                <span className="ldr-pct">{String(pct).padStart(3, '0')}</span>
                <span className="ldr-tagline">Est. 1990 · Kerala</span>
              </div>
            </motion.div>

            {/* ── STATUS TEXT: breathing pulse during load, vanishes on collapse ── */}
            <motion.div
              className="ldr-status"
              animate={isCollapsing
                ? { opacity: 0, y: 8 }
                : { opacity: [0.2, 0.7, 0.2] }
              }
              transition={isCollapsing
                ? { duration: 0.25 }
                : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {phase === 'loading' ? 'Preparing your experience' : ''}
            </motion.div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
