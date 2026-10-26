// Local drafts are a recoverable buffer; MongoDB is the durable source.
let cloudReady=false,cloudBusy=false,cloudTimer,cloudRevision=0,cloudBase=null,cloudDirty=false;
function cloneState(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function equalState(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function mergeCloud(remote,local,base){
 if(equalState(local,base))return cloneState(remote);if(equalState(remote,base)||equalState(remote,local))return cloneState(local);
 if(Array.isArray(remote)&&Array.isArray(local)){
  const recordKey=v=>v&&typeof v==='object'&&!Array.isArray(v)?v.id!==undefined?'id:'+v.id:v.checkin!==undefined?'checkin:'+v.checkin:null:null;
  if([...remote,...local].every(v=>recordKey(v)!==null)){const r=new Map(remote.map(v=>[recordKey(v),v])),l=new Map(local.map(v=>[recordKey(v),v])),b=new Map((Array.isArray(base)?base:[]).map(v=>[recordKey(v),v]));return [...new Set([...r.keys(),...l.keys()])].map(k=>!l.has(k)?r.get(k):!r.has(k)?l.get(k):mergeCloud(r.get(k),l.get(k),b.get(k))).sort((a,b)=>(b.id||0)-(a.id||0))}return cloneState(local)
 }
 if(remote&&local&&typeof remote==='object'&&typeof local==='object'&&!Array.isArray(remote)&&!Array.isArray(local)){const out={};for(const k of new Set([...Object.keys(remote),...Object.keys(local)])){if(!Object.hasOwn(local,k)){if(!base||!Object.hasOwn(base,k))out[k]=cloneState(remote[k]);continue}if(!Object.hasOwn(remote,k)){if(!base||!Object.hasOwn(base,k)||!equalState(local[k],base[k]))out[k]=cloneState(local[k]);continue}const v=mergeCloud(remote[k],local[k],base?.[k]);if(v!==undefined)out[k]=v}return out}return cloneState(local)
}
function cloudSnapshot(){return {app:cloneState(db),chat:cloneState(habiSession||null)}}
function cloudSchedule(){cloudDirty=true;try{localStorage.setItem('habi-cloud-dirty','1')}catch{}if(!cloudReady)return;clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,450)}
function cloudWarning(show){const target=document.getElementById('sync-state');if(!target)return;target.hidden=!show;if(show)target.innerHTML='<p>A legutóbbi módosításaid még nincsenek elmentve.</p><button class="btn" type="button" onclick="cloudFlush()">Mentés újrapróbálása</button>'}
async function cloudFlush(){
 if(!cloudReady||cloudBusy||!cloudDirty)return;cloudBusy=true;let sent=cloudSnapshot();
 try{let response=await fetch('/api/app',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:cloudRevision,payload:sent}),signal:AbortSignal.timeout(15000)});
  if(response.status===409){const latestResponse=await fetch('/api/app',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!latestResponse.ok)throw new Error('sync');const latest=await latestResponse.json(),live=cloudSnapshot(),merged=mergeCloud(latest.payload,live,cloudBase);db=merged.app;habiSession=merged.chat;localStorage.setItem(K,JSON.stringify(db));localStorage.setItem(HABI_KEY,JSON.stringify(habiSession));cloudRevision=latest.revision;cloudBase=latest.payload;sent=cloudSnapshot();response=await fetch('/api/app',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:cloudRevision,payload:sent}),signal:AbortSignal.timeout(15000)})}
  if(!response.ok)throw new Error('sync');const result=await response.json();cloudRevision=result.revision;cloudBase=sent;cloudDirty=!equalState(cloudSnapshot(),sent);localStorage.setItem('habi-cloud-dirty',cloudDirty?'1':'0');cloudWarning(false);
 }catch{cloudDirty=true;cloudWarning(true)}finally{cloudBusy=false;if(cloudDirty&&navigator.onLine!==false){clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,15000)}}
}
function cloudStart(){cloudRevision=window.habiBootstrap.revision;cloudBase=window.habiBootstrap.payload;cloudReady=true;cloudSchedule();window.addEventListener('online',cloudFlush);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&cloudDirty&&!cloudBusy)cloudFlush()});}
