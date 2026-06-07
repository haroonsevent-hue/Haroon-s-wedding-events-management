/**
 * IntroVideo.jsx — Haroon's Weddings & Events
 *
 * Cinematic false-3D intro animation sequence.
 *
 * Pipeline:
 *  - WebGL2 canvas with custom GLSL shaders (no Three.js overhead)
 *  - Perlin / Simplex / Curl noise driving all organic motion
 *  - Voronoi fields for animated petal/cell background pattern
 *  - Bezier curves for ribbon/streamer paths
 *  - Signed Distance Functions (SDF) for arch silhouette + ring overlays
 *  - Fractal (Mandelbrot-like) bokeh depth layer
 *  - Flow Fields from curl noise for 512-particle steering
 *  - Spring physics (Framer Motion) for camera-parallax + UI reveal
 *  - False 3D: z-depth drives scale / alpha / parallax per-particle
 *  - Additive WebGL blending (gl.ONE)
 *  - Mouse parallax (all layers offset by cursor position)
 *
 * Act timeline (~8s):
 *   act1 (0-2s)   : void bloom — Voronoi petals emerge from dark, fractal bokeh
 *   act2 (2-4s)   : camera pull — wedding arch SDF silhouette fades in
 *   act3 (4-6s)   : brand reveal — SDF rings + staggered letter animation
 *   act4 (6-7.5s) : fireworks — curl-noise ribbons + particle burst
 *   exit (7.5-8s) : implosion — all elements converge → cross-fade to Loader
 *
 * ⚠️  DOES NOT REPLACE LOADER.JSX
 *     This runs BEFORE the existing Loader. Sequence: IntroVideo → Loader → Site.
 *
 * Usage:
 *   import IntroVideo from './IntroVideo';
 *   <IntroVideo onDone={() => setStage('loader')} />
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Brand palette ─────────────────────────────────────────────────────── */
const GOLD   = [0.773, 0.627, 0.349];   // #C5A059
const CREAM  = [1.0,   0.973, 0.929];   // #F8F8ED
const TAU    = 6.283185307179586;
const N_PARTICLES = 512;

/* ═══════════════════════════════════════════════════════════════════════
   GLSL — Background full-screen quad
   All organic math lives here: Perlin, Simplex, Voronoi, Curl,
   Bezier, SDF, Fractal, FBM — driving the atmosphere layer.
═══════════════════════════════════════════════════════════════════════ */
const VERT_BG = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_BG = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_phase;
uniform float u_progress;
uniform vec2  u_res;
uniform vec2  u_mouse;

in  vec2 v_uv;
out vec4 fragColor;

/* ---- Hash & noise primitives ----------------------------------------- */
vec2 hash2(vec2 p){
  p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

// Gradient Perlin noise
float perlin(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(dot(hash2(i+vec2(0,0)),f-vec2(0,0)),
                 dot(hash2(i+vec2(1,0)),f-vec2(1,0)),u.x),
             mix(dot(hash2(i+vec2(0,1)),f-vec2(0,1)),
                 dot(hash2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);
}

// Fractal Brownian Motion — 6 octaves, rotated domain
float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 R = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ v+=a*perlin(p); p=R*p; a*=0.5; }
  return v;
}

// Simplex-like 2D noise
float simplex(vec2 p){
  const float K1=0.366025404, K2=0.211324865;
  vec2 i=floor(p+(p.x+p.y)*K1);
  vec2 a=p-i+(i.x+i.y)*K2;
  vec2 o=(a.x>a.y)?vec2(1,0):vec2(0,1);
  vec2 b=a-o+K2, c=a-1.0+2.0*K2;
  vec3 h=max(0.5-vec3(dot(a,a),dot(b,b),dot(c,c)),0.0);
  vec3 n=h*h*h*h*vec3(dot(a,hash2(i)),dot(b,hash2(i+o)),dot(c,hash2(i+1.0)));
  return dot(n,vec3(70.0));
}

