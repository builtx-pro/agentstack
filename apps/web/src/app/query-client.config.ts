import {translate as t} from '@shared/i18n';
import {errorMessage} from '@shared/i18n/error-message.util';
import { QueryClient,MutationCache } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000}},mutationCache:new MutationCache({onError:(error,_variables,_context,mutation)=>{if(mutation.options.onError||error.name==='AbortError')return;notifications.show({color:'red',title:t("Change was not saved"),message:errorMessage(error)});}})});
