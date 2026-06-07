'use client';
import{useEffect,useRef,useCallback}from'react';

// ============================================================
// IntroVideo.jsx — Haroon's Weddings & Events
// Cinematic false-3D intro: clipmasters-style product reveal
// Pure WebGL2 + custom GLSL — no Three.js, static-host safe
// DO NOT REPLACE THE EXISTING LOADER
// ============================================================

// ---------- GLSL NOISE LIBRARY (inline) ----------
const NOISE_GLSL=`
// --- Permutation hash ---
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}

// Simplex 3D
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  return 42.*dot(m*m*m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// Curl noise (divergence-free)
vec3 curlNoise(vec3 p){
  float e=.1;
  float n1=snoise(vec3(p.x,p.y+e,p.z))-snoise(vec3(p.x,p.y-e,p.z));
  float n2=snoise(vec3(p.x,p.y,p.z+e))-snoise(vec3(p.x,p.y,p.z-e));
  float n3=snoise(vec3(p.x+e,p.y,p.z))-snoise(vec3(p.x-e,p.y,p.z));
  float n4=snoise(vec3(p.x,p.y,p.z+e))-snoise(vec3(p.x,p.y,p.z-e));
  float n5=snoise(vec3(p.x+e,p.y,p.z))-snoise(vec3(p.x-e,p.y,p.z));
  float n6=snoise(vec3(p.x,p.y+e,p.z))-snoise(vec3(p.x,p.y-e,p.z));
  return normalize(vec3((n1-n2)/(2.*e),(n3-n4)/(2.*e),(n5-n6)/(2.*e)));
}

// Voronoi
vec2 voronoi(vec2 x){
  vec2 p=floor(x);
  vec2 f=fract(x);
  float res=8.;
  vec2 mr=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 b=vec2(i,j);
    vec2 r=b-f+fract(sin(vec2(dot(p+b,vec2(127.1,311.7)),dot(p+b,vec2(269.5,183.3))))*43758.5453);
    float d=dot(r,r);
    if(d<res){res=d;mr=r;}
  }
  return vec2(sqrt(res),dot(mr,mr));
}

// SDF
float sdArc(vec2 p,float r,float half_a){
  p.x=abs(p.x);
  float k=(half_a<.5)?dot(p,vec2(sin(half_a),cos(half_a))):abs(p.x);
  return length(p)-r+(k<r*sin(half_a)?0.:length(p-r*vec2(sin(half_a),cos(half_a)))-0.);
}
float sdRing(vec2 p,float r,float t){
  return abs(length(p)-r)-t;
}
float sdBox(vec2 p,vec2 b){
  vec2 d=abs(p)-b;
  return length(max(d,0.))+min(max(d.x,d.y),0.);
}

// Fractal (fbm)
float fbm(vec3 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){v+=a*snoise(p);p=p*2.+.5;a*=.5;}
  return v;
}
`;

// ---------- BACKGROUND SHADER ----------
// Voronoi petal field + fractal bokeh depth layer
const BG_VERT=`#version 300 es
in vec2 a;
out vec2 v;
void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}`;

const BG_FRAG=`#version 300 es
precision highp float;
${NOISE_GLSL}
uniform float u_t;
uniform vec2 u_r;
uniform vec2 u_cam;// false-3D camera offset
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy/u_r;
  vec2 p=(uv-.5)*vec2(u_r.x/u_r.y,1.);
  // False-3D parallax on background (deepest layer, slowest)
  p+=u_cam*.015;
  // Voronoi organic petal cells
  vec2 vr=voronoi(p*6.+vec2(u_t*.03,u_t*.02));
  float cell=vr.x;
  // Fractal depth bokeh
  float bk=fbm(vec3(p*2.,u_t*.05))*.5+.5;
  // Base deep forest green
  vec3 bg=mix(vec3(.02,.07,.04),vec3(.04,.12,.07),bk);
  // Voronoi cell edges → faint gold veins
  float veins=smoothstep(.08,.0,cell)*.4;
  bg+=vec3(.77,.62,.35)*veins;
  // Ambient particle glow (radial)
  float glow=exp(-dot(p,p)*3.);
  bg+=vec3(.3,.2,.05)*glow*.3;
  // Vignette
  float vig=1.-dot(uv-.5,uv-.5)*1.8;
  bg*=vig;
  o=vec4(bg,1.);
}`;