// Voronoi — animated cell pattern for petal field
vec2 voronoi(vec2 p){
  vec2 n=floor(p), f=fract(p);
  float md=8.0; vec2 mp=vec2(0);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g=vec2(float(i),float(j));
    vec2 o=0.5+0.5*sin(u_time*0.4+6.2831*hash2(n+g));
    vec2 r=g+o-f; float d=dot(r,r);
    if(d<md){ md=d; mp=n+g+o; }
  }
  return vec2(sqrt(md), hash(mp));
}

// Curl noise (divergence-free from Perlin)
vec2 curlNoise(vec2 p){
  float e=0.001;
  float n1=perlin(p+vec2(0,e)),  n2=perlin(p-vec2(0,e));
  float n3=perlin(p+vec2(e,0)),  n4=perlin(p-vec2(e,0));
  return vec2((n1-n2)/(2.0*e), -(n3-n4)/(2.0*e));
}

// SDF helpers
float sdBox(vec2 p,vec2 b,float r){
  vec2 q=abs(p)-b;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;
}
float sdRing(vec2 p,float r,float t){ return abs(length(p)-r)-t; }

// Quadratic Bezier distance-squared
float bezierDist(vec2 p,vec2 p0,vec2 p1,vec2 p2){
  vec2 a=p1-p0, b=p0-2.0*p1+p2, c=p0-p;
  float t2=clamp(-(dot(a,b)+dot(c,a))/(dot(b,b)+dot(a,a)),0.0,1.0);
  vec2 q=c+(2.0*a+b*t2)*t2;
  return dot(q,q);
}

// Mandelbrot-like fractal for bokeh
float fractal(vec2 c){
  vec2 z=vec2(0); float i;
  for(i=0.0;i<20.0;i++){
    if(dot(z,z)>4.0) break;
    z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+c;
  }
  return i/20.0;
}

/* ---- Main ------------------------------------------------------------ */
void main(){
  vec2 asp = vec2(u_res.x/u_res.y, 1.0);
  vec2 suv = (v_uv - 0.5) * asp;
  float t=u_time, ph=u_phase, pg=u_progress;

  // Mouse parallax
  vec2 par = (u_mouse-0.5)*asp * 0.04;

  // -- Act 1: Voronoi petal field --
  vec2 vor = voronoi((suv-par)*3.2 + vec2(t*0.05,t*0.03));
  float petalEdge = 1.0-smoothstep(0.0,0.32,vor.x);
  float petalIn   = smoothstep(0.0,1.0, ph<1.0 ? pg : 1.0);
  float petalMask = petalIn * petalEdge;

  // FBM atmospheric fog
  float fog = fbm((suv+vec2(t*0.02,-t*0.015))*1.8)*0.5+0.5;

  // Fractal bokeh
  vec2 fc = suv*0.55 + vec2(cos(t*0.07)*0.1, sin(t*0.11)*0.1);
  float bk = fractal(fc*2.0-vec2(0.4,0.0));
  float bokeh = smoothstep(0.5,0.88,bk)*0.18;

  // -- Act 2: Arch silhouette SDF --
  float archSDF = sdBox(suv, vec2(0.18,0.5), 0.05);
  float archTop = 0.42 - suv.y;
  float arch    = smoothstep(0.01,-0.01,max(archSDF,-archTop));
  float archFade= smoothstep(0.1,0.7, ph>=1.0 ? pg : 0.0);

  // -- Act 3: SDF rings + ribbon --
  float r1    = sdRing(suv, 0.22, 0.002);
  float r2    = sdRing(suv-par*0.4, 0.31, 0.0015);
  float rings = smoothstep(0.004,0.0,r1)+smoothstep(0.003,0.0,r2);
  float rFade = smoothstep(0.0,0.5, ph>=2.0 ? pg : 0.0);

  float rib = bezierDist(suv, vec2(-0.5,0.22+sin(t*0.3)*0.08),
                               vec2(0.0,-0.08), vec2(0.5,0.22));
  float ribbon = exp(-rib*750.0)*0.55;

  // -- Act 4: Curl flow sparkles --
  vec2 flow = curlNoise((suv+vec2(t*0.1))*2.0);
  float flowMag = length(flow);
  float flowField = smoothstep(0.28,0.0,flowMag)*smoothstep(0.0,0.5,ph>=3.0?pg:0.0);
  float spark = simplex(suv*13.0+vec2(t*0.9))*0.5+0.5;
  spark = pow(spark,5.0)*flowField*2.2;

  // -- Composite --
  vec3 base = vec3(0.035,0.082,0.053);

  vec3 petalCol = mix(vec3(0.31,0.25,0.14), vec3(0.80,0.70,0.40), vor.y*0.3+0.7);
  base = mix(base, petalCol, petalMask*0.5);
  base += vec3(0.65,0.55,0.28)*bokeh;
  base += vec3(0.02,0.07,0.04)*fog*0.35;
  base = mix(base, vec3(0.96,0.95,0.91)*0.88, arch*archFade);
  base += vec3(0.773,0.627,0.349)*rings*rFade*0.85;
  base += vec3(0.92,0.85,0.68)*ribbon*rFade;
  base += vec3(0.773,0.627,0.349)*spark*1.1;

  // Vignette
  float vig = 1.0-dot(suv,suv)*1.15;
  base *= max(vig,0.0);

  // Exit fade
  float fade = ph>=4.0 ? max(0.0,1.0-pg) : 1.0;
  base *= fade;

  fragColor = vec4(base, fade);
}`;

/* ═══════════════════════════════════════════════════════════════════════
   GLSL — Particle system (WebGL POINTS)
   Curl noise flow field drives organic streaks.
   False depth via z attribute → scale + alpha + size.
═══════════════════════════════════════════════════════════════════════ */
const VERT_PT = `#version 300 es
precision highp float;

