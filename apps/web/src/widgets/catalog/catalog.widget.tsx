import {useI18n} from '@shared/i18n';
import {useState} from 'react';
import {Stack,Group,Text,Select,TextInput,Switch,Button,Paper,SegmentedControl} from '@mantine/core';
import {IconSearch,IconRoute,IconPlus,IconLayoutGrid} from '@tabler/icons-react';
import type {ProjectObject,ReviewNote} from '@shared/api/schemas';
import {useVisualCatalog} from '@units/catalog/service/use-visual-catalog.hook';
import {useCatalogWindow} from '@units/catalog/service/use-catalog-window.hook';
import {EmptyState} from '@shared/ui/empty-state.component';
import {CatalogGrid} from './catalog-grid.component';
import {FlowRow} from './flow-row.component';
import classes from './catalog-toolbar.module.css';
export function Catalog({objects,notes,kind,onOpen,onCreate,canEdit,onTag}:{objects:ProjectObject[];notes:ReviewNote[];kind:'screen'|'asset';onOpen:(id:string)=>void;onCreate:()=>void;canEdit:boolean;onTag:(tag:string,object:ProjectObject)=>void}){const {t}=useI18n();
 const [expandStates,setExpandStates]=useState(false);const vm=useVisualCatalog(objects,notes,kind);const flows=useCatalogWindow(vm.rows,vm.windowKey,8);const selectTag=(tag:string,object:ProjectObject)=>{vm.clearSearch();onTag(tag,object)};
 return <Stack gap="xl"><Paper withBorder p="md"><Stack gap="sm">
  <div className={classes.primary}>
   <TextInput size="sm" className={classes.search} classNames={{input:classes.input}} aria-label={t(kind==='screen'?'Search screens':'Search assets')} placeholder={t(kind==='screen'?'Search screens by name, ID or tag…':'Search assets by name, ID or tag…')} leftSection={<IconSearch size={18}/>} value={vm.searchInput} onChange={e=>vm.setSearch(e.currentTarget.value)}/>
   <Select size="sm" classNames={{input:classes.input}} aria-label={t("Filter by tag")} placeholder={t("All tags")} clearable searchable data={vm.tags} value={vm.filters.tag||null} onChange={value=>vm.update({tag:value??''})}/>
   <Select size="sm" classNames={{input:classes.input}} aria-label={t("Filter by variant")} data={vm.variantOptions} value={vm.variant} onChange={value=>vm.update({variant:value??'__all',palette:'',flow:''})}/>
  </div>
  <div className={classes.secondary} data-kind={kind}>
   {kind==='screen'&&<>
    <SegmentedControl size="sm" className={classes.layout} aria-label={t("Catalog layout")} value={vm.mode} disabled={!!vm.filters.q} data={[{value:'flows',label:<span className={classes.layoutLabel}><IconRoute size={15} aria-hidden="true"/>{t("Flows")}</span>},{value:'grid',label:<span className={classes.layoutLabel}><IconLayoutGrid size={15} aria-hidden="true"/>{t("Grid")}</span>}]} onChange={mode=>vm.update({mode:mode==='flows'?'flows':'grid',flow:''})}/>
    <Select size="sm" classNames={{input:classes.input}} aria-label={t("Flow")} placeholder={t("All flows")} clearable searchable data={vm.flowOptions} value={vm.filters.flow||null} onChange={value=>vm.update({flow:value??'',mode:'flows'})}/>
    <Select size="sm" classNames={{input:classes.input}} aria-label={t("Theme")} data={vm.paletteOptions} value={vm.palette} onChange={value=>vm.update({palette:value??'__all',flow:''})}/>
   </>}
   <div className={classes.archive}><Switch label={t("Archive")} size="xs" checked={vm.filters.archived} onChange={e=>vm.update({archived:e.currentTarget.checked})}/></div>
   <Text size="xs" c="dimmed" className={classes.count}>{t(kind==='screen'?'Screens: {count}':'Assets: {count}',{count:vm.visible.length})}</Text>
  </div>
  {kind==='screen'&&vm.mode==='flows'&&<Group justify="space-between"><Text size="xs" c="dimmed">{t('Flows: {flows} · alternate states: {states}',{flows:vm.rows.length,states:new Set(vm.rows.flatMap(row=>row.states.map(screen=>screen.id))).size})}</Text><Switch size="xs" label={t("Expand all alternate states")} checked={expandStates} onChange={e=>setExpandStates(e.currentTarget.checked)}/></Group>}
  {vm.filters.tag&&<Group gap="xs"><Text size="sm">{t('Tag: {tag}',{tag:vm.filters.tag})}</Text><Button size="compact-xs" variant="subtle" onClick={()=>vm.update({tag:''})}>{t("Clear tag filter")}</Button></Group>}
  {vm.filters.q&&<Text size="xs" c="dimmed">{t("Search shows each matching screen once, across the loaded catalog and selected filters.")}</Text>}
 </Stack></Paper>{vm.visible.length===0?<EmptyState illustration={kind==='screen'?'screens':'assets'} title={t(kind==='screen'?'No screens found':'No assets found')} description={t("Try another filter or add the first item to this project.")} action={canEdit&&<Button variant="light" leftSection={<IconPlus size={16}/>} onClick={onCreate}>{t(kind==='screen'?'Add screen':'Add asset')}</Button>}/>:vm.mode==='flows'&&kind==='screen'?vm.rows.length?<Stack gap={40}>{flows.items.map(row=><FlowRow expandStates={expandStates} onTag={selectTag} key={row.flow.id} row={row} counts={vm.counts} onOpen={onOpen} windowKey={vm.windowKey}/ >)}{vm.ungrouped.length>0&&<Stack><Text fw={650}>{t('Screens without a flow: {count}',{count:vm.ungrouped.length})}</Text><CatalogGrid onTag={selectTag} objects={vm.ungrouped} counts={vm.counts} windowKey={vm.windowKey+'ungrouped'} onOpen={onOpen}/></Stack>}{flows.hasMore&&<Group justify="center"><Text size="sm" c="dimmed">{t('{shown} of {total} flows',{shown:flows.shown,total:vm.rows.length})}</Text><Button variant="light" onClick={flows.showMore}>{t("Show 8 more flows")}</Button></Group>}</Stack>:vm.filters.flow?<EmptyState illustration={kind==='screen'?'screens':'assets'} title={t("No flows match this selection")} description={t("Choose another flow or clear the flow filter.")} action={<Button variant="light" onClick={()=>vm.update({flow:''})}>{t("Clear flow filter")}</Button>}/>:<Stack><Text size="sm" c="dimmed">{t("These screens are not assigned to a flow.")}</Text><CatalogGrid onTag={selectTag} objects={vm.visible} counts={vm.counts} windowKey={vm.windowKey} onOpen={onOpen}/></Stack>:<CatalogGrid onTag={selectTag} objects={vm.visible} counts={vm.counts} windowKey={vm.windowKey} onOpen={onOpen}/ >}</Stack>;
}
