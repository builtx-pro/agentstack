import {beforeEach,describe,expect,it,vi} from 'vitest';
const fs=vi.hoisted(()=>({mkdir:vi.fn(),writeFile:vi.fn(),unlink:vi.fn()}));
vi.mock('node:fs/promises',async importOriginal=>({...await importOriginal<typeof import('node:fs/promises')>(),...fs}));
import {storeFile} from '../src/files/files.service.js';
import type {Context} from '../src/db/database.service.js';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64');
beforeEach(()=>{vi.resetAllMocks();fs.mkdir.mockResolvedValue(undefined);fs.writeFile.mockResolvedValue(undefined);fs.unlink.mockResolvedValue(undefined)});
describe('immutable upload failure cleanup',()=>{
 const context=()=>({role:'admin',projectId:'synthetic-project',principal:{id:'synthetic-operator'},db:{query:vi.fn().mockResolvedValue({rows:[]})}} as unknown as Context);
 it('removes a partially written file after disk-full failure',async()=>{fs.writeFile.mockRejectedValueOnce(Object.assign(new Error('disk full'),{code:'ENOSPC'}));const ctx=context();await expect(storeFile(ctx,'/synthetic-storage','image.png',bytes)).rejects.toThrow('disk full');expect(fs.unlink).toHaveBeenCalledOnce();expect(fs.unlink.mock.calls[0]?.[0]).toMatch(/^\/synthetic-storage\/synthetic-project\/[a-f0-9-]+$/);expect(ctx.db.query).toHaveBeenCalledTimes(2)});
 it('does not remove a pre-existing file after exclusive-create conflict',async()=>{fs.writeFile.mockRejectedValueOnce(Object.assign(new Error('already exists'),{code:'EEXIST'}));await expect(storeFile(context(),'/synthetic-storage','image.png',bytes)).rejects.toThrow('already exists');expect(fs.unlink).not.toHaveBeenCalled()});
 it('removes newly written bytes when metadata insertion fails',async()=>{const ctx=context();vi.mocked(ctx.db.query).mockImplementation(async(sql:unknown)=>{if(String(sql).startsWith('INSERT INTO files'))throw new Error('metadata failed');return {rows:[]} as never});await expect(storeFile(ctx,'/synthetic-storage','image.png',bytes)).rejects.toThrow('metadata failed');expect(fs.unlink).toHaveBeenCalledOnce()});
});
