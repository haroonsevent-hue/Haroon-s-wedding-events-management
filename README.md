# Haroon's Weddings & Events

> Premium wedding and event management. Est. 1989 · Kerala.

## Architecture

```
Repo root
├── IntroVideo.jsx     ← NEW: Cinematic WebGL intro animation
├── Loader.jsx         ← ORIGINAL: Preloader (unchanged)
├── index.html         ← ORIGINAL: Static site HTML (unchanged)
├── logo.png           ← Brand logo
├── app/
│   ├── layout.jsx     ← Next.js root layout
│   └── page.jsx       ← Sequence: IntroVideo → Loader → Site
├── package.json       ← Next.js 14 + React 18
└── next.config.js     ← Static export config
```

## Intro Animation Pipeline

`IntroVideo.jsx` is a **pure-code WebGL2 cinematic intro** — no video files, no Three.js.

### Noise & Math Techniques
| Technique | Purpose |
|---|---|
| **Gradient Perlin noise** | Base atmospheric texture, particle flow base |
| **FBM (6-octave)** | Multi-scale atmospheric fog |
| **Simplex noise** | High-frequency sparkle layer |
| **Curl noise** | Divergence-free particle flow field (Act 4) |
| **Voronoi fields** | Animated petal/cell background (Act 1) |
| **Bezier curves** | Ribbon/streamer paths |
| **SDF (sdBox, sdRing)** | Wedding arch silhouette, decorative rings |
| **Fractal (Mandelbrot)** | Bokeh depth layer |
| **Flow fields** | Curl-driven particle steering |

### React / Motion Stack
| Library | Role |
|---|---|
| Framer Motion | Spring physics, AnimatePresence, stagger letterpress |
| GSAP (ready) | Timeline orchestration for advanced sequences |
| Lenis (ready) | Smooth scroll after site loads |

### Act Timeline (~8s)
```
Act 1 (0–2s)  : Void bloom — Voronoi petals emerge, fractal bokeh
Act 2 (2–4s)  : Camera pull — Wedding arch SDF silhouette fades in
Act 3 (4–6s)  : Brand reveal — SDF rings + spring-stagger letter animation
Act 4 (6–7.5s): Fireworks — curl-noise ribbons, particle burst
Exit  (7.5–8s): Implosion — particles converge, cross-fade → Loader
```

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to /out
```

For **GitHub Pages**: push to `main`, the static HTML (`index.html`) is served directly by GitHub Pages. The Next.js app is the recommended local dev / deployment path.

## Contact

📍 Near Jamia College, Chembakuth, Edavanna, Kerala 676541  
📞 +91 9037874001 · +91 9567525723  
📧 haroonsevent@gmail.com
