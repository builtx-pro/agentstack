import { useState } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { useI18n } from "@shared/i18n";
import { Markdown } from "./markdown.component";
import classes from "./markdown.module.css";
/** Source stays inert text; rendered mode never enables raw HTML or remote images. */
export function MarkdownContent({ children }: { children: string }) {
  const { t } = useI18n();
  const [view, setView] = useState("rendered");
  return (
    <Stack gap="md">
      <SegmentedControl
        aria-label={t("Content view")}
        value={view}
        onChange={setView}
        data={[
          { value: "rendered", label: t("Markdown view") },
          { value: "source", label: t("Plain text") },
        ]}
        className={classes.switch}
      />
      {view === "rendered" ? (
        <Markdown>{children}</Markdown>
      ) : (
        <pre className={classes.source}>{children}</pre>
      )}
    </Stack>
  );
}
