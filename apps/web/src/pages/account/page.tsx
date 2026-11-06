import {Navigate,useLocation,useNavigate} from '@tanstack/react-router';
import {IconUser,IconPalette,IconShieldLock,IconDevices,IconHistory} from '@tabler/icons-react';
import {SettingsSections} from '@shared/ui/settings-sections.component';
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
export function AccountPage(){const {t}=useI18n();const auth=AuthService.useAuth();const account=useAccount();const hash=useLocation({select:location=>location.hash});const navigate=useNavigate();const active=['profile','appearance','security','sessions','history'].includes(hash)?hash:'profile';if(auth.isPending)return <QueryState pending/>;if(!auth.data)return <Navigate to="/login" search={{returnTo:'/account'}}/>;return <Shell user={auth.data.user}><Stack className={classes.page} gap="xl"><Group justify="space-between" align="start"><div className={classes.hero}><Avatar src={account.data?.avatarUrl} size={48} radius="xl" alt={auth.data.user.name}>{initials(auth.data.user.name)}</Avatar><div><Title order={1}>{t('Your account')}</Title><Text c="dimmed" mt="xs">{t('Profile, appearance and security across all your projects.')}</Text></div></div><Button component="a" href="/" variant="subtle">{t('Back to projects')}</Button></Group><QueryState pending={account.isPending} error={account.error} retry={()=>void account.refetch()}/>{account.data&&<SettingsSections key={account.data.user.id} label={t('Account settings')} value={active} onChange={value=>void navigate({hash:value,replace:true})} sections={[
 {id:'profile',label:t('Profile'),description:t('Your name and avatar'),icon:<IconUser size={20} aria-hidden="true"/>,content:<ProfileCard account={account.data}/>},
 {id:'appearance',label:t('Appearance'),description:t('Theme, accent and language'),icon:<IconPalette size={20} aria-hidden="true"/>,content:<AppearanceCard account={account.data}/>},
 {id:'security',label:t('Security'),description:t('Password and authentication'),icon:<IconShieldLock size={20} aria-hidden="true"/>,content:<Stack><MfaCard account={account.data}/><PasswordCard account={account.data}/></Stack>},
 {id:'sessions',label:t('Sessions'),description:t('Devices signed into your account'),icon:<IconDevices size={20} aria-hidden="true"/>,content:<SessionsCard userId={account.data.user.id}/>},
 {id:'history',label:t('History'),description:t('Changes to your account'),icon:<IconHistory size={20} aria-hidden="true"/>,content:<AccountHistory userId={account.data.user.id}/>}
 ]}/>}</Stack></Shell>;}
