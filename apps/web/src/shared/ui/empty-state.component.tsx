import { Paper, Stack, ThemeIcon, Text, Title } from '@mantine/core';
import { IconStack2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
export function EmptyState({title,description,action}:{title:string;description:string;action?:ReactNode}){return <Paper withBorder p="xl"><Stack align="center" gap="md" py="xl"><ThemeIcon size={56} radius="xl" variant="light"><IconStack2 size={27}/></ThemeIcon><Title order={3} ta="center">{title}</Title><Text c="dimmed" ta="center" maw={460}>{description}</Text>{action}</Stack></Paper>;}
