import {ActionIcon,Tooltip} from '@mantine/core';
import {useMediaQuery} from '@mantine/hooks';
import {IconMoon,IconSun} from '@tabler/icons-react';
import {notifications} from '@mantine/notifications';
import {useI18n} from '@shared/i18n';
import {useAccount,useAccountActions} from '../service/use-account.hook';
import {useAppearance,previewAppearance,clearThemePreview} from '../lib/appearance.store';
export function AccountThemeToggle(){const {t}=useI18n();const account=useAccount();const actions=useAccountActions(account.data?.user.id??'');const appearance=useAppearance();const systemDark=useMediaQuery('(prefers-color-scheme: dark)');const dark=appearance.theme==='dark'||appearance.theme==='auto'&&systemDark;const change=()=>{const theme=dark?'light':'dark';previewAppearance({theme});if(account.data)actions.patch.mutate({expectedVersion:account.data.version,preferences:{theme}},{onSuccess:clearThemePreview,onError:()=>{void account.refetch();notifications.show({color:'orange',message:t('Theme changed on this device. Save it in your account to synchronize it.')});}});};return <Tooltip label={t('Switch color theme')}><ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('Switch color theme')} loading={actions.patch.isPending} onClick={change}>{dark?<IconSun size={20}/>:<IconMoon size={20}/>}</ActionIcon></Tooltip>;}
