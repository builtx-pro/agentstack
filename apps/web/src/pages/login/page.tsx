import {ThemePicker} from '@units/account';
import {useEffect,useState} from 'react';
import {Button,Paper,TextInput,PasswordInput,Stack,Title,Text,Container,ThemeIcon,Alert,Anchor,Group} from '@mantine/core';
import {IconStack2,IconShieldLock} from '@tabler/icons-react';
import {useForm} from '@mantine/form';
import {useSearch} from '@tanstack/react-router';
import {useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {LanguageSwitch,useI18n} from '@shared/i18n';
import {request,mutationOptions} from '@shared/api/client';
import {userSchema} from '@shared/api/schemas';
import {QueryKeys} from '@shared/lib/query-keys.constant';
import {errorMessage} from '@shared/i18n/error-message.util';
import {LoginRedirect} from './ui/login-redirect.component';
import {AuthService} from '@units/auth';
import {FactorInput} from '@units/account/ui/factor-input.component';
import {useSensitiveAction} from '@units/account/service/use-sensitive-action.hook';
import {accountError} from '@units/account/lib/account-error.util';
export function LoginPage(){
 const {t}=useI18n();const search=useSearch({from:'/login'});const client=useQueryClient();const auth=AuthService.useAuth();const login=AuthService.useLogin();const verify=useSensitiveAction();
 const [challenge,setChallenge]=useState<{challenge:string;expiresAt:string}|null>(null);const [code,setCode]=useState('');const [expired,setExpired]=useState(false);
 const form=useForm({initialValues:{email:'',password:''},validate:{email:v=>/^\S+@\S+\.\S+$/.test(v)?null:t('Enter a valid email'),password:v=>v?null:t('Enter your password')}});
 useEffect(()=>{setExpired(false);if(!challenge)return;const timer=setTimeout(()=>setExpired(true),Math.max(0,Date.parse(challenge.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[challenge]);
 if(auth.data)return <LoginRedirect destination={search.returnTo}/>;
 const back=()=>{setChallenge(null);setCode('');verify.clearError();login.reset();};
 return <Container component="main" size={440} py={60}><Group justify="space-between" gap="xs" mb="xl"><ThemePicker/><LanguageSwitch/></Group><Stack align="center" mb="xl"><ThemeIcon size={52} radius="lg">{challenge?<IconShieldLock size={30}/>:<IconStack2 size={30}/>}</ThemeIcon><Title order={1} ta="center">{t(challenge?'Verify your sign-in':'Welcome to AgentStack')}</Title><Text c="dimmed" ta="center">{t(challenge?'Your password was accepted. Complete the second step to continue.':'Your team, your agents, one shared workspace.')}</Text></Stack><Paper withBorder p="xl" shadow="xs">{challenge?<form onSubmit={event=>{event.preventDefault();void verify.run(()=>request('/auth/mfa/verify',z.object({user:userSchema}),mutationOptions('POST',{challenge:challenge.challenge,code}))).then(result=>{setCode('');if(result){setChallenge(null);client.clear();client.setQueryData(QueryKeys.auth(),{user:result.user});}});}}><Stack>{!!verify.error&&<Alert color="red" role="alert">{accountError(verify.error)}</Alert>}{expired&&<Alert color="orange">{t('This sign-in expired. Enter your password again to start a new sign-in.')}</Alert>}<FactorInput value={code} onChange={setCode} disabled={verify.pending||expired}/><Button type="submit" loading={verify.pending} disabled={code.trim().length<6||expired}>{t('Verify and sign in')}</Button><Button type="button" variant="subtle" onClick={back} disabled={verify.pending}>{t('Back to password')}</Button></Stack></form>:<form onSubmit={form.onSubmit(values=>login.mutate(values,{onSuccess:result=>{form.setFieldValue('password','');if('mfaRequired'in result)setChallenge({challenge:result.challenge,expiresAt:result.expiresAt});login.reset();}}))}><Stack>{login.error&&<Alert color="red" role="alert">{errorMessage(login.error)}</Alert>}<TextInput label={t('Email')} autoComplete="username" placeholder="you@company.com" required {...form.getInputProps('email')}/><PasswordInput label={t('Password')} autoComplete="current-password" required {...form.getInputProps('password')}/><Button type="submit" loading={login.isPending} mt="sm">{t('Sign in')}</Button><Text size="xs" c="dimmed" ta="center">{t('Need access? Ask your workspace administrator for an invitation.')}</Text><Anchor href="/invite" ta="center" size="sm">{t('Accept an invitation')}</Anchor></Stack></form>}</Paper></Container>;
}
