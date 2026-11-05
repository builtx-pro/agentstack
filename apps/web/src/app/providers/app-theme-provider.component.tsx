import type {ReactNode} from 'react';
import {MantineProvider,Modal,PasswordInput,Select,MultiSelect,TagsInput} from '@mantine/core';
import {theme} from '@agentstack/ui';
import {useMediaQuery} from '@mantine/hooks';
import {useAppearance,useAccountPreferencesSync} from '@units/account';
import {accentPalette} from '@shared/lib/accent-palette.util';
import {useI18n} from '@shared/i18n';
export function AppThemeProvider({children}:{children:ReactNode}){
 const {t}=useI18n();useAccountPreferencesSync();const appearance=useAppearance();const systemDark=useMediaQuery('(prefers-color-scheme: dark)');const scheme=appearance.theme==='auto'?(systemDark?'dark':'light'):appearance.theme;const palette=accentPalette(appearance.accent);
 const clearButtonProps={'aria-label':t('Clear selection')};
 return <MantineProvider forceColorScheme={scheme} theme={{...theme,primaryColor:'violet',primaryShade:6,colors:{...theme.colors,violet:palette,accent:palette},components:{...theme.components,
  Modal:Modal.extend({defaultProps:{...theme.components?.Modal?.defaultProps,closeButtonProps:{'aria-label':t('Close')}}}),
  PasswordInput:PasswordInput.extend({defaultProps:{visibilityToggleButtonProps:{'aria-label':t('Toggle password visibility')}}}),
  Select:Select.extend({defaultProps:{...theme.components?.Select?.defaultProps,clearButtonProps}}),
  MultiSelect:MultiSelect.extend({defaultProps:{clearButtonProps}}),
  TagsInput:TagsInput.extend({defaultProps:{clearButtonProps}})
 }}}>{children}</MantineProvider>;
}
