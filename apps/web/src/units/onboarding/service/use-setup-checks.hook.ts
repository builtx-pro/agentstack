import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {request} from '@shared/api/client';
const pageSchema=z.object({items:z.array(z.object({id:z.string()}))});
/** Only presence is needed: never download a large catalog to render this onboarding checklist. */
export function useSetupChecks(projectId:string|undefined){return useQuery({queryKey:['project',projectId??'','setup-checks'],enabled:!!projectId,staleTime:0,refetchOnWindowFocus:false,queryFn:async({signal})=>{const base=`/projects/${encodeURIComponent(projectId!)}`;const results=await Promise.all(['objects?kind=screen&archived=false&limit=1','objects?kind=asset&archived=false&limit=1','objects?kind=document&archived=false&limit=1','notes?limit=1'].map(path=>request(`${base}/${path}`,pageSchema,{signal})));return{screens:results[0]!.items.length>0,assets:results[1]!.items.length>0,documents:results[2]!.items.length>0,feedback:results[3]!.items.length>0}}});}
