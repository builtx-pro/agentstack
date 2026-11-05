import {z} from 'zod';
export const legacySearchSchema=z.object({project:z.string().catch(''),kind:z.string().optional(),key:z.string().optional(),note:z.union([z.string(),z.number().int().safe().nonnegative()]).transform(String).optional(),v:z.string().optional(),p:z.string().optional(),q:z.string().optional()});
export type LegacySearch=z.infer<typeof legacySearchSchema>;
export interface LegacyTarget{projectId:string;kind:'screen'|'asset';key?:string;note?:string;variant:string;palette:string;q:string}
export function parseLegacyLink(search:LegacySearch,rawHash:string):LegacyTarget{
 if(!z.uuid().safeParse(search.project).success)throw new Error('This link is missing a valid project. Ask the workspace owner for an updated link.');
 const fragment=new URLSearchParams(rawHash.replace(/^#/,''));
 const explicitKind=search.kind;if(explicitKind&&explicitKind!=='screen'&&explicitKind!=='asset')throw new Error('This link has an unsupported target type.');
 const kind:'screen'|'asset'=explicitKind==='asset'||(!explicitKind&&fragment.has('asset'))?'asset':'screen';
 let variant=kind==='screen'?(search.v??fragment.get('v')??'E'):'';
 let palette=kind==='screen'?(search.p??fragment.get('p')??''):'';
 const screen=fragment.get('s');const asset=fragment.get('asset');
 const key=search.key||(kind==='asset'?(asset||undefined):(screen?`${screen}:${variant}:${palette}`:undefined));
 const note=search.note??fragment.get('note')??undefined;
 if(note!==undefined&&!/^[1-9]\d{0,19}$/.test(note))throw new Error('This link has an invalid comment identifier.');
 if(note&&!key)throw new Error('This comment link is missing its screen or asset.');
 if(key&&key.length>400)throw new Error('This target identifier is too long.');
 if(search.key&&kind==='screen'){const parts=search.key.split(':');if(parts.length>=3){palette=parts.at(-1)??'';variant=parts.at(-2)??'E';}}
 if(variant.length>80||palette.length>80)throw new Error('This link has invalid variant or theme information.');
 return{projectId:search.project,kind,key,note,variant,palette,q:(search.q??fragment.get('q')??'').slice(0,500)};
}
export function legacyReturnTo(target:LegacyTarget):string{
 const query=new URLSearchParams({project:target.projectId});
 if(target.key){query.set('kind',target.kind);query.set('key',target.key);if(target.note)query.set('note',target.note);}
 else{query.set('kind',target.kind);if(target.variant)query.set('v',target.variant);if(target.palette)query.set('p',target.palette);if(target.q)query.set('q',target.q);}
 return `/legacy?${query.toString()}`;
}
