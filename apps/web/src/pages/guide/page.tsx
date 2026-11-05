import {useSetupChecks} from '@units/onboarding/service/use-setup-checks.hook';
import {SetupChecks} from '@units/onboarding/ui/setup-checks.component';
import {useState} from 'react';
import {Navigate,useNavigate} from '@tanstack/react-router';
import {Group,Select,Stack,Text,Title,Button} from '@mantine/core';
import {AuthService} from '@units/auth';
import {WorkspaceService} from '@units/workspace';
import {WorkspaceGuide} from '@units/onboarding/ui/guide.component';
import {Shell} from '@widgets/shell/shell.widget';
import {QueryState} from '@shared/ui/query-state.component';
import {useI18n} from '@shared/i18n';
export function GuidePage(){
 const {locale}=useI18n();const ru=locale==='ru';const auth=AuthService.useAuth();const projects=WorkspaceService.useProjects(!!auth.data);const[selected,setSelected]=useState('');const navigate=useNavigate();
 const project=projects.data?.find(p=>p.id===selected)??projects.data?.[0];const checks=useSetupChecks(project?.id);
 if(auth.isPending)return <QueryState pending/>;if(!auth.data)return <Navigate to="/login"/>;
 const openProjects=()=>void navigate({to:'/'});
 return <Shell user={auth.data.user}><Stack gap="xl"><header><Text size="sm" c="violet" fw={650}>{ru?'Добро пожаловать в AgentStack':'Welcome to AgentStack'}</Text><Title mt="xs">{ru?'От первого проекта до принятой правки':'From your first project to an accepted fix'}</Title><Text c="dimmed" mt="sm" maw={760}>{ru?'Пошаговое руководство для разработчика, заказчика и команды. Можно пройти его по порядку или открыть нужный раздел. Материалы проекта при этом не изменяются.':'A step-by-step guide for developers, customers and teams. Follow it in order or choose a chapter. Reading the guide does not change project materials.'}</Text></header><Group justify="space-between"><Select label={ru?'Проект для переходов':'Project for shortcuts'} placeholder={ru?'Сначала создайте проект':'Create a project first'} value={project?.id??null} data={(projects.data??[]).map(p=>({value:p.id,label:p.name}))} onChange={id=>setSelected(id??'')} w={{base:'100%',sm:320}}/><Button variant="default" onClick={openProjects}>{ru?'Все проекты':'All projects'}</Button></Group><QueryState error={projects.error} pending={projects.isPending} retry={()=>void projects.refetch()}/><>{project&&<SetupChecks checks={checks}/>}</><WorkspaceGuide canManage={!!auth.data.user.isAdmin||project?.role==='developer'||project?.role==='admin'} onOpenProjects={openProjects} onOpenSection={project?section=>void navigate({to:'/projects/$projectId/$section',params:{projectId:project.id,section},search:{q:'',tag:'',variant:'',palette:'',flow:'',status:'',kind:'',archived:false,selected:''}}):undefined}/></Stack></Shell>;
}
