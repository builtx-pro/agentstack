import {translate as t} from '@shared/i18n';
import {useMutation} from '@tanstack/react-query';
import {notifications} from '@mantine/notifications';
import {z} from 'zod';
import {request} from '@shared/api/client';
export function useProjectContext(projectId:string){const query=useMutation({mutationFn:()=>request(`/projects/${projectId}/context`,z.record(z.string(),z.unknown()))});const text=query.data?JSON.stringify(query.data,null,2):'';const copy=async()=>{try{await navigator.clipboard.writeText(text);notifications.show({color:'teal',message:t("Project context copied. Paste it into your agent session.")});}catch{notifications.show({color:'orange',message:t("Clipboard unavailable. Select the text below to copy it manually.")});}};return{query,text,copy};}
