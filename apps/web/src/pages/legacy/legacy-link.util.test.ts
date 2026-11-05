import {describe,it,expect} from 'vitest';
import {parseLegacyLink,legacyReturnTo,legacySearchSchema} from './legacy-link.util';
const project='11111111-1111-4111-8111-111111111111';
describe('legacy Concepts bookmark normalization',()=>{
 it('keeps the exact screen, variant, blank palette and numeric comment',()=>{const target=parseLegacyLink({project},'#view=variant&v=J&p=&s=g16-confirm-login&note=8');expect(target).toMatchObject({projectId:project,kind:'screen',key:'g16-confirm-login:J:',note:'8',variant:'J',palette:''});expect(legacyReturnTo(target)).toBe(`/legacy?project=${project}&kind=screen&key=g16-confirm-login%3AJ%3A&note=8`);});
 it('keeps asset stable identity instead of changing it into a screen key',()=>{expect(parseLegacyLink({project},'#asset=asset-abc123&note=12')).toMatchObject({kind:'asset',key:'asset-abc123',note:'12'});});
 it('supports explicit normalized queries and an index-only fallback',()=>{expect(parseLegacyLink({project,kind:'screen',key:'g01:E:day',note:'3'},'')).toMatchObject({key:'g01:E:day',note:'3'});expect(parseLegacyLink({project},'#view=variant&v=E&p=day&q=recovery')).toMatchObject({key:undefined,variant:'E',palette:'day',q:'recovery'});});
 it('normalizes numeric query values parsed by the router',()=>expect(legacySearchSchema.parse({project,note:8}).note).toBe('8'));
 it('rejects malformed projects and comment IDs instead of silently dropping them',()=>{expect(()=>parseLegacyLink({project:'other-host'},'#s=screen')).toThrow();expect(()=>parseLegacyLink({project},'#asset=asset-one&note=not-a-number')).toThrow();});
});
