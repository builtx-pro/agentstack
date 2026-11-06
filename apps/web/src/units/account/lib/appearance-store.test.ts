import {afterEach,describe,expect,it,vi} from 'vitest';
import {applySavedAppearance,previewAppearance,clearAppearancePreview,getAppearance,enterAccount,resetAccountAppearance,setGuestTheme} from './appearance.store';
afterEach(()=>{vi.unstubAllGlobals();resetAccountAppearance();});
describe('account appearance isolation',()=>{
 it('applies account preference once and leaves live previews intact on background reads',()=>{enterAccount('one');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'en',onboardingCompleted:false});previewAppearance({accent:'#d6336c',theme:'light'});enterAccount('one');expect(getAppearance().accent).toBe('#d6336c');clearAppearancePreview();expect(getAppearance().accent).toBe('#228be6');});
 it('discards another account appearance when identity changes',()=>{enterAccount('one');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'en',onboardingCompleted:false});enterAccount('two');expect(getAppearance().accent).toBe('#d9480f');expect(getAppearance().theme).toBe('auto');});
 it('does not apply a delayed response belonging to a different account',()=>{enterAccount('two');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'ru',onboardingCompleted:false});expect(getAppearance().accent).toBe('#d9480f');});
});

it('keeps a guest theme across sign-out without retaining the account accent',()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 setGuestTheme('light');expect(values.get('agentstack.guest-theme')).toBe('light');enterAccount('one');applySavedAppearance('one',{accent:'#d6336c',theme:'dark',locale:'en',onboardingCompleted:false});expect(getAppearance().theme).toBe('dark');resetAccountAppearance();expect(getAppearance()).toEqual({accent:'#d9480f',theme:'light'});expect([...values.values()]).not.toContain('#d6336c');
});
it('guest theme can change when browser storage is blocked',()=>{vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}});setGuestTheme('dark');expect(getAppearance().theme).toBe('dark');resetAccountAppearance();expect(getAppearance().theme).toBe('auto');});
