import {Paper,Stack,Text,Title} from '@mantine/core';
import type {ReactNode} from 'react';
import {SectionIllustration,type SectionIllustrationName} from './section-illustration.component';
export function EmptyState({title,description,action,illustration='knowledge'}:{title:string;description:string;action?:ReactNode;illustration?:SectionIllustrationName}){return <Paper component="section" withBorder p="xl"><Stack align="center" gap="md" py="lg"><SectionIllustration name={illustration} size={112}/><Title order={2} size="h3" ta="center">{title}</Title><Text c="dimmed" ta="center" maw={460}>{description}</Text>{action}</Stack></Paper>;}
