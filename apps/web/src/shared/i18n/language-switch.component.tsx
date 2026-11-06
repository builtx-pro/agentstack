import {SegmentedControl} from '@mantine/core';
import type {Locale} from './locale-store';
import {useI18n} from './use-i18n.hook';
export function LanguageSwitch({onChange,disabled=false}:{onChange?:(locale:Locale)=>void;disabled?:boolean}={}){const {locale,setLocale,t}=useI18n();return <SegmentedControl disabled={disabled} aria-label={t('Interface language')} value={locale} onChange={value=>{if(value==='en'||value==='ru')(onChange??setLocale)(value);}} data={[{value:'ru',label:'RU'},{value:'en',label:'EN'}]}/>;}
