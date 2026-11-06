import {designMessages} from './design-messages.constant';
import {accountMessages} from './account-messages.constant';
import {appMessages} from './app-messages.constant';
import {settingsMessages} from './settings-messages.constant';
import {catalogMessages} from './catalog-messages.constant';
const messages:Record<string,string>={...appMessages,...settingsMessages,...catalogMessages,...accountMessages,...designMessages};
export type Locale = 'en' | 'ru';
export type MessageValues = Readonly<Record<string,string|number>>;
export const LOCALE_STORAGE_KEY='agentstack.locale';
export function detectLocale(saved:unknown,languages:readonly string[]=[]):Locale{
 if(saved==='en'||saved==='ru')return saved;
 for(const language of languages){const base=language.toLowerCase().split('-')[0];if(base==='en'||base==='ru')return base;}
 return 'en';
}
function initialLocale():Locale{let saved:unknown;try{saved=globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);}catch{/* Storage may be disabled. */}return detectLocale(saved,typeof navigator==='undefined'?[]:navigator.languages);}
let locale:Locale=initialLocale();
const listeners=new Set<()=>void>();
export const getLocale=()=>locale;
function updateDocument(){if(typeof document!=='undefined')document.documentElement.lang=locale;}
export function setLocale(next:Locale){
 if(next!=='ru'&&next!=='en')return;
 const changed=locale!==next;locale=next;updateDocument();
 try{globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY,next);}catch{/* Keep the active choice for this session. */}
 if(changed)for(const listener of listeners)listener();
}
function onStorage(event:StorageEvent){if(event.key!==LOCALE_STORAGE_KEY)return;const next=detectLocale(event.newValue,typeof navigator==='undefined'?[]:navigator.languages);if(next!==locale){locale=next;updateDocument();for(const notify of listeners)notify();}}
export function subscribeLocale(listener:()=>void){
 listeners.add(listener);updateDocument();
 if(listeners.size===1&&typeof window!=='undefined')window.addEventListener('storage',onStorage);
 return()=>{listeners.delete(listener);if(listeners.size===0&&typeof window!=='undefined')window.removeEventListener('storage',onStorage);};
}
export function translate(message:string,values:MessageValues={},language:Locale=locale):string{
 const pattern=language==='ru'&&Object.hasOwn(messages,message)?messages[message]:message;
 return pattern.replace(/\{(\w+)\}/g,(token,key:string)=>Object.hasOwn(values,key)?String(values[key]):token);
}
export const formatNumber=(value:number,options?:Intl.NumberFormatOptions)=>new Intl.NumberFormat(locale,options).format(value);

export function resetLocale(){try{globalThis.localStorage?.removeItem(LOCALE_STORAGE_KEY);}catch{}locale=detectLocale(null,typeof navigator==='undefined'?[]:navigator.languages);updateDocument();for(const listener of listeners)listener();}
