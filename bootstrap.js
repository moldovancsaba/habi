// Browser theme metadata follows the same CSS palette as the interface.
const browserTheme=document.querySelector('meta[name=theme-color]');if(browserTheme)browserTheme.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--page').trim());
window.habiText=function(key){const value=window.habiCatalog?.messages?.[key];if(typeof value!=='string')throw new Error('Content unavailable');return value};
window.habiData=function(key){const value=window.habiCatalog?.data?.[key];if(value===undefined)throw new Error('Content unavailable');return JSON.parse(JSON.stringify(value))};
(async function boot(){
 try{const response=await fetch('/api/app',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('unavailable');const remote=await response.json();window.habiCatalog=remote.catalog;window.habiBootstrap=remote;
  // Load only executable UI/behaviour from the repository; all content is already fetched.
  await loadScript('/cloud.js');let localApp,localChat;try{localApp=JSON.parse(localStorage.getItem('habi-app-v1'));localChat=JSON.parse(localStorage.getItem('habi-chat-v1'))}catch{}
  const local=localApp?{app:localApp,chat:localChat||null}:null,dirty=localStorage.getItem('habi-cloud-dirty')==='1';let chosen=remote.payload;
  if(!remote.payload)chosen=local;if(remote.payload&&local&&dirty)chosen=mergeCloud(remote.payload,local,null);
  if(chosen){localStorage.setItem('habi-app-v1',JSON.stringify(chosen.app));localStorage.setItem('habi-chat-v1',JSON.stringify(chosen.chat||null))}
  for(const path of ['/ui.js','/habi.js','/support.js','/trends.js','/monthly.js','/journeys.js','/guided-chat.js','/experience.js','/follow-through.js',...(document.body.dataset.experience==='habi2'?['/habi2.js']:document.body.dataset.experience==='responsive'?['/habi2.js','/desktop.js','/responsive.js']:[]),'/app.js'])await loadScript(path);
 }catch{document.getElementById('app').setAttribute('aria-busy','false');document.getElementById('app').innerHTML='<section class="card"><div class="ey">HABI</div><h1>Most nem tudok kapcsolódni.</h1><p>Próbáld meg újra egy kicsit később.</p><button class="btn" onclick="location.reload()">Újrapróbálom</button></section>'}
 function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script)})}
})();
