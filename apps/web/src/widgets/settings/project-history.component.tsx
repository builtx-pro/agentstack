import {useI18n} from '@shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Accordion, Badge, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { collection } from '@shared/api/client';
import { projectSchema } from '@shared/api/schemas';
import { QueryKeys } from '@shared/lib/query-keys.constant';
import { formatDate } from '@shared/lib/format.util';
import { QueryState } from '@shared/ui/query-state.component';
const revisionSchema=z.object({id:z.string(),version:z.number(),actorName:z.string(),source:z.string(),createdAt:z.string(),snapshot:projectSchema});
export function ProjectHistory({projectId}:{projectId:string}) {const {t}=useI18n();
 const history=useQuery({queryKey:QueryKeys.settings(projectId,'project-history'),queryFn:({signal})=>collection(`/projects/${projectId}/history`,revisionSchema,signal)});
 const revisions=[...(history.data??[])].sort((a,b)=>b.version-a.version);
 return <Paper withBorder p="lg" mt="lg"><Stack><Title order={4}>{t("Project history")}</Title><Text size="sm" c="dimmed">{t("Name, description and archive changes retain their author and previous values. Access changes appear in the project activity log.")}</Text><QueryState pending={history.isPending} error={history.error} retry={()=>void history.refetch()}/><Accordion>{revisions.map(revision=><Accordion.Item key={revision.id} value={revision.id}><Accordion.Control><Group gap="sm"><Badge size="sm" variant="light">{t("v")}{revision.version}</Badge><Text size="sm">{revision.actorName}</Text><Text size="xs" c="dimmed">{formatDate(revision.createdAt)}</Text></Group></Accordion.Control><Accordion.Panel><Table><Table.Tbody><Table.Tr><Table.Th>{t('Project name')}</Table.Th><Table.Td>{revision.snapshot.name}</Table.Td></Table.Tr><Table.Tr><Table.Th>{t("Description")}</Table.Th><Table.Td style={{whiteSpace:'pre-wrap'}}>{revision.snapshot.description||'—'}</Table.Td></Table.Tr><Table.Tr><Table.Th>{t("Archive")}</Table.Th><Table.Td>{revision.snapshot.archived?t("Archived"):t("Active")}</Table.Td></Table.Tr></Table.Tbody></Table></Accordion.Panel></Accordion.Item>)}</Accordion></Stack></Paper>;
}
