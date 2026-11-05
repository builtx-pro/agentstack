import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { collection } from '@shared/api/client';
import { QueryKeys } from '@shared/lib/query-keys.constant';
const user=z.object({id:z.string(),name:z.string(),email:z.string(),isAdmin:z.boolean().optional()});
const member=z.object({userId:z.string(),name:z.string().optional(),email:z.string().optional(),role:z.string(),version:z.number(),revokedAt:z.string().nullish()});
const token=z.object({id:z.string(),name:z.string(),scopes:z.array(z.string()),expiresAt:z.string(),revokedAt:z.string().nullish()});
export function useMembers(id:string,enabled:boolean){return useQuery({queryKey:QueryKeys.settings(id,'members'),queryFn:({signal})=>collection(`/projects/${id}/members?includeRevoked=true`,member,signal),enabled});}
export function useUsers(id:string,enabled:boolean){return useQuery({queryKey:QueryKeys.settings(id,'users'),queryFn:({signal})=>collection('/users',user,signal),enabled});}
export function useTokens(id:string){return useQuery({queryKey:QueryKeys.settings(id,'tokens'),queryFn:({signal})=>collection(`/projects/${id}/tokens`,token,signal)});}

const invitation=z.object({id:z.string(),email:z.string(),role:z.string(),expiresAt:z.string(),acceptedAt:z.string().nullish(),revokedAt:z.string().nullish()});
export function useInvitations(id:string){return useQuery({queryKey:QueryKeys.settings(id,'invitations'),queryFn:({signal})=>collection(`/projects/${id}/invitations`,invitation,signal)});}
