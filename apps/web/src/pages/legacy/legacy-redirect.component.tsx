import {useEffect,useRef} from 'react';
import {Center,Loader} from '@mantine/core';
export function LegacyRedirect({href}:{href:string}){const destination=useRef(href);useEffect(()=>{window.location.replace(destination.current);},[]);return <Center py="xl"><Loader aria-label="Opening saved review"/></Center>;}
