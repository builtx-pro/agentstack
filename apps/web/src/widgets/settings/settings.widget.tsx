import {useI18n} from '@shared/i18n';
import {Stack,Paper,Title,TextInput,Textarea,Button,Group,Text,Alert} from '@mantine/core';
import {useForm} from '@mantine/form';
import {useLocation,useNavigate} from '@tanstack/react-router';
import {IconRobot,IconFileImport,IconGitBranch,IconUsers,IconSettings,IconHistory} from '@tabler/icons-react';
import {SettingsSections,type SettingsSection} from '@shared/ui/settings-sections.component';
import {Repositories} from '../repositories/repositories.widget';
import type {Project} from '@shared/api/schemas';
import {WorkspaceService} from '@units/workspace';
import {Members} from './members.component';
import {Tokens} from './tokens.component';
import {ProjectContext} from './project-context.component';
import {ProjectHistory} from './project-history.component';
import {ImportCatalog} from './import.component';
export function Settings({project,isAdmin}:{project:Project;isAdmin:boolean}){
 const {t}=useI18n();const hash=useLocation({select:location=>location.hash});const navigate=useNavigate();const mutation=WorkspaceService.useWorkspaceMutation(project.id);const form=useForm({initialValues:{name:project.name,description:project.description??''}});
 const sections:SettingsSection[]=[
  {id:'agents',label:t('Agent connections'),description:t('Context and integration tokens'),icon:<IconRobot size={20} aria-hidden="true"/>,content:<Stack><ProjectContext projectId={project.id}/><Tokens projectId={project.id}/></Stack>},
  {id:'import',label:t('Import catalog'),description:t('Bring screens and assets'),icon:<IconFileImport size={20} aria-hidden="true"/>,content:<ImportCatalog projectId={project.id}/>},
  {id:'repositories',label:t('Repositories'),description:t('Source code and pipelines'),icon:<IconGitBranch size={20} aria-hidden="true"/>,content:<Repositories projectId={project.id} isAdmin={isAdmin}/>}
 ];
 if(isAdmin)sections.push(
  {id:'people',label:t('People & access'),description:t('Members and permissions'),icon:<IconUsers size={20} aria-hidden="true"/>,content:<Members projectId={project.id}/>},
  {id:'general',label:t('General'),description:t('Project details and archive'),icon:<IconSettings size={20} aria-hidden="true"/>,content:<Stack><Paper component="section" aria-labelledby="project-details-title" withBorder p="lg"><form onSubmit={form.onSubmit(values=>mutation.mutate({path:`/projects/${project.id}`,method:'PATCH',body:{expectedVersion:project.version,...values}}))}><Stack><Title order={2} size="h4" id="project-details-title">{t('Project details')}</Title><TextInput label={t('Project name')} required {...form.getInputProps('name')}/><Textarea label={t('Description')} {...form.getInputProps('description')}/><Group justify="flex-end"><Button type="submit" loading={mutation.isPending}>{t('Save details')}</Button></Group></Stack></form></Paper><Alert color="orange" title={t('Project archive')}><Text size="sm">{t('Archiving keeps content and history. It removes this project from the active workspace.')}</Text><Button color="orange" variant="light" mt="sm" onClick={()=>mutation.mutate({path:`/projects/${project.id}`,method:'PATCH',body:{expectedVersion:project.version,archived:!project.archived}})}>{project.archived?t('Restore project'):t('Archive project')}</Button></Alert></Stack>},
  {id:'history',label:t('History'),description:t('Project changes'),icon:<IconHistory size={20} aria-hidden="true"/>,content:<ProjectHistory projectId={project.id}/>}
 );
 const active=sections.some(section=>section.id===hash)?hash:'agents';
 return <SettingsSections key={project.id} label={t('Project settings')} sections={sections} value={active} onChange={value=>void navigate({hash:value,replace:true})}/>;
}
