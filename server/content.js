// Add new content fields without replacing values already edited in MongoDB.
export function missingCatalogKeys(seed,current,prefix=''){
 const missing={};
 for(const [key,value]of Object.entries(seed)){
  const path=prefix?prefix+'.'+key:key;
  if(current?.[key]===undefined)missing[path]=value;
  else if(value&&typeof value==='object'&&!Array.isArray(value)&&current[key]&&typeof current[key]==='object'&&!Array.isArray(current[key]))Object.assign(missing,missingCatalogKeys(value,current[key],path));
 }
 return missing;
}
