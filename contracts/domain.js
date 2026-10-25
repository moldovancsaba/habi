/* Pure reference rules shared by the prototype and contract tests. No network or credentials. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HabigoalDomain=api;})(typeof window==='undefined'?this:window,function(){
'use strict';
const metrics=['energy','sleep','focus','mood','load'];
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
function dayKey(at,timeZone='Europe/Budapest'){
 if(!validTime(at))throw new Error('INVALID_TIME');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
function compare(a,b){return Date.parse(a.at)-Date.parse(b.at)||String(a.id).localeCompare(String(b.id),'en');}
function dailyProjection(events,timeZone='Europe/Budapest'){
 const groups=new Map();
 for(const e of events){if(!['checkin','checkinResult'].includes(e.type)||!e.sessionId||!e.playerId||!validTime(e.at))continue;
  const k=JSON.stringify([e.tenantId||'',e.playerId,e.sessionId]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);
 }
 const daily=new Map();
 for(const es of groups.values()){
  es.sort(compare);const results=es.filter(e=>e.type==='checkinResult');const result=results.at(-1)||null;
  const anchor=result||es.at(-1),date=dayKey(anchor.at,anchor.timeZone||timeZone);
  const answers=new Map();
  if(result){for(const a of result.answers||[]){if(metrics.includes(a.metric))answers.set(a.metric,{...result,...a,type:'checkin',resultId:result.id});}}
  else {for(const a of es){if(a.type==='checkin'&&metrics.includes(a.metric))answers.set(a.metric,a);}}
  const entry={date,tenantId:anchor.tenantId||null,playerId:anchor.playerId,sessionId:anchor.sessionId,complete:Boolean(result),result,anchor,answers:[...answers.values()],methodVersion:'daily-v1'};
  const key=JSON.stringify([entry.tenantId,entry.playerId,date]),previous=daily.get(key);
  // Completed snapshots win over partial sessions; ties are stable across all views.
  if(!previous||(entry.complete&&!previous.complete)||(entry.complete===previous.complete&&compare(entry.anchor,previous.anchor)>0))daily.set(key,entry);
 }
 return [...daily.values()].sort((a,b)=>compare(b.anchor,a.anchor));
}
function authorize(actor,action,r,now=Date.now()){
 if(!actor||!r||!actor.tenantId||actor.tenantId!==r.tenantId||actor.status!=='active'||r.restricted||r.deletedAt)return false;
 if(!actor.appApproved||!['player','parent','coach'].includes(actor.role))return false;
 const membership=actor.memberships?.some(m=>m.tenantId===r.tenantId&&m.status==='active'&&m.role===actor.role&&(actor.role==='coach'||m.playerId===r.playerId)&&(!m.expiresAt||Date.parse(m.expiresAt)>now));
 if(!membership)return false;
 if(action==='interpret')return actor.role!=='player'&&authorize(actor,'read',r,now);
 if(action==='publish'||action==='reviewKnowledge'||action==='reviewInterpretation'||action==='manageLinks')return actor.role==='coach';
 if(action==='correct')return actor.role==='coach'||r.recordedBy?.actorId===actor.actorId;
 if(action==='export')return false; // Separate verified privacy-request procedure, never normal read permission.
 if(action==='write')return actor.role!=='player'||r.playerId===actor.playerId;
 if(action!=='read')return false;
 if(actor.role==='coach')return true;
 if(actor.role==='player')return r.playerId===actor.playerId&&r.sharingClass==='player_direct';
 if(r.sharingClass==='player_direct'||r.sharingClass==='parent_shared')return true;
 return r.sharingClass==='coach'&&r.publication?.status==='active'&&r.publication.resourceRevision===r.revision;
}
function canUseSources(actor,sources,now=Date.now()){return sources.length>0&&sources.every(s=>authorize(actor,'read',s,now));}
const jobTransitions={queued:['leased','cancelled'],leased:['running','queued','failed','cancelled'],running:['queued','awaiting_review','succeeded','failed','cancelled'],awaiting_review:['succeeded','failed','cancelled'],succeeded:[],failed:[],cancelled:[]};
const publicJobState={queued:'queued',leased:'processing',running:'processing',awaiting_review:'review',succeeded:'ready',failed:'failed',cancelled:'cancelled'};
function transitionJob(job,to,{fence,now=Date.now(),authorized=false,sourceRevisionsMatch=false}={}){
 if(!authorized||!sourceRevisionsMatch)throw new Error('JOB_CONTEXT_INVALID');
 if(!jobTransitions[job.status]?.includes(to))throw new Error('INVALID_TRANSITION');
 if(['leased','running'].includes(job.status)&&(fence!==job.fence||Date.parse(job.leaseUntil)<=now))throw new Error('STALE_LEASE');
 return {...job,status:to,revision:job.revision+1};
}
function releasePayload(payload,templates,{environment="production"}={}){
 const keys=['topic','generalQuestion','requestedOutput','verifiedGeneralReferences','language','schemaVersion'];
 if(!payload||Object.keys(payload).sort().join('|')!==keys.sort().join('|'))throw new Error('OUTBOUND_RELEASE_BLOCKED');
 const template=templates.find(t=>t.status==='approved'&&(t.scope==='production_reviewed'||(environment==='test'&&t.scope==='synthetic_contract_fixture_only'))&&t.topic===payload.topic&&t.generalQuestion===payload.generalQuestion&&t.requestedOutput===payload.requestedOutput);
 if(!template||payload.language!=='hu'||payload.schemaVersion!==1||JSON.stringify(payload.verifiedGeneralReferences)!==JSON.stringify(template.verifiedGeneralReferences))throw new Error('OUTBOUND_RELEASE_BLOCKED');
 return JSON.parse(JSON.stringify(payload));
}
function retrieve(knowledge,{tenantId,topic,language='hu',sport,ageBand,maxItems=5,maxChars=8000}){
 if(!tenantId||!topic||!Number.isInteger(maxItems)||maxItems<1||maxItems>5||maxChars<1||maxChars>8000)throw new Error('INVALID_RETRIEVAL_SCOPE');
 const candidates=knowledge.filter(k=>k.tenantId===tenantId&&k.status==='active'&&k.privacyChecked&&k.rightsChecked&&k.evidenceChecked&&k.language===language&&k.topics.includes(topic)&&(!k.sports.length||k.sports.includes(sport))&&(!k.ageBands.length||k.ageBands.includes(ageBand))&&!k.excluded);
 candidates.sort((a,b)=>(b.priority||0)-(a.priority||0)||b.version-a.version||String(a.id).localeCompare(String(b.id),'en'));
 const out=[];let chars=0;
 for(const k of candidates){const size=JSON.stringify(k).length;if(out.length>=maxItems)break;if(chars+size>maxChars)continue;out.push(k);chars+=size;}
 return out;
}
function verifyClaim(claim,sources,trustedReviews=[]){
 if(!claim||!['direct','general','inference'].includes(claim.kind)||!Array.isArray(claim.evidenceRefs)||!claim.evidenceRefs.length)return false;
 const linked=claim.evidenceRefs.map(ref=>sources.find(s=>s.id===ref.id&&s.revision===ref.revision&&s.status==='verified'));
 if(linked.some(x=>!x))return false;
 if(claim.kind==='direct')return linked.some(s=>Array.isArray(s.facts)&&s.facts.some(f=>f.text===claim.text));
 // A source ID is not entailment. Free paraphrase and inference need an explicit reviewer result.
 return trustedReviews.some(review=>review.claimId===claim.id&&review.claimText===claim.text&&JSON.stringify(review.evidenceRefs)===JSON.stringify(claim.evidenceRefs)&&review.status==='approved'&&Boolean(review.actorId)&&Boolean(review.rationale));
}
return Object.freeze({metrics,dayKey,dailyProjection,authorize,canUseSources,jobTransitions,publicJobState,transitionJob,releasePayload,retrieve,verifyClaim});
});
