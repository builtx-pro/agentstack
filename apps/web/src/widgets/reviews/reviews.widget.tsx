import {translate as t,useI18n} from '@shared/i18n';
import { Stack,Group,Select,TextInput,Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { ProjectObject,ReviewNote } from '@shared/api/schemas';
import { useCatalogFilters } from '@units/catalog/service/use-catalog.hook';
import { statusLabels } from '@shared/lib/labels.constant';
import { NoteCard } from '@units/review/ui/note-card.component';
import { ReviewActionDialog } from '@units/review/ui/review-action.component';
import { useReviewActions } from '@units/review/service/use-review-actions.hook';
import { EmptyState } from '@shared/ui/empty-state.component';
export function Reviews({projectId,objects,notes,canEdit,onOpen}:{projectId:string;objects:ProjectObject[];notes:ReviewNote[];canEdit:boolean;onOpen:(id:string)=>void}){useI18n();const {filters,searchInput,setSearch,update}=useCatalogFilters();const actions=useReviewActions(projectId);const filtered=notes.filter(n=>(!filters.status||n.status===filters.status)&&`${n.body} ${objects.find(o=>o.id===n.targetId)?.title??''}`.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase()));return <Stack gap="lg"><Group grow><TextInput aria-label={t("Search review notes")} placeholder={t("Find feedback…")} leftSection={<IconSearch size={18}/>} value={searchInput} onChange={e=>setSearch(e.currentTarget.value)}/><Select aria-label={t("Review status")} placeholder={t("All statuses")} clearable data={['open','in_progress','ready_for_review','resolved'].map(value=>({value,label:t(statusLabels[value])}))} value={filters.status||null} onChange={value=>update({status:value??''})}/></Group><Text size="sm" c="dimmed">{filtered.length} {t("review items · Comments stay attached to the exact target revision.")}</Text>{filtered.length===0&&<EmptyState illustration="feedback" title={t("A clear review queue")} description={t("Open a screen, asset or document to leave feedback. New comments will appear here.")}/>}{filtered.map(note=><NoteCard key={note.id} note={note} canEdit={canEdit} onAction={action=>actions.open(note,action)} onOpenTarget={()=>onOpen(note.targetId)}/>)}<ReviewActionDialog actions={actions}/></Stack>;}
