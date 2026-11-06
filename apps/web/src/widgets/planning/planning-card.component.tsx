import { useState } from "react";
import {
  Accordion,
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Progress,
} from "@mantine/core";
import { IconArrowUpRight, IconCheck } from "@tabler/icons-react";
import type { ProjectObject, ProgressData } from "@shared/api/schemas";
import { useI18n } from "@shared/i18n";
import { kindLabels } from "@shared/lib/labels.constant";
import { StatusBadge } from "@shared/ui/status-badge.component";
import { MarkdownContent } from "@shared/ui/markdown-content.component";
import { readChecklist } from "@units/catalog/lib/catalog.util";
import { planningChildren, planningSummary } from "./planning.util";
import classes from "./planning.module.css";
type Props = {
  object: ProjectObject;
  objects: ProjectObject[];
  progress?: ProgressData;
  onOpen: (id: string) => void;
  onTag: (tag: string, object: ProjectObject) => void;
  onConvert?: (object: ProjectObject) => void;
  converting?: boolean;
  depth?: number;
};
export function PlanningCard({
  object,
  objects,
  progress,
  onOpen,
  onTag,
  onConvert,
  converting,
  depth = 0,
}: Props) {
  const { t } = useI18n();
  const [childCount, setChildCount] = useState(20);
  const [expanded, setExpanded] = useState<string | null>(null);
  const children = depth < 2 ? planningChildren(object, objects) : [];
  const summary =
    progress?.groups.find((group) => group.id === object.id) ??
    planningSummary(object, objects);
  const checks = readChecklist(object.data);
  const group = ["wave", "epic", "sprint"].includes(object.kind);
  return (
    <Accordion
      order={depth === 0 ? 2 : depth === 1 ? 3 : 4}
      variant="separated"
      value={expanded}
      onChange={setExpanded}
    >
      <Accordion.Item value={object.id} className={classes.accordionItem}>
        <div className={classes.row}>
          <Accordion.Control
            aria-label={t("Expand {title}", { title: object.title })}
          >
            <span className={classes.label}>
              <span className={classes.meta}>
                <span>
                  {t(kindLabels[object.kind])} · {object.key}
                </span>
                <StatusBadge status={object.status} />
                {object.data.blocked === true && (
                  <Badge color="red">{t("Blocked")}</Badge>
                )}
              </span>
              <span className={classes.title}>{object.title}</span>
              <span className={classes.summary}>
                {group ? (
                  <span>
                    {summary.total
                      ? t("{done} of {total} stories complete", {
                          done: summary.done,
                          total: summary.total,
                        })
                      : t("No stories yet")}
                  </span>
                ) : (
                  <span>
                    {t("Revision {version}", { version: object.version })}
                  </span>
                )}
                {checks.length > 0 && (
                  <span>
                    <IconCheck size={13} aria-hidden="true" />{" "}
                    {checks.filter((check) => check.done).length}/
                    {checks.length} {t("checks")}
                  </span>
                )}
                {object.kind === "sprint" &&
                  typeof object.data.startDate === "string" && (
                    <span>
                      {object.data.startDate}{" "}
                      {typeof object.data.endDate === "string"
                        ? `→ ${object.data.endDate}`
                        : ""}
                    </span>
                  )}
              </span>
            </span>
          </Accordion.Control>
          <Button
            variant="default"
            className={classes.open}
            aria-label={t("Open {title}", { title: object.title })}
            onClick={() => onOpen(object.id)}
            rightSection={<IconArrowUpRight size={16} />}
          >
            {t("Open")}
          </Button>
        </div>
        {group && summary.total > 0 && (
          <Progress
            value={summary.percent}
            size={4}
            aria-label={t("Completion of {title}", { title: object.title })}
          />
        )}
        <Accordion.Panel>
          {expanded === object.id && (
            <Stack gap="lg">
              <Group justify="space-between">
                <Badge variant="outline" color="gray">
                  {object.visibility === "team" ? t("Team only") : t("Shared")}
                </Badge>
                <Text size="xs" c="dimmed">
                  {t("Revision {version}", { version: object.version })}
                </Text>
              </Group>
              <MarkdownContent>
                {(typeof object.data.markdown === "string"
                  ? object.data.markdown
                  : object.description) ||
                  (typeof object.data.goal === "string"
                    ? object.data.goal
                    : t("No description yet."))}
              </MarkdownContent>
              {object.tags.length > 0 && (
                <div className={classes.tags}>
                  {object.tags.map((tag) => (
                    <Badge
                      component="button"
                      type="button"
                      key={tag}
                      className={classes.tag}
                      variant="outline"
                      color="gray"
                      onClick={() => onTag(tag, object)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {children.length > 0 && (
                <div className={classes.nested}>
                  <Text fw={600} mb="sm">
                    {object.kind === "wave"
                      ? t("Epics in this wave")
                      : t("Stories in this scope")}
                  </Text>
                  <ul className={classes.list}>
                    {children.slice(0, childCount).map((child) => (
                      <li key={child.id}>
                        <PlanningCard
                          object={child}
                          objects={objects}
                          progress={progress}
                          onOpen={onOpen}
                          onTag={onTag}
                          depth={depth + 1}
                        />
                      </li>
                    ))}
                  </ul>
                  {children.length > childCount && (
                    <Button
                      variant="default"
                      mt="sm"
                      onClick={() => setChildCount((count) => count + 20)}
                    >
                      {t("Load more items")}
                    </Button>
                  )}
                </div>
              )}
              {onConvert &&
                object.kind === "proposal" &&
                !object.data.linkedStoryId && (
                  <Button
                    variant="light"
                    loading={converting}
                    onClick={() => onConvert(object)}
                  >
                    {t("Accept into plan")}
                  </Button>
                )}
            </Stack>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
