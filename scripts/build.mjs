import {mkdir,copyFile,readdir,rm}from'node:fs/promises';
await rm('public',{recursive:true,force:true});await mkdir('public');for(const file of await readdir('.'))if(/\.(html|css|js|webmanifest)$/.test(file))await copyFile(file,'public/'+file);
console.log('HABI static client prepared; server-only sources are excluded.');
