import { createHash,randomBytes } from 'node:crypto';
export const COOKIE='__Host-habi-session';
export function ownerSession(cookie=''){
 const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const existing=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);const secret=existing?token:randomBytes(32).toString('hex');
 return {owner:createHash('sha256').update(secret).digest('hex'),cookie:existing?null:COOKIE+'='+secret+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000',existing};
}
export function validPayload(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!payload.app||typeof payload.app!=='object'||Array.isArray(payload.app))return false;
 let visited=0;
 function check(v,depth){if(++visited>150000||depth>35)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);if(typeof v==='string')return v.length<=20000;if(Array.isArray(v))return v.length<=20000&&v.every(e=>check(e,depth+1));if(v&&typeof v==='object')return Object.entries(v).every(([k,e])=>!['__proto__','constructor','prototype'].includes(k)&&!k.startsWith('$')&&check(e,depth+1));return false}
 return check(payload,0)&&Buffer.byteLength(JSON.stringify(payload))<=2000000;
}
export async function readState(db,owner){const doc=await db.collection('habi_states').findOne({_id:owner},{projection:{_id:0,payload:1,revision:1}});return doc||{payload:null,revision:0}}
export async function writeState(db,owner,revision,payload){
 const collection=db.collection('habi_states');
 if(revision===0){try{await collection.insertOne({_id:owner,revision:1,payload,createdAt:new Date(),updatedAt:new Date()});return {revision:1}}catch(error){if(error.code===11000)return null;throw error}}
 const result=await collection.updateOne({_id:owner,revision},{$set:{payload,updatedAt:new Date()},$inc:{revision:1}});return result.matchedCount?{revision:revision+1}:null;
}
