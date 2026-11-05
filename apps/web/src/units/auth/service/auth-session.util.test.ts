import {describe,it,expect} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {reconcileAuthSession} from './auth-session.util';
const user=(id:string)=>({id,name:id,email:`${id}@example.test`,isAdmin:false});
describe('session identity boundary',()=>{
 for(const next of [{user:user('b')},null])it(`purges previous project and account caches before ${next?'another identity':'sign-out'}`,async()=>{const client=new QueryClient();client.setQueryData(['auth'],{user:user('a')});client.setQueryData(['project','private','objects'],[{title:'A private screen'}]);client.setQueryData(['account','a'],{name:'A private profile'});const result=await reconcileAuthSession(client,next);expect(result).toEqual(next);expect(client.getQueryData(['project','private','objects'])).toBeUndefined();expect(client.getQueryData(['account','a'])).toBeUndefined();expect(client.getQueryData(['auth'])).toEqual({user:user('a')});client.clear();});
 it('keeps usable caches when the same identity refreshes',async()=>{const client=new QueryClient();client.setQueryData(['auth'],{user:user('a')});client.setQueryData(['projects'],['current']);await reconcileAuthSession(client,{user:user('a')});expect(client.getQueryData(['projects'])).toEqual(['current']);client.clear();});
});
