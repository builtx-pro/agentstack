import {useSyncExternalStore} from 'react';
import {setLocale} from '@shared/i18n';
import {resetLocale} from '@shared/i18n/locale-store';
import {DEFAULT_ACCENT,normalizeAccent} from '@shared/lib/accent-palette.util';
import type {Preferences} from '../model/account.schema';
type Appearance=Pick<Preferences,'accent'|'theme'>;
const defaults:Appearance={accent:DEFAULT_ACCENT,theme:'auto'};
let owner:string|null=null,saved:Appearance=defaults,preview:Partial<Appearance>|null=null,snapshot:Appearance=defaults;
const listeners=new Set<()=>void>();
function emit(){snapshot={...saved,...preview};listeners.forEach(listener=>listener());}
export function enterAccount(id:string|null){if(id===owner)return;const previous=owner;owner=id;saved=defaults;preview=null;if(previous)resetLocale();emit();}
export function applySavedAppearance(id:string,preferences:Preferences){if(owner!==id)return;saved={accent:normalizeAccent(preferences.accent),theme:preferences.theme};if(preferences.locale)setLocale(preferences.locale);else resetLocale();emit();}
export function previewAppearance(value:Partial<Appearance>){preview={...preview,...value};emit();}
export function clearAppearancePreview(){preview=null;emit();}
export function resetAccountAppearance(){owner=null;saved=defaults;preview=null;resetLocale();emit();}
export const getAppearance=()=>snapshot;
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const useAppearance=()=>useSyncExternalStore(subscribe,getAppearance,()=>defaults);

export function clearThemePreview(){if(preview){const {theme,...rest}=preview;preview=rest;}emit();}
