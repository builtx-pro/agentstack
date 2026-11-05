#!/usr/bin/env node
import {open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
const path=resolve(process.argv[2]??'.env');let lock,file;
try{
 lock=await open(path+'.repository-key.lock','wx',0o600);
 file=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);
 const stat=await file.stat();if(!stat.isFile()||stat.size>1024*1024)throw Error('Invalid environment file');
 const env=parseEnv(await file.readFile('utf8'));const existing=env.REPOSITORY_ENCRYPTION_KEY;
 if(existing){const bytes=Buffer.from(existing,'base64');if(bytes.length!==32||bytes.toString('base64')!==existing)throw Error('Invalid existing key');console.log('Repository encryption key already configured; preserved unchanged.');}
 else{await file.chmod(0o600);await file.write('\nREPOSITORY_ENCRYPTION_KEY='+randomBytes(32).toString('base64')+'\n');await file.sync();console.log('Repository encryption key added to the private environment file. Back it up before using private repositories.');}
}catch{console.error('Could not configure repository encryption. Check that the environment file exists, is a regular file, has valid configuration and is not being updated concurrently. Existing credentials were not replaced.');process.exitCode=1;}
finally{await file?.close();if(lock){await lock.close();await unlink(path+'.repository-key.lock');}}
