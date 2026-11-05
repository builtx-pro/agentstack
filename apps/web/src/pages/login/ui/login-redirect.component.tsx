import {translate as t,useI18n} from '@shared/i18n';
import {useEffect} from 'react';
import {Center,Loader,Stack,Text} from '@mantine/core';
import {safeInternalReturnTo} from '../login-destination.util';
export function LoginRedirect({destination}:{destination:unknown}){useI18n();const safe=safeInternalReturnTo(destination);useEffect(()=>{window.location.replace(safe);},[safe]);return <Center mih="50vh"><Stack align="center"><Loader size="sm"/><Text c="dimmed">{t("Opening your workspace…")}</Text></Stack></Center>;}
