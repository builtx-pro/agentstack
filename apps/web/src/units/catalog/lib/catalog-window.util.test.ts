import { describe, it, expect } from 'vitest';
import { buildFlowRows, chooseVisualDefaults, visibleWindow } from './catalog-window.util';
import type { ProjectObject } from '@shared/api/schemas';
const object = (id: string, kind: ProjectObject['kind']='screen', data:Record<string,unknown>={}):ProjectObject => ({id,projectId:'p',key:id,kind,title:id,description:'',tags:[],visibility:'customer',status:'ready',archived:false,version:1,data,createdAt:'2026-11-05',updatedAt:'2026-11-05'});
describe('large visual catalogs',()=>{
 it('chooses one real variant and the blank default palette without interpreting it as all',()=>{expect(chooseVisualDefaults([object('s1','screen',{variant:'E',palette:''}),object('s2','screen',{variant:'E',palette:'day'}),object('s3','screen',{variant:'J',palette:''})])).toEqual({variant:'E',palette:'__default'});});
 it('preserves flow step and alternate-state ordering and excludes unrelated theme flows',()=>{const a=object('a'),b=object('b'),error=object('error');const flows=[object('flow','flow',{screenIds:['b','a'],stateIds:['error']}),object('unrelated','flow',{screenIds:['j']})];const rows=buildFlowRows([a,b,error],flows);expect(rows).toHaveLength(1);expect(rows[0].screens.map(s=>s.id)).toEqual(['b','a']);expect(rows[0].states.map(s=>s.id)).toEqual(['error']);});
 it('limits a 11000-item render window without losing searchable records',()=>{const items=Array.from({length:11000},(_,i)=>object(`s${i}`));expect(visibleWindow(items,48)).toHaveLength(48);expect(items).toHaveLength(11000);expect(visibleWindow(items,96)).toHaveLength(96);});
});
