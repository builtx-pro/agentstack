import type {ObjectKind} from '@shared/api/schemas';
import type {CatalogFilters} from '../model/search.schema';
export function tagFilter(tag:string,kind:ObjectKind,archived:boolean):CatalogFilters{return{tag,q:'',flow:'',status:'',kind:'',selected:'',mode:'grid',variant:kind==='screen'||kind==='flow'?'__all':'',palette:kind==='screen'||kind==='flow'?'__all':'',archived};}
export function tagSection(kind:ObjectKind){return kind==='asset'?'assets':kind==='screen'||kind==='flow'?'screens':kind==='document'||kind==='rule'?'documents':kind==='feature'||kind==='proposal'?'features':'plan';}
