import {translate as t,getLocale} from '@shared/i18n';
export function formatDate(value:string){const d=new Date(value);return Number.isNaN(d.valueOf())?t("Unknown date"):new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short'}).format(d);}
export function initials(value:string){return value.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();}
export function safeHttpUrl(value:unknown):string|undefined{if(typeof value!=='string')return undefined;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}}
export function asString(value:unknown){return typeof value==='string'?value:'';}
export function asStrings(value:unknown){return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];}
