import {notifications} from '@mantine/notifications';
import {AuthService} from '@units/auth';
import {useI18n} from '@shared/i18n';
import {useAccount,useAccountActions} from './use-account.hook';
import {useAppearance,previewAppearance,clearThemePreview,setGuestTheme} from '../lib/appearance.store';
import type {ThemeMode} from '../lib/guest-theme.store';
export function useThemeSelection(){
 const {t}=useI18n();const auth=AuthService.useAuth(false);const account=useAccount();const actions=useAccountActions(account.data?.user.id??'');const appearance=useAppearance();
 const choose=(theme:ThemeMode)=>{
  if(!auth.data){setGuestTheme(theme);return;}
  if(!account.data)return;
  previewAppearance({theme});actions.patch.mutate({expectedVersion:account.data.version,preferences:{theme}},{onSuccess:clearThemePreview,onError:()=>{void account.refetch();notifications.show({color:'orange',message:t('Theme changed on this device. Save it in your account to synchronize it.')});}});
 };
 return {theme:appearance.theme,choose,saving:actions.patch.isPending,disabled:auth.isPending||!!auth.data&&!account.data||actions.patch.isPending};
}
