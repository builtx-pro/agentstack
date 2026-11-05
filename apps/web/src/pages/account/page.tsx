import {Navigate} from '@tanstack/react-router';
import {Stack,Title,Text,Avatar,Group,Button} from '@mantine/core';
import {useI18n} from '@shared/i18n';
import {initials} from '@shared/lib/format.util';
import {QueryState} from '@shared/ui/query-state.component';
import {AuthService} from '@units/auth';
import {useAccount} from '@units/account';
import {Shell} from '@widgets/shell/shell.widget';
import {ProfileCard} from '@units/account/ui/profile-card.component';
import {AppearanceCard} from '@units/account/ui/appearance-card.component';
import {MfaCard} from '@units/account/ui/mfa-card.component';
import {PasswordCard} from '@units/account/ui/password-card.component';
import {SessionsCard} from '@units/account/ui/sessions-card.component';
import {AccountHistory} from '@units/account/ui/account-history.component';
import classes from '@units/account/ui/account.module.css';
export function AccountPage(){const {t}=useI18n();const auth=AuthService.useAuth();const account=useAccount();if(auth.isPending)return <QueryState pending/>;if(!auth.data)return <Navigate to="/login" search={{returnTo:'/account'}}/>;return <Shell user={auth.data.user}><Stack className={classes.page} gap="xl"><Group justify="space-between" align="start"><div className={classes.hero}><Avatar src={account.data?.avatarUrl} size={64} radius="xl" alt={auth.data.user.name}>{initials(auth.data.user.name)}</Avatar><div><Title order={1}>{t('Your account')}</Title><Text c="dimmed" mt="xs">{t('Profile, appearance and security across all your projects.')}</Text></div></div><Button component="a" href="/" variant="subtle">{t('Back to projects')}</Button></Group><QueryState pending={account.isPending} error={account.error} retry={()=>void account.refetch()}/>{account.data&&<div className={classes.cards}><ProfileCard key={`profile-${account.data.user.id}`} account={account.data}/><AppearanceCard key={`appearance-${account.data.user.id}`} account={account.data}/><MfaCard key={`mfa-${account.data.user.id}`} account={account.data}/><PasswordCard key={`password-${account.data.user.id}`} account={account.data}/><SessionsCard userId={account.data.user.id}/><AccountHistory userId={account.data.user.id}/></div>}</Stack></Shell>;}
