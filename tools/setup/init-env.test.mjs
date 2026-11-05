import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const script=resolve('tools/setup/init-env.mjs');
test('a custom port also configures a matching default origin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentstack-env-'));
 try{const r=spawnSync(process.execPath,[script,'--email','owner@example.test','--port','4322'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0);const env=parseEnv(await readFile(join(dir,'.env'),'utf8'));assert.equal(env.APP_ORIGIN,'http://localhost:4322');}finally{await rm(dir,{recursive:true,force:true})}
});
test('dollar signs in an email survive Compose interpolation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentstack-env-'));
 try{const email='owner+$AGENTSTACK_MISSING@example.test';const r=spawnSync(process.execPath,[script,'--email',email],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0);const raw=await readFile(join(dir,'.env'),'utf8');assert.equal(parseEnv(raw).ADMIN_EMAIL,email);assert.equal(raw.includes("ADMIN_EMAIL='owner+$AGENTSTACK_MISSING@example.test'"),true,'Email must be a Compose literal');assert.doesNotMatch(r.stdout,/POSTGRES_PASSWORD=/);}finally{await rm(dir,{recursive:true,force:true})}
});
