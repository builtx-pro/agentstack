import {translate as t,useI18n} from '@shared/i18n';
import { Stack,Paper,Group,Text,Badge,Button,Timeline } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import { WorkspaceService } from '@units/workspace';
import { QueryState } from '@shared/ui/query-state.component';
import { EmptyState } from '@shared/ui/empty-state.component';
import { formatDate } from '@shared/lib/format.util';
export function ActivityFeed({projectId,onOpen}:{projectId:string;onOpen:(id:string)=>void}){useI18n();const activity=WorkspaceService.useActivity(projectId);return <Stack><QueryState pending={activity.isPending} error={activity.error} retry={()=>void activity.refetch()}/>{activity.data?.length===0&&<EmptyState title={t("The story starts here")} description={t("Project changes will appear here with an author, time and revision.")}/>}<Paper withBorder p="xl"><Timeline bulletSize={26} lineWidth={2}>{activity.data?.map(event=><Timeline.Item key={event.id} title={event.summary} bullet={<IconHistory size={14}/>}><Group gap="xs" mt={5}><Text size="sm" c="dimmed">{event.actorName}</Text><Badge size="xs" color="gray">{t(event.source)}</Badge></Group><Text size="xs" c="dimmed" mt={5}>{formatDate(event.createdAt)}</Text>{event.targetId&&<Button variant="subtle" px={0} mt={7} onClick={()=>onOpen(event.targetId!)}>{t("Open item")}</Button>}</Timeline.Item>)}</Timeline></Paper></Stack>;}
