import {translate as t,useI18n} from '@shared/i18n';
import {Modal,Stack,Paper,Text,Group,Badge,Textarea,Button,Tabs} from '@mantine/core';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {z} from 'zod';
import {collection} from '@shared/api/client';
import type {ReviewNote} from '@shared/api/schemas';
import {noteSchema} from '@shared/api/schemas';
import {QueryKeys} from '@shared/lib/query-keys.constant';
import {formatDate} from '@shared/lib/format.util';
import {StatusBadge} from '@shared/ui/status-badge.component';
import {QueryState} from '@shared/ui/query-state.component';
import {WorkspaceService} from '@units/workspace';
export function NoteHistory({note,onClose,canEdit}:{note:ReviewNote;onClose:()=>void;canEdit:boolean}){useI18n();const history=useQuery({queryKey:[...QueryKeys.notes(note.projectId,note.targetId),note.id,'history'],queryFn:({signal})=>collection(`/projects/${note.projectId}/notes/${note.id}/history`,z.object({id:z.string(),version:z.number(),actorName:z.string(),source:z.string(),createdAt:z.string(),summary:z.string(),snapshot:noteSchema}),signal)});const mutation=WorkspaceService.useWorkspaceMutation(note.projectId);const [body,setBody]=useState(note.body);return <Modal opened onClose={onClose} title={t("Comment history")} size="lg"><Tabs defaultValue="history"><Tabs.List mb="md"><Tabs.Tab value="history">{t("All revisions")}</Tabs.Tab>{canEdit&&<Tabs.Tab value="edit">{t("Edit text")}</Tabs.Tab>}</Tabs.List><Tabs.Panel value="history"><Stack><QueryState pending={history.isPending} error={history.error}/>{history.data?.slice().sort((a,b)=>b.version-a.version).map(item=><Paper key={item.id} withBorder p="md"><Group justify="space-between"><Text size="sm" fw={600}>{item.actorName} · v{item.version}</Text><StatusBadge status={item.snapshot.status}/></Group><Text size="xs" c="dimmed" mt={5}>{formatDate(item.createdAt)} · {t(item.source)}</Text><Text size="sm" mt="sm">{item.summary}</Text><Text size="sm" mt="sm" style={{whiteSpace:'pre-wrap'}}>{item.snapshot.body}</Text>{item.snapshot.result&&<Text size="sm" mt="sm" c="dimmed">{t("Result:")} {item.snapshot.result.summary}</Text>}</Paper>)}</Stack></Tabs.Panel>{canEdit&&<Tabs.Panel value="edit"><Stack><Textarea label={t("Comment text")} minRows={5} value={body} onChange={e=>setBody(e.currentTarget.value)}/><Text size="xs" c="dimmed">{t("The previous text remains in history.")}</Text><Button disabled={!body.trim()||body===note.body} loading={mutation.isPending} onClick={()=>mutation.mutate({path:`/projects/${note.projectId}/notes/${note.id}`,method:'PATCH',body:{expectedVersion:note.version,body}},{onSuccess:onClose})}>{t("Save revision")}</Button></Stack></Tabs.Panel>}</Tabs></Modal>;}
