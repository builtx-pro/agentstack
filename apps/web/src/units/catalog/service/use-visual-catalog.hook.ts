import {useEffect,useMemo} from 'react';
import type {ProjectObject,ReviewNote} from '@shared/api/schemas';
import {asString} from '@shared/lib/format.util';
import {filterObjects} from '../lib/catalog.util';
import {ALL_VISUALS,DEFAULT_VISUAL,buildFlowRows,chooseVisualDefaults,visualOptions,noteCounts} from '../lib/catalog-window.util';
import {useCatalogFilters} from './use-catalog.hook';
export function useVisualCatalog(objects:ProjectObject[],notes:ReviewNote[],kind:'screen'|'asset'){
 const state=useCatalogFilters();const {filters,update}=state;
 const source=useMemo(()=>objects.filter(o=>o.kind===kind),[objects,kind]);
 const defaults=useMemo(()=>chooseVisualDefaults(source,filters.variant),[source,filters.variant]);
 const variant=filters.variant||(kind==='screen'?defaults.variant:ALL_VISUALS);
 const palette=filters.palette||(kind==='screen'?defaults.palette:ALL_VISUALS);
 // The URL is an external navigation system. Write resolved catalog defaults once after data arrives.
 useEffect(()=>{if(kind==='screen'&&source.length&&(!filters.variant||!filters.palette))update({variant,palette});},[kind,source.length,filters.variant,filters.palette,variant,palette]);
 const effective={...filters,variant:variant===ALL_VISUALS?'':variant,palette:palette===ALL_VISUALS?'':palette};
 const visible=useMemo(()=>filterObjects(source,effective),[source,filters.q,filters.tag,filters.status,filters.archived,filters.kind,variant,palette]);
 const flows=useMemo(()=>objects.filter(o=>o.kind==='flow'&&o.archived===filters.archived),[objects,filters.archived]);
 const rows=useMemo(()=>buildFlowRows(visible,flows).filter(row=>!filters.flow||row.flow.id===filters.flow),[visible,flows,filters.flow]);
 const variantObjects=source.filter(o=>variant===ALL_VISUALS||asString(o.data.variant)===(variant===DEFAULT_VISUAL?'':variant));
 const mode=filters.q?'grid':(filters.mode||((kind==='screen'&&flows.length)?'flows':'grid'));
 return{...state,variant,palette,visible,rows,mode,variantOptions:[{value:ALL_VISUALS,label:'All variants'},...visualOptions(source,'variant')],paletteOptions:[{value:ALL_VISUALS,label:'All themes'},...visualOptions(variantObjects,'palette')],flowOptions:buildFlowRows(filterObjects(source,{...effective,q:'',tag:'',status:''}),flows).map(row=>({value:row.flow.id,label:row.flow.title})),tags:[...new Set(source.flatMap(o=>o.tags))].sort(),counts:useMemo(()=>noteCounts(notes),[notes]),windowKey:JSON.stringify({...effective,kind,mode})};
}
