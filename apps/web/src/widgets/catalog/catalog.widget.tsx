import {Stack,Group,Text,Select,TextInput,Switch,Button,Paper,SegmentedControl} from '@mantine/core';
import {IconSearch,IconRoute,IconPlus,IconLayoutGrid} from '@tabler/icons-react';
import type {ProjectObject,ReviewNote} from '@shared/api/schemas';
import {useVisualCatalog} from '@units/catalog/service/use-visual-catalog.hook';
import {useCatalogWindow} from '@units/catalog/service/use-catalog-window.hook';
import {EmptyState} from '@shared/ui/empty-state.component';
import {CatalogGrid} from './catalog-grid.component';
import {FlowRow} from './flow-row.component';
import classes from './catalog-toolbar.module.css';
export function Catalog({objects,notes,kind,onOpen,onCreate,canEdit}:{objects:ProjectObject[];notes:ReviewNote[];kind:'screen'|'asset';onOpen:(id:string)=>void;onCreate:()=>void;canEdit:boolean}){
 const vm=useVisualCatalog(objects,notes,kind);const flows=useCatalogWindow(vm.rows,vm.windowKey,8);
 return <Stack gap="xl"><Paper withBorder p="md"><Stack gap="sm">
  <div className={classes.primary}>
   <TextInput size="sm" className={classes.search} classNames={{input:classes.input}} aria-label={`Search ${kind}s`} placeholder={`Search ${kind}s by name, ID or tag…`} leftSection={<IconSearch size={18}/>} value={vm.searchInput} onChange={e=>vm.setSearch(e.currentTarget.value)}/>
   <Select size="sm" classNames={{input:classes.input}} aria-label="Filter by tag" placeholder="All tags" clearable searchable data={vm.tags} value={vm.filters.tag||null} onChange={value=>vm.update({tag:value??''})}/>
   <Select size="sm" classNames={{input:classes.input}} aria-label="Filter by variant" data={vm.variantOptions} value={vm.variant} onChange={value=>vm.update({variant:value??'__all',palette:'',flow:''})}/>
  </div>
  <div className={classes.secondary} data-kind={kind}>
   {kind==='screen'&&<>
    <SegmentedControl size="sm" className={classes.layout} aria-label="Catalog layout" value={vm.mode} disabled={!!vm.filters.q} data={[{value:'flows',label:<span className={classes.layoutLabel}><IconRoute size={15} aria-hidden="true"/>Flows</span>},{value:'grid',label:<span className={classes.layoutLabel}><IconLayoutGrid size={15} aria-hidden="true"/>Grid</span>}]} onChange={mode=>vm.update({mode:mode==='flows'?'flows':'grid',flow:''})}/>
    <Select size="sm" classNames={{input:classes.input}} aria-label="Flow" placeholder="All flows" clearable searchable data={vm.flowOptions} value={vm.filters.flow||null} onChange={value=>vm.update({flow:value??'',mode:'flows'})}/>
    <Select size="sm" classNames={{input:classes.input}} aria-label="Theme" data={vm.paletteOptions} value={vm.palette} onChange={value=>vm.update({palette:value??'__all',flow:''})}/>
   </>}
   <div className={classes.archive}><Switch label="Archive" size="xs" checked={vm.filters.archived} onChange={e=>vm.update({archived:e.currentTarget.checked})}/></div>
   <Text size="xs" c="dimmed" className={classes.count}>{vm.visible.length.toLocaleString()} {kind}{vm.visible.length===1?'':'s'}</Text>
  </div>
  {vm.filters.q&&<Text size="xs" c="dimmed">Search shows each matching screen once, across the loaded catalog and selected filters.</Text>}
 </Stack></Paper>{vm.visible.length===0?<EmptyState title={`No ${kind}s found`} description="Try another filter or add the first item to this project." action={canEdit&&<Button variant="light" leftSection={<IconPlus size={16}/>} onClick={onCreate}>Add {kind}</Button>}/>:vm.mode==='flows'&&kind==='screen'?vm.rows.length?<Stack gap={40}>{flows.items.map(row=><FlowRow key={row.flow.id} row={row} counts={vm.counts} onOpen={onOpen} windowKey={vm.windowKey}/ >)}{flows.hasMore&&<Group justify="center"><Text size="sm" c="dimmed">{flows.shown} of {vm.rows.length} flows</Text><Button variant="light" onClick={flows.showMore}>Show 8 more flows</Button></Group>}</Stack>:<EmptyState title="No flows match this selection" description="Switch to Grid to see individual screens, or choose another variant and theme." action={<Button variant="light" onClick={()=>vm.update({mode:'grid'})}>Open grid</Button>}/>:<CatalogGrid objects={vm.visible} counts={vm.counts} windowKey={vm.windowKey} onOpen={onOpen}/ >}</Stack>;
}
