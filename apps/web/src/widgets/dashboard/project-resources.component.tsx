import {SectionIllustration} from '@shared/ui/section-illustration.component';
import {translate as t,useI18n} from '@shared/i18n';
import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import type { ProjectObject } from '@shared/api/schemas';
import classes from './project-resources.module.css';

export function ProjectResources({ objects, onOpen, onTag }: {
  objects: ProjectObject[];
  onOpen: (id: string) => void;
  onTag: (tag:string,object:ProjectObject) => void;
}) {useI18n();
  const resources = objects
    .filter(object => object.kind === 'document' && !object.archived && object.tags.includes('project-resource'))
    .sort((a, b) => a.title.localeCompare(b.title, 'en') || a.key.localeCompare(b.key, 'en'));
  if (!resources.length) return null;

  return <section aria-labelledby="project-resources-title">
    <Title order={2} size="h3" id="project-resources-title" mb="xs">{t("Project resources")}</Title>
    <Text size="sm" c="dimmed" mb="md">{t("Presentations, tools and references, with their own notes and revision history.")}</Text>
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
      {resources.map(resource => <Paper key={resource.id} component="article" withBorder p="lg" className={classes.card}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <SectionIllustration name="knowledge" size={64} className={classes.icon}/>
          <Title order={3} size="h4" className={classes.title}>{resource.title}</Title>
        </Group>
        {resource.description && <Text size="sm" c="dimmed" className={classes.description}>{resource.description}</Text>}
        <Stack gap="md" className={classes.footer}>
          {resource.tags.some(tag => tag !== 'project-resource') && <Group gap={6}>
            {resource.tags.filter(tag => tag !== 'project-resource').map(tag => <Badge key={tag} component="button" type="button" onClick={()=>onTag(tag,resource)} size="sm" variant="light" color="gray" className={classes.tag}>{tag}</Badge>)}
          </Group>}
          <Button variant="light" rightSection={<IconArrowRight size={16} />} onClick={() => onOpen(resource.id)} className={classes.button}>{t("Open")} {resource.title}
          </Button>
        </Stack>
      </Paper>)}
    </SimpleGrid>
  </section>;
}
