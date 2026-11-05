import {translate as t,useI18n} from '@shared/i18n';
import {errorMessage} from '@shared/i18n/error-message.util';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { z } from 'zod';
import { request } from '@shared/api/client';
import type { ProjectObject,ObjectKind } from '@shared/api/schemas';
import { WorkspaceService } from '@units/workspace';
import { editorValues,toObjectDraft,editorPatch } from '../lib/editor.util';
export function useObjectEditor(projectId:string,object:ProjectObject|undefined,kind:ObjectKind,onSaved:()=>void){useI18n();const mutation=WorkspaceService.useWorkspaceMutation(projectId);const [uploading,setUploading]=useState(false);const [uploadError,setUploadError]=useState('');const form=useForm({initialValues:editorValues(object,kind),validate:{title:v=>v.trim()?null:t("A title is required"),key:v=>/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/.test(v)?null:t("Use a stable key with letters, numbers, hyphens or colons"),previewUrl:v=>!v||/^https?:\/\//.test(v)?null:t("Use a full http(s) URL")}});const upload=async(file:File|null)=>{if(!file)return;setUploading(true);setUploadError('');try{const body=new FormData();body.append('file',file);const result=await request(`/projects/${projectId}/files`,z.object({id:z.string()}),{method:'POST',body});form.setFieldValue('fileId',result.id);}catch(error){setUploadError(error instanceof Error?errorMessage(error):t("Upload failed"));}finally{setUploading(false);}};const submit=form.onSubmit(values=>{const draft=toObjectDraft(values);mutation.mutate({path:`/projects/${projectId}/objects${object?`/${object.id}`:''}`,method:object?'PATCH':'POST',body:object?editorPatch(object,draft):draft},{onSuccess:onSaved});});return{form,upload,uploading,uploadError,submit,mutation};}
