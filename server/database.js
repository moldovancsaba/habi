import { MongoClient } from 'mongodb';
let connection;
export function databaseConfigured(){return Boolean(process.env.habi_mongodb_uri)}
export async function database(){
 if(!databaseConfigured())throw Object.assign(new Error('Database configuration missing'),{safeCode:'DATABASE_NOT_CONFIGURED'});
 if(!connection){const client=new MongoClient(process.env.habi_mongodb_uri,{appName:'habi',maxPoolSize:5,minPoolSize:0,maxIdleTimeMS:60000,serverSelectionTimeoutMS:8000,connectTimeoutMS:8000});connection=client.connect().then(()=>client.db(process.env.MONGODB_DB||'habi')).catch(error=>{connection=null;throw error})}
 return connection;
}
export function safeDatabaseError(error){if(error.safeCode)return error.safeCode;if(error.name==='MongoParseError')return 'DATABASE_URI_INVALID';if(error.code===13)return 'DATABASE_ACCESS_DENIED';if(['ENOTFOUND','ENODATA','ESERVFAIL'].includes(error.code))return 'DATABASE_DNS_FAILED';if(error.code===18)return 'DATABASE_AUTH_FAILED';if(error.name==='MongoServerSelectionError'||error.name==='MongoNetworkError')return 'DATABASE_UNREACHABLE';return 'DATABASE_UNAVAILABLE'}
