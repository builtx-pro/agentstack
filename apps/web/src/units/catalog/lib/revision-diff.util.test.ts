import {describe,it,expect} from 'vitest';
import type {ProjectObject,ReviewNote} from '@shared/api/schemas';
import {revisionChanges,revisionNotes} from './revision-diff.util';
const base:ProjectObject={id:'object',projectId:'project',key:'object',kind:'story',createdAt:'2026-11-05',updatedAt:'2026-11-05',title:'Title',description:'',tags:['one'],visibility:'team',status:'ready',archived:false,data:{checklist:[{id:'task',text:'Check',done:false}],assigneeId:'one'},version:1};
describe('revision comparisons',()=>{
 it('identifies exact changed nested fields and ignores timestamps/version metadata',()=>{const changed={...base,version:2,updatedAt:'new',data:{...base.data,checklist:[{id:'task',text:'Check',done:true}]}};expect(revisionChanges(base,changed)).toEqual([{path:'data.checklist[1].done',before:false,after:true}]);});
 it('reports added and removed values',()=>{const changed={...base,tags:[],data:{...base.data,assigneeId:undefined,epicId:'epic'}};expect(revisionChanges(base,changed)).toContainEqual({path:'data.assigneeId',before:'one',after:undefined});expect(revisionChanges(base,changed)).toContainEqual({path:'tags[1]',before:'one',after:undefined});expect(revisionChanges(base,changed)).toContainEqual({path:'data.epicId',before:undefined,after:'epic'});});
 it('scopes comments to the exact object and revision, without mixing later notes',()=>{const notes=[{id:'old',targetId:'object',targetVersion:1},{id:'current',targetId:'object',targetVersion:2},{id:'other',targetId:'other',targetVersion:1}] as ReviewNote[];expect(revisionNotes(notes,'object',1).map(note=>note.id)).toEqual(['old']);expect(revisionNotes(notes,'object',2).map(note=>note.id)).toEqual(['current']);});
});
