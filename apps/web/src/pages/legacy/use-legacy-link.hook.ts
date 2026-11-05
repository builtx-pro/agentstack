import {translate as t,useI18n} from '@shared/i18n';
import {useMemo,useRef} from 'react';
import {useLocation,useSearch} from '@tanstack/react-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {AuthService} from '@units/auth';
import {ApiError,request} from '@shared/api/client';
import {legacyReturnTo,parseLegacyLink} from './legacy-link.util';
const resolverSchema=z.object({targetId:z.string().uuid(),noteId:z.string().uuid().optional(),section:z.enum(['screens','assets'])});
export function useLegacyLink(){useI18n();
 const search=useSearch({from:'/legacy'});const location=useLocation();const initialHash=useRef(location.hash);const hash=location.pathname==='/legacy'?location.hash:initialHash.current;const auth=AuthService.useAuth();
 const parsed=useMemo(()=>{try{return{target:parseLegacyLink(search,hash),error:null};}catch(error){return{target:null,error:error instanceof Error?error:new Error(t("This link could not be read."))};}},[search,hash]);
 const target=parsed.target;
 const resolved=useQuery({queryKey:['legacy',target?.projectId,target?.kind,target?.key,target?.note],enabled:!!auth.data&&!!target?.key,retry:false,queryFn:({signal})=>{const query=new URLSearchParams({kind:target!.kind,key:target!.key!});if(target!.note)query.set('note',target!.note);return request(`/projects/${target!.projectId}/legacy?${query}`,resolverSchema,{signal});}});
 return{auth,target,error:parsed.error,resolved,needsLogin:auth.isSuccess&&auth.data===null,returnTo:target?legacyReturnTo(target):'/'};
}
