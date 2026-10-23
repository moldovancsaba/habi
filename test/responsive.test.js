import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const seed=JSON.parse(readFileSync('server/content-seed.json'));
function setup(initial={},initialMode='mobile'){
 const saved={...initial},elements={},listeners={},frames=new Map();let mode=initialMode,frame=0;
 const element=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',hidden:false,scrollTop:0,setAttribute(){},querySelector(){return null},close(){this.open=false},showModal(){this.open=true}});
 const c={localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v},document:{title:'HABI',documentElement:{},body:{dataset:{experience:'responsive'},classList:{toggle(){}}},getElementById:element,querySelector:()=>null},window:{addEventListener:(name,fn)=>listeners[name]=fn},getComputedStyle:()=>({getPropertyValue:()=>mode}),navigator:{},Date,Math,requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame},cancelAnimationFrame:id=>frames.delete(id),scrollTo(){},cloudSchedule(){},cloudStart(){},habiText:k=>seed.messages[k],habiData:k=>structuredClone(seed.data[k])};
 vm.createContext(c);for(const file of ['layout.js','ui.js','habi.js','support.js','trends.js','monthly.js','journeys.js','guided-chat.js','experience.js','follow-through.js','habi2.js','responsive.js','app.js'])vm.runInContext(readFileSync(file,'utf8'),c);
 return {run:s=>vm.runInContext(s,c),elements,saved,resize(next){mode=next;listeners.resize();const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())}};
}
test('one URL selects desktop HABI and mobile HABI2 from the CSS mode',()=>{
 const x=setup({},'desktop');assert.equal(x.elements.nav.hidden,false);assert.equal(x.elements['h2-dock'].hidden,true);assert(!x.elements.app.innerHTML.includes('h2-thread'));
 x.resize('mobile');assert.equal(x.elements.nav.hidden,true);assert.equal(x.elements['h2-dock'].hidden,false);assert(x.elements.app.innerHTML.includes('h2-thread'));
 x.resize('desktop');assert.equal(x.elements.nav.hidden,false);assert(!x.elements.app.innerHTML.includes('h2-thread'));
});
test('daily answers and shared text draft survive resizing and reload in the other layout',()=>{
 const x=setup();x.run("h2Route('daily');choose(1);h2Draft('Szeretnék pihenni')");x.resize('desktop');assert.equal(x.run('step'),1);assert.equal(x.run('answers.mood'),1);assert.equal(x.run('db.chatInput'),'Szeretnék pihenni');
 const y=setup(x.saved,'desktop');assert.equal(y.run('page'),'check');assert.equal(y.run('step'),1);assert.equal(y.run('answers.mood'),1);y.resize('mobile');assert(y.elements['h2-dock'].innerHTML.includes('Szeretnék pihenni'));
});
test('monthly reasons, exact chat session and practice context survive switching renderers',()=>{
 const x=setup();x.run("h2Route('monthly');monthlyAnswer('not_applicable');monthlyAnswer('skip')");x.resize('desktop');assert.equal(x.run('db.monthlyDraft.step'),2);x.resize('mobile');assert.equal(x.run('db.monthlyDraft.reasons[0]'),'not_applicable');
 x.run("h2Topic('dreams');guidedChoose(habiSession.current.options[0].id)");const session=x.run('JSON.stringify(habiSession)');x.resize('desktop');assert.equal(x.run('JSON.stringify(habiSession)'),session);x.resize('mobile');assert.equal(x.run('JSON.stringify(habiSession)'),session);
 x.run("h2Route('practice')");const context=x.run('JSON.stringify(supportPage)');x.resize('desktop');assert.equal(x.run('JSON.stringify(supportPage)'),context);
});
test('legacy mobile workspace migrates and old URLs redirect to the unified app',()=>{
 const x=setup();x.run("h2Route('daily');choose(2);delete db.uiWorkspace;delete db.uiLayoutVersion;db.habi2.input='korábbi üzenet';delete db.chatInput;save()");const y=setup(x.saved,'desktop');assert.equal(y.run('page'),'check');assert.equal(y.run('answers.mood'),2);assert.equal(y.run('db.chatInput'),'korábbi üzenet');
 const config=JSON.parse(readFileSync('vercel.json'));for(const path of ['/habi2','/habi2.html'])assert(config.redirects.some(r=>r.source===path&&r.destination==='/'));
});
