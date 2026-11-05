import {useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {request,mutationOptions} from '@shared/api/client';
import {QueryKeys} from '@shared/lib/query-keys.constant';
import {manifestSchema,stripLocalPaths,replaceFileReferences,verifyFiles,type ImportManifest} from '../lib/import.util';
import {uploadProjectFile} from '../api/upload-file.api';
const reportSchema=z.object({created:z.number(),updated:z.number(),unchanged:z.number(),dryRun:z.boolean()});
export function useImport(projectId:string){
 const client=useQueryClient();const [manifest,setManifest]=useState<ImportManifest|null>(null);const [files,setFiles]=useState<File[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [report,setReport]=useState<z.infer<typeof reportSchema>|null>(null);const [progress,setProgress]=useState({stage:'idle',message:'',completed:0,total:0});
 const controller=useRef<AbortController|null>(null);const uploaded=useRef(new Map<string,string>());
 // Cancel network requests and rate-limit timers when this panel is removed.
 useEffect(()=>()=>controller.current?.abort(),[]);
 const select=async(selected:File[])=>{controller.current?.abort();uploaded.current.clear();setError('');setReport(null);setManifest(null);setFiles(selected);setProgress({stage:'idle',message:'',completed:0,total:0});try{const source=selected.find(file=>file.name==='manifest.json');if(!source)throw new Error('Select a folder containing manifest.json and its files.');if(source.size>8*1024*1024)throw new Error('Manifest exceeds 8 MB.');setManifest(manifestSchema.parse(JSON.parse(await source.text())));}catch(e){setError(e instanceof Error?e.message:'Could not read the manifest.');}};
 const run=async(apply:boolean)=>{
  if(!manifest||busy)return;const task=new AbortController();controller.current=task;setBusy(true);setError('');setProgress({stage:'validating',message:'Checking file checksums…',completed:uploaded.current.size,total:manifest.files.length});let applying=false;
  try{
   const matched=await verifyFiles(manifest,files,task.signal);task.signal.throwIfAborted();
   if(!apply){setReport(await request(`/projects/${projectId}/import`,reportSchema,{...mutationOptions('POST',{manifest:stripLocalPaths(manifest),dryRun:true}),signal:task.signal}));setProgress(p=>({...p,stage:'idle',message:'Preview passed. Ready to import.'}));}
   else{
    const ids=uploaded.current;
    for(const [key,file]of matched){
     task.signal.throwIfAborted();if(ids.has(key))continue;
     const result=await uploadProjectFile(projectId,file,{signal:task.signal,onAttempt:()=>setProgress({stage:'uploading',message:`Uploading ${file.name}`,completed:ids.size,total:matched.size}),onWait:wait=>setProgress({stage:'waiting',message:`Waiting for upload limit · retry ${wait.attempt+1}/${wait.maxAttempts} in ${Math.ceil(wait.delayMs/1000)}s`,completed:ids.size,total:matched.size})});
     ids.set(key,result.id);setProgress({stage:'uploading',message:`Uploaded ${ids.size} of ${matched.size} files`,completed:ids.size,total:matched.size});
    }
    task.signal.throwIfAborted();const payload={...stripLocalPaths(manifest),objects:replaceFileReferences(manifest.objects,ids),files:[]};applying=true;setProgress(p=>({...p,stage:'applying',message:'Saving the verified catalog…'}));
    setReport(await request(`/projects/${projectId}/import`,reportSchema,{...mutationOptions('POST',{manifest:payload,dryRun:false}),signal:task.signal}));setProgress(p=>({...p,stage:'idle',message:'Import completed.'}));await client.invalidateQueries({queryKey:QueryKeys.project(projectId)});
   }
  }catch(e){
   if(task.signal.aborted){if(applying)setError('The final import response was interrupted. Reload the project to check whether it completed.');setProgress(p=>({...p,stage:'idle',message:applying?'Check project state before importing again.':'Upload cancelled. Completed uploads are kept for this selection; you can resume.'}));}
   else{setError(e instanceof Error?e.message:'Import failed.');setProgress(p=>({...p,stage:'idle',message:applying?'Check project state before importing again.':'The upload stopped. Completed uploads are kept for this selection.'}));}
  }finally{if(controller.current===task)controller.current=null;setBusy(false);}
 };
 return{manifest,error,busy,report,progress,select,run,cancel:()=>controller.current?.abort()};
}
