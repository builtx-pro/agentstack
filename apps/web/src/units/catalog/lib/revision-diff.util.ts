import type {ProjectObject,ReviewNote} from '@shared/api/schemas';
export interface FieldChange{path:string;before:unknown;after:unknown}
const fields=['title','description','tags','visibility','status','archived','data'] as const;
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function revisionChanges(previous:ProjectObject,current:ProjectObject):FieldChange[]{
 const changes:FieldChange[]=[];
 function walk(path:string,before:unknown,after:unknown){
  if(Object.is(before,after))return;
  if(isRecord(before)&&isRecord(after)){for(const key of [...new Set([...Object.keys(before),...Object.keys(after)])].sort())walk(`${path}.${key}`,before[key],after[key]);return;}
  if(Array.isArray(before)&&Array.isArray(after)){for(let index=0;index<Math.max(before.length,after.length);index++)walk(`${path}[${index+1}]`,before[index],after[index]);return;}
  changes.push({path,before,after});
 }
 for(const field of fields)walk(field,previous[field],current[field]);return changes;
}
export function revisionNotes(notes:ReviewNote[],targetId:string,version:number){return notes.filter(note=>note.targetId===targetId&&note.targetVersion===version);}
export function diffValue(value:unknown):string{return value===undefined?'Not set':value===null?'None':typeof value==='string'?(value||'Empty'):JSON.stringify(value,null,2);}
