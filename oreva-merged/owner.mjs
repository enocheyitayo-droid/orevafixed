import { openStore,email,string,passwordHash } from './store.mjs';
const e=email(process.env.OWNER_EMAIL),p=string(process.env.OWNER_PASSWORD,'OWNER_PASSWORD',300);
if(p.length<14)throw new Error('Use a unique password with at least 14 characters');
const s=openStore(process.env.DATABASE_PATH);s.tx(()=>{s.run('INSERT OR REPLACE INTO owner VALUES(1,?,?)',e,passwordHash(p));s.run('DELETE FROM sessions');const settings=s.settings();settings.ownerEmail=e;s.saveSettings(settings);});s.db.close();console.log('Owner provisioned; all old sessions revoked. Remove OWNER_PASSWORD from your environment.');