// ---------- PARTICLE SHADER (flow field, 512 pts) ----------
const PT_VERT=`#version 300 es
precision highp float;
${NOISE_GLSL}
in vec2 a_seed;// seed XY for this particle
uniform float u_t;
uniform vec2 u_r;
uniform vec2 u_cam;
uniform float u_act;// 0-1 act progress
out float v_alpha;
out float v_size;
out vec3 v_col;
void main(){
  // Flow field position driven by curl noise
  float t2=u_t*.4+a_seed.x*6.283;
  vec3 pos3=vec3(a_seed*3.,t2*.3);
  vec3 curl=curlNoise(pos3);
  // Integrate position over time
  float px=a_seed.x+curl.x*.5+sin(u_t*.2+a_seed.y*3.14)*a_seed.y*.3;
  float py=a_seed.y+curl.y*.5+cos(u_t*.17+a_seed.x*2.71)*a_seed.x*.3;
  // Bezier drift toward center during act reveal
  float reveal=smoothstep(.0,.6,u_act);
  px=mix(px,px*.6,reveal);
  py=mix(py-.5,py*.6,reveal);
  // False-3D: z-depth from simplex noise
  float z=snoise(vec3(a_seed,u_t*.1))*.5+.5;// 0-1
  float parallax=1.+z*.8;
  px=(px+u_cam.x*.04*parallax)/parallax;
  py=(py+u_cam.y*.04*parallax)/parallax;
  // NDC
  float asp=u_r.x/u_r.y;
  gl_Position=vec4(px/asp,py,0,1);
  // Scale and alpha by depth
  v_size=mix(2.,6.,z)*(1.+reveal*.5);
  gl_PointSize=v_size;
  v_alpha=mix(.15,.9,z)*u_act;
  // Color: gold→warm white depending on depth
  v_col=mix(vec3(.77,.62,.35),vec3(1.,.95,.8),z);
}`;

const PT_FRAG=`#version 300 es
precision highp float;
in float v_alpha;
in vec3 v_col;
in float v_size;
out vec4 o;
void main(){
  vec2 uv=gl_PointCoord-.5;
  float d=length(uv);
  if(d>.5)discard;
  // Soft circular glow
  float a=exp(-d*d*12.)*v_alpha;
  o=vec4(v_col,a);
}`;

// ---------- ARCH / RING SDF SHADER ----------
const SDF_VERT=`#version 300 es
in vec2 a;
out vec2 v;
void main(){v=a;gl_Position=vec4(a,0,1);}`;

const SDF_FRAG=`#version 300 es
precision highp float;
${NOISE_GLSL}
uniform float u_t;
uniform vec2 u_r;
uniform float u_arch;// 0-1 arch reveal
uniform float u_rings;// 0-1 rings reveal
uniform float u_brand;// 0-1 brand text reveal
uniform vec2 u_cam;
in vec2 v;
out vec4 o;
void main(){
  vec2 uv=(v*.5+.5);
  float asp=u_r.x/u_r.y;
  vec2 p=v*vec2(asp,1.);
  // Camera parallax on SDF layer (mid-depth)
  p+=u_cam*.025;
  vec4 col=vec4(0.);
  // -- Wedding arch SDF --
  float arch_y=p.y+.2;
  float arch_x=p.x;
  // Arch = top semicircle + two pillars
  float arch_r=.55;
  // Top arc (upper half circle)
  vec2 ap=vec2(arch_x,arch_y-.0);
  float d_arc=sdRing(ap,arch_r,.012);
  float mask_top=step(ap.y,0.);
  float arc_sdf=d_arc*(1.-mask_top);
  // Pillars
  float d_pillarL=sdBox(vec2(arch_x+arch_r,arch_y+.4),vec2(.012,.4));
  float d_pillarR=sdBox(vec2(arch_x-arch_r,arch_y+.4),vec2(.012,.4));
  float d_arch=min(min(arc_sdf,d_pillarL),d_pillarR);
  // Arch reveal: draw outward from center
  float arch_draw=smoothstep(.02,-.002,d_arch)*u_arch;
  // Gold color with noise shimmer
  float shimmer=snoise(vec3(p*8.,u_t*2.))*.3+.7;
  col+=vec4(.77*.8+shimmer*.2,.62*.8,.35*.6,arch_draw*.9);
  // -- Rings --
  vec2 rc1=vec2(-.12,-.18);vec2 rc2=vec2(.12,-.18);
  float r1=sdRing(p-rc1,.16,.014);
  float r2=sdRing(p-rc2,.16,.014);
  float rings_draw=(smoothstep(.015,-.002,r1)+smoothstep(.015,-.002,r2))*u_rings;
  rings_draw=clamp(rings_draw,0.,1.);
  // Ring intersection glow
  float inter=sdRing(p-mix(rc1,rc2,.5),.04,.02);
  float iglow=smoothstep(.04,0.,abs(inter))*u_rings;
  vec4 ring_col=vec4(.9,.8,.4,rings_draw*.95+iglow*.5);
  col=mix(col,ring_col,rings_draw*.6);
  col.a=max(col.a,rings_draw*.95);
  // -- Floating petals (Bezier-approximated via SDF ellipses) --
  for(int i=0;i<8;i++){
    float fi=float(i);
    float ang=fi*.785+u_t*.3+snoise(vec3(fi,0.,u_t*.1))*.5;
    float rad=.5+snoise(vec3(fi*2.,1.,u_t*.07))*.25;
    vec2 pc=vec2(cos(ang)*rad*asp,sin(ang)*rad);
    vec2 pd=(p-pc)*vec2(1./asp,1.);
    float dpetal=length(pd)-.04+snoise(vec3(pd*8.,u_t*.5+fi))*.015;
    float petal_a=smoothstep(.0,-.005,dpetal)*u_arch*.7;
    float hue_shift=snoise(vec3(fi,2.,u_t*.05))*.5;
    col.rgb+=vec3(.9+hue_shift*.2,.7,.4)*petal_a;
    col.a=max(col.a,petal_a*.8);
  }
  o=col;
}`;

