import {useI18n,LanguageSwitch} from '@shared/i18n';
import {errorMessage} from '@shared/i18n/error-message.util';
import {createRootRoute,Outlet,type ErrorComponentProps} from '@tanstack/react-router';
import {Alert,Container,Button,Stack} from '@mantine/core';
function RouteError({error,reset}:ErrorComponentProps){const {t}=useI18n();return <Container component="main" py="xl"><Stack><LanguageSwitch/><Alert color="red" title={t("This page couldn't open")}><Stack>{errorMessage(error)}<Button onClick={reset}>{t('Try again')}</Button></Stack></Alert></Stack></Container>;}
function NotFound(){const {t}=useI18n();return <Container component="main" py="xl"><Stack><LanguageSwitch/><Alert title={t('Page not found')}>{t('Open the project workspace from the home page.')}</Alert><Button component="a" href="/" mt="md">{t('Projects')}</Button></Stack></Container>;}
export const Route=createRootRoute({component:Outlet,errorComponent:RouteError,notFoundComponent:NotFound});
