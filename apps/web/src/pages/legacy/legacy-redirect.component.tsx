import {translate as t,useI18n} from '@shared/i18n';
import {useEffect,useRef} from 'react';
import {Center,Loader} from '@mantine/core';
export function LegacyRedirect({href}:{href:string}){useI18n();const destination=useRef(href);useEffect(()=>{window.location.replace(destination.current);},[]);return <Center py="xl"><Loader aria-label={t("Opening saved review")}/></Center>;}
