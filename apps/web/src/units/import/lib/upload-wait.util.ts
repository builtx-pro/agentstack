import {translate as t} from '@shared/i18n';
export function retryDelayMs(header:string|null|undefined,attempt:number,now=Date.now()):number {
 if(header?.trim()) { const value=header.trim(); if(/^\d+(?:\.\d+)?$/.test(value))return Math.ceil(Number(value)*1000);const date=Date.parse(value);if(Number.isFinite(date))return Math.max(0,date-now); }
 return Math.min(30000,1000*2**(attempt-1));
}
export function waitForUploadLimit(delayMs:number,signal:AbortSignal):Promise<void>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const finish=()=>{signal.removeEventListener('abort',cancel);resolve();};
  const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(signal.reason??new DOMException(t("Upload cancelled"),'AbortError'));};
  const timer=setTimeout(finish,delayMs);signal.addEventListener('abort',cancel,{once:true});
 });
}
