import {OnboardingWelcome} from '@widgets/onboarding-welcome/onboarding-welcome.widget';
import {SectionIllustration} from '@shared/ui/section-illustration.component';
import {translate as t,useI18n} from '@shared/i18n';
import { Navigate,Link } from '@tanstack/react-router';
import { Button,Group,Title,Text,SimpleGrid,Paper,Stack,Badge,Modal,TextInput,Textarea } from '@mantine/core';
import { IconPlus,IconArrowUpRight,IconShieldCheck,IconUsers } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { AuthService } from '@units/auth';
import { WorkspaceService } from '@units/workspace';
import { Shell } from '@widgets/shell/shell.widget';
import { QueryState } from '@shared/ui/query-state.component';
import { EmptyState } from '@shared/ui/empty-state.component';
import classes from './projects.module.css';
export function ProjectsPage(){useI18n();const auth=AuthService.useAuth();const projects=WorkspaceService.useProjects(!!auth.data);const mutation=WorkspaceService.useWorkspaceMutation('');const [opened,dialog]=useDisclosure();const form=useForm({initialValues:{name:'',slug:'',description:''},validate:{name:v=>v.trim()?null:t("Name is required"),slug:v=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)?null:t("Use lowercase letters, numbers and hyphens")}});if(auth.isPending)return <QueryState pending/>;if(!auth.data)return <Navigate to="/login"/>;return <Shell user={auth.data.user}><Group justify="space-between" mb="xl"><div><Text size="xs" c="violet" fw={700} tt="uppercase" mb={8}>{t("Your workspace")}</Text><Title order={1}>{t("Build with clarity.")}</Title><Text c="dimmed" mt="xs">{t("All your projects, feedback and agent work in one place.")}</Text></div>{auth.data.user.isAdmin&&<Button leftSection={<IconPlus size={17}/>} onClick={dialog.open}>{t("New project")}</Button>}</Group><OnboardingWelcome userId={auth.data.user.id}/><Group mb="lg"><Button component={Link} to="/guide" variant="light">{t("Getting started")}</Button></Group><QueryState pending={projects.isPending} error={projects.error} retry={()=>void projects.refetch()}/>{projects.data?.length===0&&<EmptyState title={t("Your next project starts here")} description={t("Create a project, add its screens and invite your team. Your customers will only see what you share.")}/>}<SimpleGrid cols={{base:1,sm:2,lg:3}}>{projects.data?.map(project=><Paper component="article" key={project.id} withBorder className={classes.card}>
 <SectionIllustration name="knowledge" size={240} className={classes.artwork}/>
 <div className={classes.cardContent}><Badge className={classes.role} variant="outline" color="var(--app-accent-text)" leftSection={project.role&&project.role!=='admin'?<IconUsers size={13} aria-hidden="true"/>:<IconShieldCheck size={13} aria-hidden="true"/>}>{t(project.role??'Admin')}</Badge>
 <Title order={2} size="h3" className={classes.title}>{project.name}</Title><Text c="dimmed" size="sm" lineClamp={3} className={classes.description}>{project.description||t("A shared workspace for this project.")}</Text></div>
 <Button component="a" href={`/projects/${project.id}/overview`} variant="filled" className={classes.open} rightSection={<IconArrowUpRight size={17} aria-hidden="true"/>}>{t("Open project")}</Button>
 </Paper>)}</SimpleGrid><Modal opened={opened} onClose={dialog.close} title={t("Create a project")}><form onSubmit={form.onSubmit(values=>mutation.mutate({path:'/projects',body:values},{onSuccess:()=>{dialog.close();form.reset();}}))}><Stack><TextInput label={t("Project name")} placeholder={t("Customer portal")} required {...form.getInputProps('name')}/><TextInput label={t("Project URL name")} placeholder="customer-portal" required {...form.getInputProps('slug')}/><Textarea label={t("Description")} {...form.getInputProps('description')}/><Button type="submit" loading={mutation.isPending}>{t("Create project")}</Button></Stack></form></Modal></Shell>;}
