import { DatabaseSync } from 'node:sqlite';
import { mkdir, copyFile, readdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

export async function backupStore(source,destination) {
  const sourcePath=resolve(source),target=resolve(destination);
  if(target===dirname(sourcePath)||target===sourcePath)throw new Error('Use a separate backup directory');
  // Refuse an existing destination; never overwrite a previous backup.
  await mkdir(target,{recursive:false});
  const database=new DatabaseSync(sourcePath,{readOnly:true});
  try{database.prepare('VACUUM INTO ?').run(join(target,'store.sqlite'));}finally{database.close();}
  await mkdir(join(target,'uploads'));
  let files=[];try{files=await readdir(join(dirname(sourcePath),'uploads'),{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const file of files)if(file.isFile()&&/^[a-f0-9-]+\.webp$/.test(file.name))await copyFile(join(dirname(sourcePath),'uploads',file.name),join(target,'uploads',file.name));
  const bytes=await readFile(join(target,'store.sqlite'));
  const manifest={created:new Date().toISOString(),database:'store.sqlite',databaseSha256:createHash('sha256').update(bytes).digest('hex'),uploads:files.filter(f=>f.isFile()&&/^[a-f0-9-]+\.webp$/.test(f.name)).map(f=>f.name),warning:'Contains confidential customer data and private order links. Encrypt and restrict access before copying off this machine.'};
  await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2));return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=process.env.DATABASE_PATH||'./data/store.sqlite';const base=resolve(process.env.BACKUP_DIR||'./data/backups');await mkdir(base,{recursive:true});
  const destination=join(base,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex'));
  console.log('Backup created:',await backupStore(source,destination));
}
