import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request,mutationOptions,ApiError } from '@shared/api/client';
import { userSchema } from '@shared/api/schemas';
import { QueryKeys } from '@shared/lib/query-keys.constant';
export function useAuth(){return useQuery({queryKey:QueryKeys.auth(),queryFn:({signal})=>request('/auth/me',z.object({user:userSchema,csrfToken:z.string().optional()}),{signal}),retry:(count,error)=>!(error instanceof ApiError&&error.status===401)&&count<1});}
export function useLogin(){const client=useQueryClient();return useMutation({mutationFn:(body:{email:string;password:string})=>request('/auth/login',z.object({user:userSchema}),mutationOptions('POST',body)),onError:()=>{},onSuccess:()=>client.invalidateQueries({queryKey:QueryKeys.auth()})});}
export function useLogout(){const client=useQueryClient();return useMutation({mutationFn:()=>request('/auth/logout',z.unknown(),mutationOptions('POST')),onSuccess:()=>client.clear()});}
