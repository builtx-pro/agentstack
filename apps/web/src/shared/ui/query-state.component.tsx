import {useI18n} from '@shared/i18n';
import {errorMessage} from '@shared/i18n/error-message.util';
import {Alert,Button,Skeleton,Stack,VisuallyHidden} from '@mantine/core';
import {IconAlertCircle} from '@tabler/icons-react';
export function QueryState({pending,error,retry}:{pending?:boolean;error?:Error|null;retry?:()=>void}){const {t}=useI18n();if(error)return <Alert color="red" icon={<IconAlertCircle/>} title={t("We couldn't load this")}><Stack gap="sm">{errorMessage(error)}{retry&&<Button variant="light" color="red" size="xs" onClick={retry}>{t('Try again')}</Button>}</Stack></Alert>;if(pending)return <Stack role="status" aria-busy="true"><VisuallyHidden>{t('Loading content…')}</VisuallyHidden><Skeleton aria-hidden="true" h={100} radius="lg"/><Skeleton aria-hidden="true" h={230} radius="lg"/></Stack>;return null;}
