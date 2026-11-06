import {ActionIcon,Tooltip} from '@mantine/core';
import {useMediaQuery} from '@mantine/hooks';
import {IconMoon,IconSun} from '@tabler/icons-react';
import {useI18n} from '@shared/i18n';
import {useThemeSelection} from '../service/use-theme-selection.hook';
export function AccountThemeToggle(){const {t}=useI18n();const selection=useThemeSelection();const systemDark=useMediaQuery('(prefers-color-scheme: dark)',undefined,{getInitialValueInEffect:false});const dark=selection.theme==='dark'||selection.theme==='auto'&&systemDark;return <Tooltip label={t('Switch color theme')}><ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('Switch color theme')} loading={selection.saving} disabled={selection.disabled} onClick={()=>selection.choose(dark?'light':'dark')}>{dark?<IconSun size={20}/>:<IconMoon size={20}/>}</ActionIcon></Tooltip>;}
