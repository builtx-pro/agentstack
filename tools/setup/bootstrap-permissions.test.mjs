import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const image='node:22-bookworm-slim';
function run(args){return spawnSync('docker',args,{encoding:'utf8'});}
test('root umask077 source is made readable to nonroot bootstrap without changing secrets',()=>{
 const volume=`agentstack-bootstrap-permissions-${randomUUID()}`;
 const ok=(args)=>{const r=run(args);assert.equal(r.status,0,r.stderr);return r;};
 try{
  ok(['volume','create',volume]);
  ok(['run','--rm','--user','0:0','--volume',`${volume}:/proof`,image,'bash','-c','umask 077; printf "public bootstrap source" > /proof/bootstrap-vps.mjs; printf "private test data" > /proof/password']);
  const read=['run','--rm','--user','node','--volume',`${volume}:/proof`,image,'node','-e',"require('node:fs').readFileSync('/proof/bootstrap-vps.mjs')"];
  const before=run(read);assert.notEqual(before.status,0);assert.match(before.stderr,/EACCES/);
  ok(['run','--rm','--user','0:0','--volume',`${volume}:/proof`,'--volume',`${resolve('tools/setup/bootstrap-permissions.sh')}:/library.sh:ro`,image,'bash','-c','source /library.sh; prepare_bootstrap_helper /proof/bootstrap-vps.mjs; test "$(stat -c %a /proof/password)" = 600']);
  ok(read);
  const secret=run(['run','--rm','--user','node','--volume',`${volume}:/proof`,image,'node','-e',"require('node:fs').readFileSync('/proof/password')"]);assert.notEqual(secret.status,0);assert.match(secret.stderr,/EACCES/);
 }finally{run(['volume','rm','-f',volume]);}
});
