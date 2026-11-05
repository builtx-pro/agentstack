import {useEffect} from 'react';
import {Center,Loader,Stack,Text} from '@mantine/core';
import {safeInternalReturnTo} from '../login-destination.util';
export function LoginRedirect({destination}:{destination:unknown}){const safe=safeInternalReturnTo(destination);useEffect(()=>{window.location.replace(safe);},[safe]);return <Center mih="50vh"><Stack align="center"><Loader size="sm"/><Text c="dimmed">Opening your workspace…</Text></Stack></Center>;}
