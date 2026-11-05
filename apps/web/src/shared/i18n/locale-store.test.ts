// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {detectLocale,getLocale,setLocale,translate,formatNumber} from './locale-store';
describe('interface locale',()=>{
 afterEach(()=>{setLocale('en');localStorage.clear();vi.restoreAllMocks();});
 it('uses saved language, browser preference, then English fallback',()=>{expect(detectLocale('ru',['en-US'])).toBe('ru');expect(detectLocale(null,['ru-RU'])).toBe('ru');expect(detectLocale('invalid',['de-DE'])).toBe('en');});
 it('persists explicit selection and changes document language',()=>{setLocale('ru');expect(localStorage.getItem('agentstack.locale')).toBe('ru');expect(getLocale()).toBe('ru');expect(document.documentElement.lang).toBe('ru');});
 it('interpolates only named placeholders and preserves arbitrary text',()=>{setLocale('ru');expect(translate('Revision {version}',{version:7})).toBe('Версия 7');expect(translate('Private project text')).toBe('Private project text');expect(translate('constructor')).toBe('constructor');expect(translate('Unknown {value}',{value:'{secret}'})).toBe('Unknown {secret}');});
 it('uses selected locale for numbers',()=>{setLocale('ru');expect(formatNumber(1234.5)).toBe(new Intl.NumberFormat('ru').format(1234.5));});
 it('does not fail when storage is unavailable',()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});expect(()=>setLocale('ru')).not.toThrow();expect(getLocale()).toBe('ru');});
});