in vec2  a_pos;
in float a_z;
in float a_life;
in float a_hue;

uniform float u_time;
uniform vec2  u_res;
uniform float u_phase;
uniform float u_progress;

out float v_alpha;
out vec3  v_col;

float hash(float n){ return fract(sin(n)*43758.5453); }
float noise2(vec2 p){
  vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i.x+i.y*57.0),hash(i.x+1.0+i.y*57.0),u.x),
             mix(hash(i.x+(i.y+1.0)*57.0),hash(i.x+1.0+(i.y+1.0)*57.0),u.x),u.y);
}

void main(){
  float t=u_time, ph=u_phase, pg=u_progress;

  // Curl-noise displacement
  float e=0.01;
  float nx1=noise2(a_pos*2.0+vec2(0,e)+t*0.12);
  float nx2=noise2(a_pos*2.0-vec2(0,e)+t*0.12);
  float ny1=noise2(a_pos*2.0+vec2(e,0)+t*0.12);
  float ny2=noise2(a_pos*2.0-vec2(e,0)+t*0.12);
  vec2 curl=vec2((nx1-nx2)/(2.0*e),-(ny1-ny2)/(2.0*e));

  // Exit: converge to center
  float pull = ph>=4.0 ? pg*pg : 0.0;
  vec2  disp = mix(curl*0.28, -a_pos, pull);

  // Depth
  float ds = 1.0-a_z*0.70;

  // Life fade
  float fin  = smoothstep(0.0,0.15,a_life);
  float fout = 1.0-smoothstep(0.72,1.0,a_life);
  v_alpha = ds*(1.0-a_z*0.75)*fin*fout*(ph>=3.0?1.0:0.45);

  // Color: warm gold spectrum
  v_col = vec3(0.773+a_hue*0.14, 0.627-a_hue*0.10, 0.349+a_hue*0.18);

  vec2 p = a_pos + disp*0.28;
  p.x *= u_res.y/u_res.x;
  gl_Position  = vec4(p, 0.0, 1.0);
  gl_PointSize = max(1.0, ds*4.2)*(u_res.y/600.0);
}`;

const FRAG_PT = `#version 300 es
precision mediump float;
in  float v_alpha;
in  vec3  v_col;
out vec4  fragColor;
void main(){
  vec2 c=gl_PointCoord-0.5;
  float disc=1.0-smoothstep(0.3,0.5,length(c));
  fragColor=vec4(v_col, v_alpha*disc);
}`;

/* ── WebGL helpers ──────────────────────────────────────────────────────── */
function compileShader(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    console.error('[IntroVideo]', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function makeProgram(gl, vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER,   vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

function makeVAO(gl, prog, buffers){
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  for(const [name, { data, size, dynamic }] of Object.entries(buffers)){
    const loc = gl.getAttribLocation(prog, name);
    if(loc < 0) continue;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  return vao;
}

/* ── Particle initialisation ────────────────────────────────────────────── */
function buildParticles(){
  const N   = N_PARTICLES;
  const pos  = new Float32Array(N*2);
  const z    = new Float32Array(N);
  const life = new Float32Array(N);
  const hue  = new Float32Array(N);
  for(let i=0;i<N;i++){
    const th = Math.random()*TAU;
    const r  = 0.25 + Math.random()*0.75;
    pos[i*2]   = Math.cos(th)*r;
    pos[i*2+1] = Math.sin(th)*r;
    z[i]    = Math.random();
    life[i] = Math.random();  // stagger birth
    hue[i]  = (Math.random()-0.5)*0.55;
  }
  return { pos, z, life, hue };
}

/* ── Brand chars ────────────────────────────────────────────────────────── */
const L1 = "HAROON'S".split('');
const L2 = 'WEDDINGS & EVENTS'.split('');

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function IntroVideo({ onDone }) {
  const canvasRef  = useRef(null);
  const mouseRef   = useRef({ x: 0.5, y: 0.5 });
  const phaseRef   = useRef(0);
  const progRef    = useRef(0);
  const glState    = useRef({});   // holds WebGL objects across renders

  const [phase,   setPhase]   = useState(0);
  const [show,    setShow]    = useState(true);

  /* ── Act timeline ─────────────────────────────────────────────────── */
  useEffect(() => {
    const DURATIONS = [2000, 2000, 2000, 1500, 800];
    let act = 0, start = Date.now();

    const id = setInterval(() => {
      const pg = Math.min((Date.now()-start)/DURATIONS[act], 1.0);
      progRef.current = pg;
      if(pg >= 1.0 && act < 4){
        act++; start = Date.now();
        phaseRef.current = act;
        setPhase(act);
        if(act === 4){
          setTimeout(() => {
            setShow(false);
            setTimeout(() => { if(onDone) onDone(); }, 100);
          }, DURATIONS[4] + 50);
        }
      }
    }, 16);
    return () => clearInterval(id);
  }, [onDone]);

  /* ── WebGL engine ─────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const gl = canvas.getContext('webgl2',{
      alpha:true, premultipliedAlpha:false,
      antialias:false, powerPreference:'high-performance',
    });
    if(!gl){ console.warn('[IntroVideo] WebGL2 unavailable — CSS fallback active'); return; }

    // -- Background program --
    const bgProg = makeProgram(gl, VERT_BG, FRAG_BG);
    if(!bgProg) return;
    const quadData = new Float32Array([-1,-1,1,-1,-1,1,1,1]);
    const bgVAO = gl.createVertexArray();
    gl.bindVertexArray(bgVAO);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(bgProg,'a_pos');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);

    // -- Particle program --
    const ptProg = makeProgram(gl, VERT_PT, FRAG_PT);
    if(!ptProg) return;
    const pd = buildParticles();
    const N  = N_PARTICLES;

    // Bind particle VAO manually to keep lifeBuf reference
    const ptVAO  = gl.createVertexArray();
    gl.bindVertexArray(ptVAO);
    function attrib(name, data, sz, dyn){
      const loc = gl.getAttribLocation(ptProg, name);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, dyn?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
      if(loc>=0){ gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,sz,gl.FLOAT,false,0,0); }
      return buf;
    }
    attrib('a_pos', pd.pos,  2, false);
    attrib('a_z',   pd.z,    1, false);
    const lifeBuf = attrib('a_life', pd.life, 1, true);
    attrib('a_hue', pd.hue,  1, false);
    gl.bindVertexArray(null);

    // Cache uniforms
    function uni(prog, n){ return gl.getUniformLocation(prog, n); }
    const bgU = {
      time:uni(bgProg,'u_time'), phase:uni(bgProg,'u_phase'),
      prog:uni(bgProg,'u_progress'), res:uni(bgProg,'u_res'), mouse:uni(bgProg,'u_mouse'),
    };
    const ptU = {
      time:uni(ptProg,'u_time'), phase:uni(ptProg,'u_phase'),
      prog:uni(ptProg,'u_progress'), res:uni(ptProg,'u_res'),
    };

    let W=0, H=0;
    function resize(){
      W = canvas.width  = canvas.offsetWidth  * Math.min(devicePixelRatio,2);
      H = canvas.height = canvas.offsetHeight * Math.min(devicePixelRatio,2);
      gl.viewport(0,0,W,H);
    }
    resize();

    const t0 = performance.now();
    let raf;

    function frame(now){
      raf = requestAnimationFrame(frame);
      const t  = (now-t0)*0.001;
      const ph = phaseRef.current;
      const pg = progRef.current;

      // Advance particle life
      for(let i=0;i<N;i++){
        pd.life[i] += 0.003 + (1-pd.z[i])*0.002;
        if(pd.life[i]>1.0) pd.life[i]=0.0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, lifeBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pd.life);

      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);

      // BG: normal blending
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(bgProg);
      gl.uniform1f(bgU.time, t); gl.uniform1f(bgU.phase, ph);
      gl.uniform1f(bgU.prog, pg);
      gl.uniform2f(bgU.res, W, H);
      gl.uniform2f(bgU.mouse, mouseRef.current.x, mouseRef.current.y);
      gl.bindVertexArray(bgVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);

      // Particles: additive blending
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(ptProg);
      gl.uniform1f(ptU.time, t); gl.uniform1f(ptU.phase, ph);
      gl.uniform1f(ptU.prog, pg);
      gl.uniform2f(ptU.res, W, H);
      gl.bindVertexArray(ptVAO);
      gl.drawArrays(gl.POINTS,0,N);
      gl.bindVertexArray(null);
    }

    raf = requestAnimationFrame(frame);

    const onR = ()=>resize();
    const onM = e=>{ mouseRef.current={x:e.clientX/innerWidth, y:e.clientY/innerHeight}; };
    window.addEventListener('resize',   onR, {passive:true});
    window.addEventListener('mousemove',onM, {passive:true});

    return ()=>{
      cancelAnimationFrame(raf);
      window.removeEventListener('resize',   onR);
      window.removeEventListener('mousemove',onM);
      gl.deleteProgram(bgProg);
      gl.deleteProgram(ptProg);
    };
  }, []);

  /* ── Derived ────────────────────────────────────────────────────────── */
  const isAct3 = phase >= 2;
  const isAct4 = phase >= 3;
  const isExit = phase >= 4;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="iv-root"
          exit={{ opacity:0 }}
          transition={{ duration:0.55, ease:[0.76,0,0.24,1] }}
          style={styles.root}
        >
          {/* WebGL canvas */}
          <canvas ref={canvasRef} style={styles.canvas} aria-hidden="true" />

          {/* CSS fallback glow (visible if WebGL unavailable) */}
          <div style={styles.fallback} aria-hidden="true" />

          {/* Center stage */}
          <div style={styles.center}>

            {/* Outer SDF-style ring */}
            <motion.div
              style={styles.ringOuter}
              initial={{ scale:0, opacity:0, rotate:-45 }}
              animate={isAct3 ? { scale:isExit?3:1, opacity:isExit?0:1, rotate:0 } : { scale:0, opacity:0 }}
              transition={{ duration:1.2, ease:[0.16,1,0.3,1] }}
            />

            {/* Inner ring */}
            <motion.div
              style={styles.ringInner}
              initial={{ scale:0, opacity:0 }}
              animate={isAct3 ? { scale:isExit?0:1, opacity:isExit?0:0.55 } : { scale:0, opacity:0 }}
              transition={{ duration:0.9, ease:[0.16,1,0.3,1], delay:0.25 }}
            />

            {/* Logo emblem */}
            <motion.div
              style={styles.logoDisc}
              initial={{ scale:0, opacity:0 }}
              animate={isAct3 ? { scale:isExit?2.2:1, opacity:isExit?0:1 } : { scale:0.1, opacity:0 }}
              transition={{ duration:1.0, ease:[0.16,1,0.3,1] }}
            >
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none"
                aria-label="Haroon's monogram">
                <circle cx="26" cy="26" r="25" stroke="rgba(197,160,89,0.55)" strokeWidth="0.8"/>
                <text x="26" y="36" textAnchor="middle"
                  fontFamily="'Playfair Display',serif" fontSize="30"
                  fill="#C5A059" letterSpacing="-1">H</text>
              </svg>
            </motion.div>

            {/* Brand name — letter stagger */}
            <motion.div
              style={styles.brandRow}
              initial={{ opacity:0 }}
              animate={{ opacity: isExit ? 0 : 1 }}
              transition={{ duration:0.3 }}
            >
              {isAct3 && L1.map((ch,i)=>(
                <motion.span key={i} style={styles.letter}
                  initial={{ opacity:0, y:28, rotateX:-60 }}
                  animate={{ opacity:1, y:0, rotateX:0 }}
                  transition={{ delay:i*0.06, duration:0.7, ease:[0.16,1,0.3,1] }}
                >{ch}</motion.span>
              ))}
            </motion.div>

            {/* Divider */}
            <motion.div style={styles.divider}
              initial={{ scaleX:0 }}
              animate={isAct3 ? { scaleX:isExit?0:1 } : { scaleX:0 }}
              transition={{ delay:0.55, duration:0.8, ease:[0.16,1,0.3,1] }}
            />

            {/* Sub-brand line */}
            <motion.div style={styles.subRow}
              initial={{ opacity:0, y:10 }}
              animate={isAct3 ? { opacity:isExit?0:1, y:0 } : { opacity:0, y:10 }}
              transition={{ delay:0.75, duration:0.85, ease:[0.16,1,0.3,1] }}
            >
              {L2.map((ch,i)=>(
                <motion.span key={i} style={styles.subLetter}
                  initial={{ opacity:0 }}
                  animate={{ opacity:1 }}
                  transition={{ delay:0.8+i*0.035, duration:0.45 }}
                >{ch===" "?"\u00A0":ch}</motion.span>
              ))}
            </motion.div>

            {/* Est. line */}
            <motion.div style={styles.since}
              initial={{ opacity:0 }}
              animate={isAct3 ? { opacity:isExit?0:0.6 } : { opacity:0 }}
              transition={{ delay:1.15, duration:0.7 }}
            >Est. 1989 · Kerala</motion.div>

            {/* Act4 burst */}
            {isAct4 && !isExit && (
              <motion.div style={styles.burst}
                initial={{ scale:0, opacity:0 }}
                animate={{ scale:[0,1.6,2.8], opacity:[0,0.55,0] }}
                transition={{ duration:1.4, ease:'easeOut', times:[0,0.35,1] }}
              />
            )}
          </div>

          {/* Corner brackets */}
          {[
            {top:'3%', left:'3%',   borderTop:'1px solid rgba(197,160,89,0.3)', borderLeft:'1px solid rgba(197,160,89,0.3)'},
            {top:'3%', right:'3%',  borderTop:'1px solid rgba(197,160,89,0.3)', borderRight:'1px solid rgba(197,160,89,0.3)'},
            {bottom:'3%', left:'3%',  borderBottom:'1px solid rgba(197,160,89,0.3)', borderLeft:'1px solid rgba(197,160,89,0.3)'},
            {bottom:'3%', right:'3%', borderBottom:'1px solid rgba(197,160,89,0.3)', borderRight:'1px solid rgba(197,160,89,0.3)'},
          ].map((s,i)=>(
            <motion.div key={i}
              style={{ position:'fixed', width:36, height:36, ...s }}
              initial={{ opacity:0, scale:0 }}
              animate={{ opacity:isExit?0:1, scale:1 }}
              transition={{ delay:0.15+i*0.09, duration:0.7, ease:[0.16,1,0.3,1] }}
            />
          ))}

          {/* Skip */}
          <motion.button
            onClick={()=>{ setShow(false); setTimeout(()=>onDone&&onDone(),80); }}
            style={styles.skip}
            initial={{ opacity:0 }}
            animate={{ opacity:0.45 }}
            transition={{ delay:1.8, duration:0.7 }}
            whileHover={{ opacity:1 }}
            aria-label="Skip intro"
          >SKIP</motion.button>

        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Inline styles (avoids CSS import dependency) ──────────────────────── */
const styles = {
  root:     { position:'fixed', inset:0, zIndex:9999, background:'#070f0a',
              display:'flex', alignItems:'center', justifyContent:'center',
              overflow:'hidden' },
  canvas:   { position:'absolute', inset:0, width:'100%', height:'100%', display:'block' },
  fallback: { position:'absolute', inset:0,
              background:'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(197,160,89,0.07) 0%, transparent 70%),radial-gradient(ellipse 120% 100% at 50% 100%, rgba(10,46,34,0.9) 0%, #060e09 100%)',
              pointerEvents:'none' },
  center:   { position:'relative', zIndex:2,
              display:'flex', flexDirection:'column', alignItems:'center',
              gap:10, perspective:900 },
  ringOuter:{ position:'absolute',
              width:230, height:230, borderRadius:'50%',
              border:'1.5px solid rgba(197,160,89,0.32)',
              animation:'iv-cw 20s linear infinite',
              pointerEvents:'none' },
  ringInner:{ position:'absolute',
              width:165, height:165, borderRadius:'50%',
              border:'1px solid rgba(197,160,89,0.18)',
              borderTopColor:'rgba(197,160,89,0.65)',
              animation:'iv-ccw 11s linear infinite',
              pointerEvents:'none' },
  logoDisc: { width:104, height:104, borderRadius:'50%',
              background:'radial-gradient(circle,rgba(197,160,89,0.10) 0%,rgba(10,46,34,0.8) 70%)',
              border:'1px solid rgba(197,160,89,0.38)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 48px rgba(197,160,89,0.12), inset 0 0 24px rgba(197,160,89,0.04)' },
  brandRow: { display:'flex', gap:1, marginTop:18, letterSpacing:'0.22em' },
  letter:   { fontFamily:"'Playfair Display',Georgia,serif",
              fontSize:'clamp(1.8rem,5vw,3rem)', fontWeight:400,
              color:'#C5A059', display:'inline-block',
              textShadow:'0 0 32px rgba(197,160,89,0.38)' },
  divider:  { width:128, height:1,
              background:'linear-gradient(90deg,transparent,#C5A059,transparent)',
              transformOrigin:'center', margin:'2px 0' },
  subRow:   { display:'flex', gap:0 },
  subLetter:{ fontFamily:"'Lato','Helvetica Neue',sans-serif",
              fontSize:'clamp(0.52rem,1.4vw,0.72rem)', fontWeight:300,
              color:'rgba(197,160,89,0.7)', letterSpacing:'0.3em', textTransform:'uppercase' },
  since:    { fontFamily:"'Lato',sans-serif", fontSize:'0.62rem',
              color:'rgba(197,160,89,0.48)', letterSpacing:'0.2em',
              textTransform:'uppercase', marginTop:4 },
  burst:    { position:'absolute', width:104, height:104, borderRadius:'50%',
              background:'radial-gradient(circle,rgba(197,160,89,0.58) 0%,transparent 70%)',
              pointerEvents:'none' },
  skip:     { position:'fixed', bottom:28, right:28,
              fontFamily:"'Lato',sans-serif", fontSize:'0.68rem',
              letterSpacing:'0.2em', color:'rgba(197,160,89,0.6)',
              background:'none', cursor:'pointer', padding:'7px 14px',
              border:'1px solid rgba(197,160,89,0.2)', borderRadius:2,
              transition:'color 0.3s,border-color 0.3s' },
};
