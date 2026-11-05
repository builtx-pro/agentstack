import {afterEach,describe,it,expect,vi} from 'vitest';
import {removeAvatar,revokeSessions} from './account.api';
const account={user:{id:'one',name:'One',email:'one@example.test',isAdmin:false},version:1,preferences:{locale:'en',theme:'light',accent:'#7950f2',onboardingCompleted:false},avatarUrl:null,mfaEnabled:false,recoveryCodesRemaining:0};
afterEach(()=>vi.unstubAllGlobals());
describe('account mutation transport',()=>{it('sends an explicit JSON object for bodyless DELETE routes',async()=>{const fetch=vi.fn(async(_url:string,init:RequestInit)=>{expect(init.method).toBe('DELETE');expect(JSON.parse(String(init.body))).toEqual({});return new Response(JSON.stringify(_url.includes('/avatar')?account:{ok:true,currentRevoked:false}),{status:200});});vi.stubGlobal('fetch',fetch);await removeAvatar(1);await revokeSessions('session-one');expect(fetch).toHaveBeenCalledTimes(2);});});
