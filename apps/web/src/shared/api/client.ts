import {translate as t} from '@shared/i18n';
import { z } from 'zod';
export class ApiError extends Error { constructor(public status:number, public code:string, message:string, public retryAfter?:string|null) { super(message); } }
export async function request<T>(path:string,schema:z.ZodType<T>,options:RequestInit={}) : Promise<T> {
 const response=await fetch(`/api/v1${path}`,{...options,credentials:'same-origin',headers:{...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}),'X-AgentStack-Request':'1',...options.headers}});
 if(!response.ok){const body=await response.json().catch(()=>null);throw new ApiError(response.status,body?.error?.code??'request_failed',body?.error?.message??`Request failed (${response.status})`,response.headers.get('retry-after'));}
 if(response.status===204)return schema.parse(undefined);
 return schema.parse(await response.json());
}
export async function collection<T>(path:string,schema:z.ZodType<T>,signal?:AbortSignal,pageSize=100):Promise<T[]> {
 const result:T[]=[];let cursor:string|undefined;const seen=new Set<string>();
 do {const delimiter=path.includes('?')?'&':'?';const page=await request(`${path}${delimiter}limit=${pageSize}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,z.object({items:z.array(schema),nextCursor:z.string().nullish()}),{signal});result.push(...page.items);cursor=page.nextCursor??undefined;if(cursor){if(seen.has(cursor)||seen.size>999)throw new Error(t("Pagination could not complete. Narrow the search."));seen.add(cursor);}}while(cursor);
 return result;
}
export const jsonBody=(value:unknown)=>JSON.stringify(value);
export const mutationOptions=(method:string,body?:unknown,idempotent=false):RequestInit=>({method,body:body===undefined?undefined:jsonBody(body),headers:idempotent?{'Idempotency-Key':crypto.randomUUID()}:undefined});
export const fileUrl=(projectId:string,fileId:string)=>`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`;
