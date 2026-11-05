import {Button,Group,Paper,Stack,Text,Title} from '@mantine/core';
import {Link} from '@tanstack/react-router';
import {useAccount,useAccountActions} from '@units/account';
import {useI18n} from '@shared/i18n';
import {QueryState} from '@shared/ui/query-state.component';
import {SectionIllustration} from '@shared/ui/section-illustration.component';

export function OnboardingWelcome({userId}:{userId:string}) {
 const {locale}=useI18n();const ru=locale==='ru';
 const account=useAccount(userId);const actions=useAccountActions(userId);
 if(account.isPending)return <QueryState pending/>;
 if(account.error)return <QueryState error={account.error} retry={()=>void account.refetch()}/>;
 if(!account.data||account.data.preferences.onboardingCompleted)return null;
 return <Paper component="section" withBorder p="lg" mb="xl" aria-labelledby="welcome-title">
  <Group align="flex-start" wrap="nowrap">
   <SectionIllustration name="knowledge" size={72}/>
   <Stack gap="sm" style={{minWidth:0,flex:1}}>
    <Title order={2} size="h3" id="welcome-title">{ru?'Соберите первый проект шаг за шагом':'Build your first workspace, step by step'}</Title>
    <Text c="dimmed" size="sm">{ru?'Создание и импорт проекта, экраны, замечания, работа с агентами и права команды. В руководстве объясняем каждый раздел на конкретных действиях.':'Create or import a project, review screens, leave feedback, work with agents and set team access. The guide explains every section through practical steps.'}</Text>
    <Group><Button component={Link} to="/guide">{ru?'Начать знакомство':'Start the guide'}</Button><Button variant="subtle" loading={actions.patch.isPending} onClick={()=>actions.patch.mutate({expectedVersion:account.data!.version,preferences:{onboardingCompleted:true}})}>{ru?'Я освоился, скрыть':'I know my way around'}</Button></Group>
    <Text c="dimmed" size="xs">{ru?'Руководство всегда доступно в меню помощи. Скрытие подсказки не меняет прогресс проекта.':'You can always reopen the guide from Help. Dismissing this tip does not change project progress.'}</Text>
    <QueryState error={actions.patch.error} retry={()=>{actions.patch.reset();void account.refetch();}}/>
   </Stack>
  </Group>
 </Paper>;
}
