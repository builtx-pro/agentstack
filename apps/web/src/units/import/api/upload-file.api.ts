import {translate as t} from '@shared/i18n';
import {z} from 'zod';
import {ApiError,request} from '@shared/api/client';
import {retryDelayMs,waitForUploadLimit} from '../lib/upload-wait.util';
export interface UploadWait {delayMs:number;attempt:number;maxAttempts:number}
export async function uploadProjectFile(projectId:string,file:File,options:{signal:AbortSignal;onWait?:(wait:UploadWait)=>void;onAttempt?:(attempt:number)=>void}) {
 const maxAttempts=5;
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  options.signal.throwIfAborted();options.onAttempt?.(attempt);
  const body=new FormData();body.append('file',file);
  try{return await request(`/projects/${projectId}/files`,z.object({id:z.string()}),{method:'POST',body,signal:options.signal});}
  catch(error){
   if(!(error instanceof ApiError)||error.status!==429||attempt===maxAttempts)throw error;
   const delayMs=retryDelayMs(error.retryAfter,attempt);
   // Do not retry earlier than the server permits. An excessive wait ends this run instead.
   if(!Number.isFinite(delayMs)||delayMs>120000)throw error;
   options.onWait?.({delayMs,attempt,maxAttempts});await waitForUploadLimit(delayMs,options.signal);
  }
 }
 throw new Error(t("Upload retry limit reached."));
}
