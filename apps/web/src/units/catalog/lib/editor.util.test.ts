import {describe,it,expect} from 'vitest';
import type {ProjectObject} from '@shared/api/schemas';
import {editorValues,toObjectDraft,editorPatch} from './editor.util';
function object(kind:ProjectObject['kind'],data:ProjectObject['data']):ProjectObject{return{id:'one',projectId:'project',key:'one',kind,title:'Original',description:'',tags:[],visibility:'team',status:'backlog',version:3,archived:false,data,createdAt:'2026-11-05',updatedAt:'2026-11-05'};}
describe('object editor PATCH preservation',()=>{
 it('keeps the assignee while editing story fields',()=>{const original=object('story',{assigneeId:'user-1',epicId:'epic-1',priority:'normal',checklist:[]});const values=editorValues(original);values.title='Revised story';values.blocked=true;const patch=editorPatch(original,toObjectDraft(values));expect(patch.data.assigneeId).toBe('user-1');expect(patch.data.blocked).toBe(true);expect(patch.title).toBe('Revised story');expect(patch.expectedVersion).toBe(3);});
 it('keeps the linked story of a converted proposal',()=>{const original=object('proposal',{linkedStoryId:'story-1',proposalType:'feature',decision:'Accepted'});const values=editorValues(original);values.description='More detail';expect(editorPatch(original,toObjectDraft(values)).data.linkedStoryId).toBe('story-1');});
 it('still clears represented optional fields without copying object metadata',()=>{const original=object('story',{assigneeId:'user-1',epicId:'epic-1'});const values=editorValues(original);values.epicId='';const patch=JSON.parse(JSON.stringify(editorPatch(original,toObjectDraft(values))));expect(patch.data).not.toHaveProperty('epicId');expect(patch.data.assigneeId).toBe('user-1');expect(patch).not.toHaveProperty('projectId');});
});
