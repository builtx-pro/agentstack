import {describe,it,expect} from 'vitest';
import {stripLocalPaths,replaceFileReferences} from './import.util';
describe('safe manifest preparation',()=>{
 it('keeps local file paths out of API payloads',()=>{const manifest={schemaVersion:1,objects:[],files:[{key:'a',path:'files/a.png',size:2,sha256:'ab',mimeType:'image/png'}]};expect(stripLocalPaths(manifest).files[0]).not.toHaveProperty('path');});
 it('rewrites only explicit file placeholders and rejects missing references',()=>{expect(replaceFileReferences({data:{imageFileId:'@file:a',title:'a'}},new Map([['a','uuid']]))).toEqual({data:{imageFileId:'uuid',title:'a'}});expect(()=>replaceFileReferences({fileId:'@file:missing'},new Map())).toThrow('missing');});
});

import {manifestSchema,verifyFiles} from './import.util';
it('accepts twelve thousand manifest objects',()=>{expect(manifestSchema.parse({schemaVersion:1,objects:Array.from({length:12000},()=>({})),files:[]}).objects).toHaveLength(12000);});
it('matches a selected folder by relative path before duplicate basenames',async()=>{const first=new File(['one'],'screen.png');const second=new File(['two'],'screen.png');Object.defineProperty(first,'webkitRelativePath',{value:'catalog/files/E/screen.png'});Object.defineProperty(second,'webkitRelativePath',{value:'catalog/files/J/screen.png'});const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await first.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');const manifest=manifestSchema.parse({schemaVersion:1,objects:[],files:[{key:'e',path:'files/E/screen.png',size:3,sha256:hash,mimeType:'image/png'}]});expect((await verifyFiles(manifest,[first,second])).get('e')).toBe(first);});
