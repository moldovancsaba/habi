import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync,readdirSync}from'node:fs';
const css=readFileSync('global.css','utf8');
function components(){const c={};vm.createContext(c);vm.runInContext(readFileSync('ui.js','utf8'),c);return s=>vm.runInContext(s,c)}
function rgb(hex){return hex.match(/[a-f0-9]{2}/gi).map(s=>{const v=parseInt(s,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})}
function contrast(a,b){const light=h=>rgb(h).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const x=light(a),y=light(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('shared components preserve safe text, action attributes, semantic state and metric geometry',()=>{const run=components();const b=run(`uiButton('<unsafe>',"go('tasks')",{secondary:true,pressed:true})`);assert(b.includes('&lt;unsafe&gt;'));assert(b.includes('aria-pressed="true"'));assert(b.includes('type="button"'));assert(b.includes('btn habi-choice'));assert(!b.includes('reply-choice'));assert(run("uiChoice('Answer',null,{pressed:true})").includes('btn habi-choice reply-choice'));assert(!run("uiButton('Action',null)").includes('reply-choice'));assert(run("uiButton('x',null,{disabled:true})").includes(' disabled'));assert(run("uiCard('Title','<p>Body</p>',{heading:1})").includes('<h1>Title</h1>'));assert(run("uiNavItem('habi','HABI',true,null)").includes('aria-current="page"'));for(let k=0;k<5;k++)for(let n=1;n<=4;n++)assert(run(`visual(${k},${n})`).includes('viewBox="0 0 64 64"'));});
test('text and action token combinations meet 4.5:1 contrast on application surfaces',()=>{const token=k=>{const v=css.match(new RegExp('--'+k+':\\s*(#[a-f0-9]+)'))?.[1];assert(v,k);return v.length===4?'#'+v.slice(1).split('').map(c=>c+c).join(''):v};for(const foreground of ['text','text-muted','primary','error'])for(const background of ['surface','page','surface-soft','primary-soft'])assert(contrast(token(foreground),token(background))>=4.5,`${foreground}/${background}`);assert(contrast(token('surface'),token('primary'))>=4.5);});
test('all client surfaces use the canonical stylesheet and contain no inline visual styles',()=>{for(const name of readdirSync('.').filter(f=>/\.(html|js)$/.test(f))){const text=readFileSync(name,'utf8');assert(!/\bstyle\s*=\s*['"]/.test(text),name);assert(!/\.style\s*(?:[.\[]|=)/.test(text),name);if(name.endsWith('.html')){assert(text.includes('href="/global.css"'),name);assert(!text.includes('<style'),name)}}assert(!css.includes('.journey-card .btn'));assert(!css.includes('.habi-.'));assert(!css.includes('.submission-status'));assert(css.includes('.field-error'));assert(css.includes('prefers-reduced-motion'));});

test('presentation audit includes catalog HTML, SVG attributes, manifest colours and theme metadata',()=>{
 const catalog=JSON.parse(readFileSync('server/content-seed.json'));
 const clients=readdirSync('.').filter(f=>/\.(html|js)$/.test(f));
 const strings=[];
 const visit=(v,path)=>{if(typeof v==='string')strings.push([path,v]);else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v))visit(x,path+'.'+k)};
 visit(catalog,'catalog');
 const forbidden=/\b(?:style|align|bgcolor|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|text-anchor|font-size|font-family|font-weight)\s*=\s*["']/i;
 for(const [name,text]of [...clients.map(n=>[n,readFileSync(n,'utf8')]),...strings]){
  assert(!forbidden.test(text),name+' contains a presentation attribute');
  assert(!/<style\b/i.test(text),name+' contains a style block');
  assert(!/\.style\s*(?:[.\[]|=)|setAttribute\(\s*['"]style['"]|insertRule\s*\(|cssText\s*=/.test(text),name+' mutates presentation');
  assert(!/#[a-f\d]{3}(?:[a-f\d]{3})?\b/i.test(text),name+' duplicates a palette literal');
 }
 for(const file of clients.filter(n=>n.endsWith('.html'))){const links=[...readFileSync(file,'utf8').matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(links,['/global.css'],file)}
 const manifest=JSON.parse(readFileSync('manifest.webmanifest'));assert(!('theme_color'in manifest));assert(!('background_color'in manifest));
 assert(!/text-align\s*:\s*(?:center|right)/.test(css));
});
