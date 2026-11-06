import { translate as t, useI18n } from "@shared/i18n";
import {
  Image,
  Text,
  Stack,
  ThemeIcon,
  Anchor,
  Checkbox,
  Button,
  Group,
} from "@mantine/core";
import { IconPhoto, IconExternalLink } from "@tabler/icons-react";
import type { ProjectObject } from "@shared/api/schemas";
import { asString, safeHttpUrl } from "@shared/lib/format.util";
import { fileUrl } from "@shared/api/client";
import { MarkdownContent } from "@shared/ui/markdown-content.component";
import {
  objectImageId,
  readChecklist,
  markdownChecklist,
  replaceChecklistLine,
} from "../lib/catalog.util";
import { WorkspaceService } from "@units/workspace";
import { useState } from "react";
import classes from "./viewer.module.css";
export function ObjectPreview({
  object,
  canEdit = false,
  compact = false,
}: {
  object: ProjectObject;
  canEdit?: boolean;
  compact?: boolean;
}) {
  useI18n();
  const [live, setLive] = useState(false);
  const mutation = WorkspaceService.useWorkspaceMutation(object.projectId);
  const imageId = objectImageId(object);
  const preview = safeHttpUrl(object.data.previewUrl);
  const checklist = readChecklist(object.data);
  const mdChecks = markdownChecklist(asString(object.data.markdown));
  return (
    <Stack gap="md">
      {["screen", "asset"].includes(object.kind) ? (
        <>
          {live && preview ? (
            <iframe
              className={classes.live}
              data-frame={
                object.data.frame === "desktop" ? "desktop" : "mobile"
              }
              title={t("Isolated preview: {title}", { title: object.title })}
              src={preview}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          ) : imageId ? (
            <Image
              loading="lazy"
              decoding="async"
              data-frame={
                object.kind === "screen"
                  ? object.data.frame === "desktop"
                    ? "desktop"
                    : "mobile"
                  : "asset"
              }
              className={compact ? classes.thumb : classes.fullImage}
              src={fileUrl(object.projectId, imageId)}
              alt={object.title}
              fit="contain"
            />
          ) : (
            <div className={classes.noImage}>
              <ThemeIcon size={52} variant="light" color="gray">
                <IconPhoto size={28} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                {t("No image attached")}
              </Text>
            </div>
          )}
          {!compact && imageId && (
            <Anchor
              size="sm"
              href={fileUrl(object.projectId, imageId)}
              download
            >
              {t("Download image")}
            </Anchor>
          )}
          {!compact && preview && (
            <Group>
              <Button size="xs" variant="light" onClick={() => setLive(!live)}>
                {live ? t("Show screenshot") : t("Open isolated live preview")}
              </Button>
              <Anchor
                size="sm"
                href={preview}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Open in tab")} <IconExternalLink size={13} />
              </Anchor>
            </Group>
          )}
        </>
      ) : ["document", "rule"].includes(object.kind) ? (
        <>
          <MarkdownContent>
            {asString(object.data.markdown) || t("This document is empty.")}
          </MarkdownContent>
          {canEdit && mdChecks.length > 0 && (
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {t("Update document checklist")}
              </Text>
              {mdChecks.map((item, i) => (
                <Checkbox
                  key={item.id}
                  label={item.text}
                  checked={item.done}
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    mutation.mutate({
                      path: `/projects/${object.projectId}/objects/${object.id}`,
                      method: "PATCH",
                      body: {
                        expectedVersion: object.version,
                        data: {
                          ...object.data,
                          markdown: replaceChecklistLine(
                            asString(object.data.markdown),
                            i,
                            event.currentTarget.checked,
                          ),
                        },
                      },
                    })
                  }
                />
              ))}
            </Stack>
          )}
        </>
      ) : (
        <>
          <MarkdownContent>
            {object.description || t("No description yet.")}
          </MarkdownContent>
          {asString(object.data.goal) && (
            <Text>{asString(object.data.goal)}</Text>
          )}
          {checklist.length > 0 && (
            <Stack gap="sm">
              <Text fw={600}>{t("Acceptance checklist")}</Text>
              {checklist.map((item) => (
                <Checkbox
                  key={item.id}
                  label={item.text}
                  checked={item.done}
                  disabled={!canEdit || mutation.isPending}
                  onChange={(event) =>
                    mutation.mutate({
                      path: `/projects/${object.projectId}/objects/${object.id}`,
                      method: "PATCH",
                      body: {
                        expectedVersion: object.version,
                        data: {
                          ...object.data,
                          checklist: checklist.map((check) =>
                            check.id === item.id
                              ? { ...check, done: event.currentTarget.checked }
                              : check,
                          ),
                        },
                      },
                    })
                  }
                />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
