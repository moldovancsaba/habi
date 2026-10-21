import { readFile } from 'node:fs/promises';
import { missingCatalogKeys } from '../server/content.js';
import { database,safeDatabaseError } from '../server/database.js';
import { ownerSession,validPayload,readState,writeState } from '../server/store.js';
let seedPromise;
async function content(db){
 const seed=await (seedPromise||=(readFile(new URL('../server/content-seed.json',import.meta.url),'utf8').then(JSON.parse)));
 const col=db.collection('habi_content');await col.updateOne({_id:'active'},{$setOnInsert:{...seed,createdAt:new Date()}},{upsert:true});
 let doc=await col.findOne({_id:'active'},{projection:{_id:0,createdAt:0}});const missing={...missingCatalogKeys(seed.messages,doc.messages,'messages'),...missingCatalogKeys(seed.data,doc.data,'data')};
 if(Object.keys(missing).length){await col.updateOne({_id:'active'},{$set:missing});doc=await col.findOne({_id:'active'},{projection:{_id:0,createdAt:0}})}
 return doc;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','PUT'].includes(req.method)){res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'METHOD_NOT_ALLOWED'})}
 if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'ORIGIN_REJECTED'});
 const session=ownerSession(req.headers.cookie);
 if(req.method==='PUT'){
  const origin=req.headers.origin;const host=req.headers.host;
  if(!session.existing||!origin||origin!=='https://'+host||!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(403).json({error:'ORIGIN_REJECTED'});
  if(!req.body||!Number.isInteger(req.body.revision)||req.body.revision<0||!validPayload(req.body.payload))return res.status(400).json({error:'INVALID_STATE'});
 }
 try{
  const db=await database();
  if(req.method==='GET'){const [catalog,state]=await Promise.all([content(db),readState(db,session.owner)]);if(session.cookie)res.setHeader('Set-Cookie',session.cookie);return res.status(200).json({catalog,...state})}
  const result=await writeState(db,session.owner,req.body.revision,req.body.payload);if(!result)return res.status(409).json({error:'REVISION_CONFLICT'});return res.status(200).json(result);
 }catch(error){const code=safeDatabaseError(error);console.error('habi_storage',{code});return res.status(503).json({error:code})}
}
