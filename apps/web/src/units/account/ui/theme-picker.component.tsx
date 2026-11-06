import {SegmentedControl} from '@mantine/core';
import {useI18n} from '@shared/i18n';
import {useThemeSelection} from '../service/use-theme-selection.hook';
export function ThemePicker(){const {t}=useI18n();const selection=useThemeSelection();return <SegmentedControl size="xs" aria-label={t('Color theme')} value={selection.theme} disabled={selection.disabled} onChange={value=>{if(value==='light'||value==='dark'||value==='auto')selection.choose(value);}} data={[{value:'light',label:t('Light')},{value:'dark',label:t('Dark')},{value:'auto',label:t('System')}]}/>;}
