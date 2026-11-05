import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {request,mutationOptions,ApiError} from '@shared/api/client';
import {userSchema} from '@shared/api/schemas';
import {QueryKeys} from '@shared/lib/query-keys.constant';
import {resetAccountAppearance} from '@units/account/lib/appearance.store';
import {reconcileAuthSession} from './auth-session.util';
export const loginResultSchema=z.union([z.object({user:userSchema}),z.object({mfaRequired:z.literal(true),challenge:z.string(),expiresAt:z.string()})]);
export function useAuth(enabled=true){const client=useQueryClient();return useQuery({queryKey:QueryKeys.auth(),enabled,queryFn:async({signal})=>{try{const result=await request('/auth/me',z.object({user:userSchema,csrfToken:z.string().optional()}),{signal});await reconcileAuthSession(client,result);return result;}catch(error){if(error instanceof ApiError&&error.status===401)return reconcileAuthSession(client,null);throw error;}},retry:(count,error)=>!(error instanceof ApiError&&error.status===401)&&count<1});}
export function useLogin(){const client=useQueryClient();return useMutation({mutationFn:(body:{email:string;password:string})=>request('/auth/login',loginResultSchema,mutationOptions('POST',body)),gcTime:0,onError:()=>{},onSuccess:result=>{if('user'in result){client.clear();client.setQueryData(QueryKeys.auth(),{user:result.user});}}});}
export function useLogout(){const client=useQueryClient();return useMutation({mutationFn:()=>request('/auth/logout',z.unknown(),mutationOptions('POST',{})),onSuccess:()=>{resetAccountAppearance();client.clear();}});}
