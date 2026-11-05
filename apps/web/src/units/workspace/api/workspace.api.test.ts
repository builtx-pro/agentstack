import {afterEach,describe,expect,it,vi} from 'vitest';
import {getObjects,getNotes} from './workspace.api';
afterEach(()=>vi.unstubAllGlobals());
const object=(index:number)=>({id:`object-${index}`,projectId:'project',key:`key-${index}`,kind:'screen',title:`Screen ${index}`,visibility:'customer',status:'ready',archived:false,version:1,data:{},createdAt:'2026-01-01',updatedAt:'2026-01-01'});
describe('large workspace catalog loading',()=>{
 it('loads every catalog object with bounded larger pages and follows the returned cursor',async()=>{
  const rows=Array.from({length:2501},(_,index)=>object(index));
  const fetch=vi.fn(async(input:string)=>{const url=new URL(input,'http://localhost');const limit=Number(url.searchParams.get('limit'));const start=Number(url.searchParams.get('cursor')??0);return Response.json({items:rows.slice(start,start+limit),nextCursor:start+limit<rows.length?String(start+limit):null});});
  vi.stubGlobal('fetch',fetch);const result=await getObjects('project');
  expect(result.map(row=>row.id)).toEqual(rows.map(row=>row.id));expect(fetch).toHaveBeenCalledTimes(3);
  for(const [url] of fetch.mock.calls){expect(new URL(url,'http://localhost').searchParams.get('limit')).toBe('1000');expect(url).toContain('archived=all');}
 });
 it('retains the ordinary page limit for notes',async()=>{const fetch=vi.fn(async(_input:string)=>Response.json({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetch);await getNotes('project');expect(fetch.mock.calls[0]?.[0]).toContain('limit=100');});
});
