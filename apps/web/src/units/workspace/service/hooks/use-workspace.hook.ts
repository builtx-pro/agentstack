import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@shared/lib/query-keys.constant';
import * as api from '../../api/workspace.api';
import {reconcileWorkspace} from '../mutations/reconcile-workspace.mutation';
export function useProjects(enabled=true){return useQuery({queryKey:QueryKeys.projects(),queryFn:({signal})=>api.getProjects(signal),enabled});}
export function useProject(id:string,enabled=true){return useQuery({queryKey:QueryKeys.project(id),queryFn:({signal})=>api.getProject(id,signal),enabled:!!id&&enabled});}
export function useObjects(id:string,enabled=true){return useQuery({queryKey:QueryKeys.objects(id),queryFn:({signal})=>api.getObjects(id,signal),enabled:!!id&&enabled,staleTime:300000,refetchOnWindowFocus:false,refetchOnReconnect:false});}
export function useNotes(id:string,target?:string,enabled=true){return useQuery({queryKey:QueryKeys.notes(id,target),queryFn:({signal})=>api.getNotes(id,target,signal),refetchInterval:20000,enabled:!!id&&enabled});}
export function useHistory(id:string,target:string,enabled=true){return useQuery({queryKey:QueryKeys.history(id,target),queryFn:({signal})=>api.getHistory(id,target,signal),enabled:!!id&&!!target&&enabled});}
export function useProgress(id:string,enabled=true){return useQuery({queryKey:QueryKeys.progress(id),queryFn:({signal})=>api.getProgress(id,signal),enabled:!!id&&enabled});}
export function useActivity(id:string,enabled=true){return useQuery({queryKey:QueryKeys.activity(id),queryFn:({signal})=>api.getActivity(id,signal),enabled:!!id&&enabled});}
export function useWorkspaceMutation(id:string){const client=useQueryClient();return useMutation({mutationFn:({path,method='POST',body}:{path:string;method?:string;body?:unknown})=>api.mutateWorkspace(path,method,body),onSuccess:(result,write)=>reconcileWorkspace(client,id,write,result)});}
