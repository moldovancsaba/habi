import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const seed=JSON.parse(readFileSync('server/content-seed.json'));
function setup(initial={},initialMode='desktop'){
 const {document}=parseHTML('<html><head><title>HABI</title></head><body data-experience="responsive"><aside id="sync-state"></aside><header id="h2-header"></header><main id="app"></main><nav id="nav" class="nav"></nav><footer id="h2-dock"></footer><dialog id="h2-menu"></dialog><p id="h2-status"></p></body></html>');
 document.getElementById('h2-menu').close=function(){this.open=false};const saved={...initial},listeners={};let mode=initialMode;
 const c={document,window:{addEventListener:(name,fn)=>listeners[name]=fn},localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v},getComputedStyle:()=>({getPropertyValue:()=>mode}),navigator:{},Date,Math,requestAnimationFrame:()=>1,cancelAnimationFrame(){},scrollTo(){},cloudSchedule(){},cloudStart(){},habiText:k=>{assert(k in seed.messages,k);return seed.messages[k]},habiData:k=>{assert(k in seed.data,k);return structuredClone(seed.data[k])}};
 vm.createContext(c);for(const file of ['layout.js','ui.js','habi.js','support.js','trends.js','monthly.js','journeys.js','guided-chat.js','experience.js','follow-through.js','habi2.js','desktop.js','responsive.js','app.js'])vm.runInContext(readFileSync(file,'utf8'),c);
 return {run:s=>vm.runInContext(s,c),document,saved,resize(value){mode=value;vm.runInContext('draw()',c)}};
}
test('desktop shell exposes all original navigation plus settings, with one active item',()=>{
 const x=setup(),nav=x.document.querySelector('#nav');assert.equal(nav.querySelectorAll('.desktop-nav-links>button').length,4);assert(x.document.querySelector('.desktop-grid'));assert(x.document.querySelector('.desktop-secondary').textContent.includes(seed.data.desktop_v1.labels.discover));assert(!x.document.querySelector('#app .page-utilities'));
 x.run("go('settings')");assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);assert(nav.querySelector('[aria-current="page"]').textContent.includes(seed.data.experience_v1.labels.settings));
});
test('desktop adds context without changing daily snapshots, form or five-icon result format',()=>{
 const x=setup();x.run('start()');assert(x.document.querySelector('.desktop-focused .assessment-card'));assert(!x.document.querySelector('.desktop-grid'));
 for(let i=0;i<7;i++)x.run('choose(null)');const snapshot=x.run('JSON.stringify(latest())');assert.equal(x.document.querySelectorAll('.desktop-primary .result-metric').length,5);assert(x.document.querySelector('.desktop-primary #athlete-note'));assert(x.document.querySelector('.desktop-secondary').textContent.includes(seed.data.desktop_v1.explanations.empty));assert.equal(x.run('JSON.stringify(latest())'),snapshot);
 x.resize('mobile');assert(!x.document.querySelector('.desktop-grid'));assert(!x.document.querySelector('.desktop-workspace'));assert(x.document.querySelector('#h2-dock textarea'));
 x.resize('desktop');assert.equal(x.run('JSON.stringify(latest())'),snapshot);assert.equal(x.document.querySelectorAll('.desktop-primary #athlete-note').length,1);
});
test('desktop diary selects real dates, retains exact shared report content and never alters records',()=>{
 const x=setup();x.run("openProgress('diary')");const dates=x.run('desktopDates()'),date=dates[1];const snapshot=x.run('JSON.stringify(db.checkins)');x.run('desktopSelectDate('+JSON.stringify(date)+')');assert(x.document.querySelector('.desktop-primary').textContent.includes(date));assert.equal(x.document.querySelectorAll('.desktop-date-list [aria-pressed="true"]').length,1);assert.equal(x.document.querySelectorAll('.desktop-primary .result-metric').length,5);assert.equal(x.run('JSON.stringify(db.checkins)'),snapshot);const e=x.run('dailyEntry('+JSON.stringify(date)+')');assert(x.document.querySelector('.desktop-primary').textContent.includes(e.report.summary));
 const y=setup(x.saved);assert(y.document.querySelector('.desktop-primary').textContent.includes(date));
});
test('desktop chat preserves input, topics, starters and the exact active conversation across layouts',()=>{
 const x=setup();x.run("go('habi')");assert(x.document.querySelector('.desktop-primary #guided-input'));assert.equal(x.document.querySelectorAll('.desktop-secondary button[onclick^="guidedSelectTree"]').length,7);assert(x.document.querySelector('.desktop-secondary .starter-situations'));
 x.run("guidedSelectTree('dreams');guidedChoose(habiSession.current.options[0].id)");assert(x.document.querySelector('.desktop-chat-log'));assert(x.document.querySelector('#desktop-input'));const snapshot=x.run('JSON.stringify(habiSession)');x.run("desktopDraft('<b>My own words</b>');draw()");assert.equal(x.run('db.chatInput'),'<b>My own words</b>');assert(x.document.querySelector('#desktop-input').innerHTML.includes('&lt;b&gt;'));assert(!x.document.querySelector('#desktop-input b'));
 x.resize('mobile');assert(x.document.querySelector('#h2-input').innerHTML.includes('&lt;b&gt;'));x.resize('desktop');assert.equal(x.run('JSON.stringify(habiSession)'),snapshot);assert.equal(x.run('db.chatInput'),'<b>My own words</b>');assert(x.document.querySelector('#desktop-input').innerHTML.includes('&lt;b&gt;'));
});
test('desktop sections render all existing tools without empty main columns or duplicate IDs',()=>{
 const x=setup();for(const action of ["go('tasks')","go('library')","openProgress('overview')","openProgress('monthly')","openMonthly()","go('settings')","go('reflections')","openPractice('focus',null)","go('home')"]){x.run(action);const app=x.document.querySelector('#app');assert(app.textContent.trim(),action);const primary=app.querySelector('.desktop-primary');if(primary)assert(primary.textContent.trim(),action);const ids=[...app.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size,action)}
});

test('no-training day has no scored load and detail labels come from pinned questions',()=>{const x=setup();x.run('start();choose(1);choose(1);choose(1);choose(1);choose(4);choose(0)');assert.equal(x.run('page'),'result');assert.equal(x.run('actual(latest(),"load")'),null);const before=x.run('JSON.stringify(latest())');const oldLabel=x.run("latest().questions.find(q=>q[0]==='sleep')[2][1]");x.run("questions.find(q=>q[0]==='sleep')[2][1]='A changed catalogue label';draw()");assert(x.document.querySelector('.desktop-secondary').textContent.includes(oldLabel));assert(x.document.querySelector('.desktop-secondary').textContent.includes(seed.data.desktop_v1.labels.noTraining));assert.equal(x.run('JSON.stringify(latest())'),before)});

test('desktop counters use the selected period and one canonical record per date',()=>{const x=setup();x.run("openProgress('diary')");const previousDone=x.document.querySelector('.desktop-period-counts').querySelectorAll('strong')[1].textContent;x.run("db.checkins.push({id:42,date:'2000. 01. 01.',answers:{}});db.tasks.push({checkin:42,done:true});openProgress('diary')");const days=x.run('desktopDates().filter(date=>!!dailyEntry(date)).length');const counts=x.document.querySelector('.desktop-period-counts');assert.equal(Number(counts.querySelector('strong').textContent),days);assert.equal(counts.querySelectorAll('strong')[1].textContent,previousDone)});
