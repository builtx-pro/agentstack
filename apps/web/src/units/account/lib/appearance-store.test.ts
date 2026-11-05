import {afterEach,describe,expect,it} from 'vitest';
import {applySavedAppearance,previewAppearance,clearAppearancePreview,getAppearance,enterAccount,resetAccountAppearance} from './appearance.store';
afterEach(resetAccountAppearance);
describe('account appearance isolation',()=>{
 it('applies account preference once and leaves live previews intact on background reads',()=>{enterAccount('one');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'en',onboardingCompleted:false});previewAppearance({accent:'#d6336c',theme:'light'});enterAccount('one');expect(getAppearance().accent).toBe('#d6336c');clearAppearancePreview();expect(getAppearance().accent).toBe('#228be6');});
 it('discards another account appearance when identity changes',()=>{enterAccount('one');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'en',onboardingCompleted:false});enterAccount('two');expect(getAppearance().accent).toBe('#7950f2');expect(getAppearance().theme).toBe('auto');});
 it('does not apply a delayed response belonging to a different account',()=>{enterAccount('two');applySavedAppearance('one',{accent:'#228be6',theme:'dark',locale:'ru',onboardingCompleted:false});expect(getAppearance().accent).toBe('#7950f2');});
});
