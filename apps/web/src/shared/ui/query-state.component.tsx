import { Alert, Button, Skeleton, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
export function QueryState({pending,error,retry}:{pending?:boolean;error?:Error|null;retry?:()=>void}){if(error)return <Alert color="red" icon={<IconAlertCircle/>} title="We couldn't load this"><Stack gap="sm">{error.message}{retry&&<Button variant="light" color="red" size="xs" onClick={retry}>Try again</Button>}</Stack></Alert>;if(pending)return <Stack><Skeleton h={100} radius="lg"/><Skeleton h={230} radius="lg"/></Stack>;return null;}
