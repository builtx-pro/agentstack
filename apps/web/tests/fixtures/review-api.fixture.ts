import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function setupReviewApi(page:Page,customer=false,locale:'ru'|'en'|null=null){
 const base=process.env.AGENTSTACK_EXAMPLE_ROOT??path.resolve('../../examples/starter');
 const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
 const project={id:'project-one',name:'Lumen · Example workspace',slug:'lumen',description:'Help people regain access with confidence.',version:1,archived:false,role:customer?'customer':'admin'};
 const user={id:'user-one',name:customer?'Customer':'Demo reviewer',email:'reviewer@example.test',isAdmin:!customer};
 const objects=manifest.objects.map((item:any)=>({...item,id:item.key,projectId:project.id,version:1,archived:false,createdAt:'2026-11-05T12:00:00Z',updatedAt:'2026-11-05T12:00:00Z',data:{...item.data,imageFileId:item.data.imageFileId?.replace('@file:',''),fileId:item.data.fileId?.replace('@file:','')}}));
 const notes:any[]=[];const revisions=new Map(objects.map((o:any)=>[o.id,[{id:`revision-${o.id}`,version:1,actorName:'Demo reviewer',source:'web',createdAt:o.createdAt,summary:'Created',snapshot:structuredClone(o)}]]));let failNextPatch=false;
 await page.route('**/api/v1/**',async route=>{const request=route.request();const url=new URL(request.url());const pathname=url.pathname.replace('/api/v1','');const method=request.method();const body=request.postDataJSON();const respond=(data:unknown,status=200)=>route.fulfill({status,json:data});
 if(pathname==='/auth/me')return respond({user,csrfToken:'origin-bound'});
 if(pathname==='/account'&&method==='GET')return respond({user,version:1,preferences:{locale,theme:'light',accent:'#7950f2',onboardingCompleted:true},avatarUrl:null,mfaEnabled:false,recoveryCodesRemaining:0});
 if(pathname==='/projects')return respond({items:[project],nextCursor:null});
 if(pathname===`/projects/${project.id}`)return respond(project);
 if(pathname.endsWith('/progress'))return respond({total:3,done:1,percent:33.33,byStatus:{done:1,in_progress:1,ready:1},notes:{open:notes.filter(n=>n.status==='open').length,in_progress:0,ready_for_review:0,resolved:0},groups:[{id:'epic-recovery',title:'Recover account access',kind:'epic',done:1,total:3,percent:33.33}],timeline:[{date:'2026-11-04',total:2,done:0},{date:'2026-11-05',total:3,done:1}]});
 if(pathname.endsWith('/activity'))return respond({items:[{id:'event-1',actorName:'Demo reviewer',source:'web',createdAt:'2026-11-05T12:00:00Z',summary:'Created recovery flow',targetId:'recovery-flow'}],nextCursor:null});
 if(pathname.includes('/files/')){const key=pathname.split('/').at(-1);const file=manifest.files.find((f:any)=>f.key===key);if(file)return route.fulfill({body:await readFile(path.join(base,file.path)),contentType:file.mimeType});return respond({error:{code:'not_found',message:'File unavailable'}},404);}
 if(pathname.endsWith('/objects')&&method==='GET')return respond({items:objects.filter((o:any)=>!customer||o.visibility==='customer'),nextCursor:null});
 if(pathname.includes('/objects/')&&pathname.endsWith('/history'))return respond({items:revisions.get(pathname.split('/').at(-2)),nextCursor:null});
 if(pathname.includes('/objects/')&&method==='PATCH'){if(failNextPatch){failNextPatch=false;return respond({error:{code:'version_conflict',message:'This item changed. Reload before saving.'}},409);}const object=objects.find((o:any)=>o.id===pathname.split('/').at(-1));Object.assign(object,body,{version:object.version+1});return respond(object);}
 if(pathname.endsWith('/notes')&&method==='GET')return respond({items:notes.filter(n=>!url.searchParams.get('targetId')||n.targetId===url.searchParams.get('targetId')),nextCursor:null});
 if(pathname.endsWith('/notes')&&method==='POST'){const note={id:`note-${notes.length+1}`,projectId:project.id,authorName:user.name,status:'open',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...body};notes.push(note);return respond(note,201);}
 if(pathname.includes('/notes/')&&pathname.endsWith('/transition')){const note=notes.find(n=>n.id===pathname.split('/').at(-2));note.status=body.action==='claim'?'in_progress':body.action==='submit'?'ready_for_review':body.action==='resolve'?'resolved':'open';note.version++;if(body.result)note.result=body.result;return respond(note);}
 if(pathname.endsWith('/tokens')||pathname.endsWith('/members')||pathname==='/users')return respond({items:[],nextCursor:null});
 return respond({error:{code:'not_found',message:`Unmocked API: ${method} ${pathname}`}},404);
 });
 return{project,notes,objects,conflictNextPatch:()=>{failNextPatch=true;}};
}
