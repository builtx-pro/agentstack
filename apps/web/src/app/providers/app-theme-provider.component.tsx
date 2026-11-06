import type {ReactNode} from 'react';
import {MantineProvider,Modal,PasswordInput,Select,MultiSelect,TagsInput,Progress} from '@mantine/core';
import {theme} from '@agentstack/ui';
import {useMediaQuery} from '@mantine/hooks';
import {useAppearance,useAccountPreferencesSync} from '@units/account';
import {accentPalette} from '@shared/lib/accent-palette.util';
import {useI18n} from '@shared/i18n';
export function AppThemeProvider({children}:{children:ReactNode}){
 const {t}=useI18n();useAccountPreferencesSync();const appearance=useAppearance();const systemDark=useMediaQuery('(prefers-color-scheme: dark)',undefined,{getInitialValueInEffect:false});const scheme=appearance.theme==='auto'?(systemDark?'dark':'light'):appearance.theme;const palette=accentPalette(appearance.accent);
 const clearButtonProps={'aria-label':t('Clear selection')};
 return <MantineProvider cssVariablesResolver={()=>{const colors={'--mantine-color-dimmed':'var(--app-text-muted)','--mantine-color-placeholder':'var(--app-text-muted)','--mantine-color-anchor':'var(--app-accent-text)','--mantine-color-violet-text':'var(--app-accent-text)','--mantine-color-violet-light-color':'var(--app-accent-text)'};const chartColors=(shade:number)=>Object.fromEntries(['gray','blue','teal','orange','red'].map(color=>[`--app-chart-${color}`,`var(--mantine-color-${color}-${shade})`]));return{variables:{},light:{...colors,...chartColors(8)},dark:{...colors,...chartColors(3)}};}} forceColorScheme={scheme} theme={{...theme,primaryColor:'violet',primaryShade:6,colors:{...theme.colors,violet:palette,accent:palette},components:{...theme.components,
  Progress:Progress.extend({defaultProps:{color:'var(--app-accent-text)',styles:{root:{backgroundColor:'var(--app-border)'}}}}),
  Modal:Modal.extend({defaultProps:{...theme.components?.Modal?.defaultProps,closeButtonProps:{'aria-label':t('Close')}}}),
  PasswordInput:PasswordInput.extend({defaultProps:{visibilityToggleButtonProps:{'aria-label':t('Toggle password visibility')}}}),
  Select:Select.extend({defaultProps:{...theme.components?.Select?.defaultProps,clearButtonProps}}),
  MultiSelect:MultiSelect.extend({defaultProps:{clearButtonProps}}),
  TagsInput:TagsInput.extend({defaultProps:{clearButtonProps}})
 }}}>{children}</MantineProvider>;
}
