// Executed only in the operator bootstrap container, with its existing owner credentials.
// Retry after a crash never resets an existing administrator's password.
import {Pool} from 'pg';
import {bootstrap} from '../../apps/server/src/auth/bootstrap.service.ts';
const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),url=process.env.DATABASE_OWNER_URL;
if(!email||!url)throw new Error('Bootstrap environment is incomplete');
const pool=new Pool({connectionString:url});
try {
 const admins=(await pool.query('SELECT email FROM users WHERE is_admin=true')).rows;
 if(admins.length){
  if(!admins.some(row=>row.email===email))throw new Error('An unrelated administrator already exists; refusing to change it.');
  console.log('Initial administrator already exists; its credentials were preserved.');
 } else {
  let password='';for await(const chunk of process.stdin){password+=chunk.toString();if(password.length>202)throw new Error('Password input is too long');}
  password=password.replace(/\r?\n$/,'');
  await bootstrap(url,{email,name:process.env.ADMIN_NAME??'Workspace owner',password});
  console.log('Initial administrator created. Credentials were not printed.');
 }
}finally{await pool.end();}
