import {useSyncExternalStore} from 'react';
import {getLocale,setLocale,subscribeLocale,translate} from './locale-store';
export function useI18n(){const locale=useSyncExternalStore(subscribeLocale,getLocale,()=> 'en' as const);return {locale,setLocale,t:translate};}
