import {describe,it,expect} from 'vitest';
import {safeInternalReturnTo} from './login-destination.util';
describe('login return destinations',()=>{
 it('preserves only an internal pathname and query',()=>{expect(safeInternalReturnTo('/legacy?project=one&key=screen%3AE%3A')).toBe('/legacy?project=one&key=screen%3AE%3A');expect(safeInternalReturnTo('/projects/one/screens?selected=x#private')).toBe('/projects/one/screens?selected=x');});
 it.each(['https://evil.test/','//evil.test/','/\\evil.test/','javascript:alert(1)','/%2f%2fevil.test','/%5cevil.test','/login?returnTo=/login','/login/','/%6cogin','/\n/evil.test',''])('rejects unsafe or looping destination %s',value=>expect(safeInternalReturnTo(value)).toBe('/'));
});
