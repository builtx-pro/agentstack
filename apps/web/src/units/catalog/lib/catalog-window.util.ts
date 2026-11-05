import type {ProjectObject} from '@shared/api/schemas';
import {asString,asStrings} from '@shared/lib/format.util';
export const ALL_VISUALS='__all';
export const DEFAULT_VISUAL='__default';
export function chooseVisualDefaults(screens:ProjectObject[],requestedVariant?:string){const variants=[...new Set(screens.map(s=>asString(s.data.variant)))].sort();const variant=requestedVariant&&requestedVariant!==ALL_VISUALS?(requestedVariant===DEFAULT_VISUAL?'':requestedVariant):(variants[0]??'');const related=requestedVariant===ALL_VISUALS?screens:screens.filter(s=>asString(s.data.variant)===variant);const palettes=[...new Set(related.map(s=>asString(s.data.palette)))].sort();return{variant:variant||DEFAULT_VISUAL,palette:palettes.includes('')?DEFAULT_VISUAL:(palettes[0]??DEFAULT_VISUAL)};}
export function buildFlowRows(screens:ProjectObject[],flows:ProjectObject[]){const byId=new Map(screens.map(s=>[s.id,s]));const ordered=(ids:unknown)=>asStrings(ids).map(id=>byId.get(id)).filter((s):s is ProjectObject=>!!s);return flows.map(flow=>({flow,screens:ordered(flow.data.screenIds),states:ordered(flow.data.stateIds)})).filter(row=>row.screens.length>0||row.states.length>0);}
export function visibleWindow<T>(items:T[],count:number){return items.slice(0,Math.max(0,count));}
export function visualOptions(objects:ProjectObject[],field:'variant'|'palette'){return [...new Set(objects.map(o=>asString(o.data[field])))].sort().map(value=>({value:value||DEFAULT_VISUAL,label:value||'Default'}));}
export function noteCounts(notes:{targetId:string;status:string}[]){const counts=new Map<string,number>();for(const note of notes)if(note.status!=='resolved')counts.set(note.targetId,(counts.get(note.targetId)??0)+1);return counts;}