// ---------- LENS FLARE / BLOOM SHADER ----------
const BLOOM_FRAG=`#version 300 es
precision highp float;
uniform float u_t;
uniform vec2 u_r;
uniform float u_bloom;
uniform vec2 u_cam;
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy/u_r;
  vec2 p=(uv-.5)*vec2(u_r.x/u_r.y,1.);
  p+=u_cam*.008;
  // Anamorphic lens streak (horizontal)
  float streak=exp(-abs(p.y+.06)*80.)*exp(-p.x*p.x*.3)*.4;
  streak*=u_bloom;
  // Central flare
  float flare=exp(-dot(p,p)*8.)*.6*u_bloom;
  // Chromatic aberration split
  float ca=length(p)*.04;
  vec3 col=vec3(
    streak+flare,
    (streak+flare)*.9,
    (streak+flare)*.6
  );
  col*=vec3(.95,.8,.3);
  // Second smaller flares
  float f2=exp(-dot(p-vec2(.3,.05),p-vec2(.3,.05))*30.)*.2*u_bloom;
  float f3=exp(-dot(p+vec2(.25,.03),p+vec2(.25,.03))*40.)*.15*u_bloom;
  col+=vec3(.8,.6,.2)*(f2+f3);
  o=vec4(col,max(streak,flare)*.6);
}`;

// ---------- JS EASING ----------
const ease={
  outExpo:t=>t===1?1:1-Math.pow(2,-10*t),
  inOutCubic:t=>t<.5?4*t*t*t:(t-1)*(2*t-2)*(2*t-2)+1,
  outBack:t=>{const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)},
  spring:t=>{
    const omega=2*Math.PI*2.5,z=.4;
    return 1-Math.exp(-z*omega*t)*Math.cos(Math.sqrt(1-z*z)*omega*t);
  },
};

// ---------- GLSL COMPILE HELPERS ----------
function makeShader(gl,type,src){
  const s=gl.createShader(type);
  gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    console.error(gl.getShaderInfoLog(s),src.slice(0,200));
    return null;
  }
  return s;
}
function makeProgram(gl,vert,frag){
  const vs=makeShader(gl,gl.VERTEX_SHADER,vert);
  const fs=makeShader(gl,gl.FRAGMENT_SHADER,frag);
  if(!vs||!fs)return null;
  const p=gl.createProgram();
  gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
    console.error(gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
function makeQuad(gl,prog){
  const buf=gl.createBuffer();
  const verts=new Float32Array([-1,-1,1,-1,-1,1,1,1]);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'a');
  return{buf,loc};
}
