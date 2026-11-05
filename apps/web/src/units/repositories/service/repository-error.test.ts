import {afterEach,describe,expect,it} from 'vitest';
import {ApiError} from '@shared/api/client';
import {setLocale} from '@shared/i18n';
import {repositoryError} from './use-repositories.hook';

afterEach(()=>setLocale('en'));
describe('localized repository errors',()=>{
 it('explains a version conflict in the active language without provider details',()=>{
  const error=new ApiError(409,'version_conflict','private provider detail');
  setLocale('ru');
  expect(repositoryError(error)).toBe('Подключение или объект проекта изменились. Обновите просмотр перед применением.');
  setLocale('en');
  expect(repositoryError(error)).toBe('This connection or project item changed. Refresh the preview before applying.');
 });
 it('uses a safe translated fallback and does not display arbitrary provider errors',()=>{
  setLocale('ru');
  const message=repositoryError(new Error('private provider detail'));
  expect(message).toContain('Запрос к репозиторию не завершён');
  expect(message).not.toContain('private provider detail');
 });
});
