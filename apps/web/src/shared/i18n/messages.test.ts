import {describe,expect,it,afterEach} from 'vitest';
import {accountMessages} from './account-messages.constant';
import {appMessages} from './app-messages.constant';
import {settingsMessages} from './settings-messages.constant';
import {catalogMessages} from './catalog-messages.constant';
import {kindLabels,statusLabels,sectionInfo} from '@shared/lib/labels.constant';
import {navigation} from '@widgets/shell/navigation.constant';
import {setLocale,translate} from './locale-store';
import {errorMessage} from './error-message.util';
const messages={...appMessages,...settingsMessages,...catalogMessages,...accountMessages};
afterEach(()=>setLocale('en'));
describe('translation contracts',()=>{
 it('covers every navigation, section, kind and status label',()=>{
  for(const value of [...Object.values(kindLabels),...Object.values(statusLabels),...Object.values(sectionInfo).flat(),...navigation.map(item=>item.label)])expect(messages[value],value).toBeTruthy();
 });
 it('preserves interpolation placeholders in every Russian message',()=>{
  const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const [source,result]of Object.entries(messages))expect(placeholders(result),source).toEqual(placeholders(source));
 });
 it('renders technical errors safely without translating user content',()=>{
  setLocale('ru');expect(errorMessage({status:409,code:'version_conflict',message:'internal detail'})).toBe('Объект изменился. Обновите его и повторите действие.');
  expect(translate('Новый экран заказчика')).toBe('Новый экран заказчика');
 });
});
