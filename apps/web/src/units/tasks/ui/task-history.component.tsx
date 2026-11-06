import { Button, Modal, Paper, Stack, Text } from "@mantine/core";
import { useI18n } from "@shared/i18n";
import { formatDate } from "@shared/lib/format.util";
import { QueryState } from "@shared/ui/query-state.component";
import { StatusBadge } from "@shared/ui/status-badge.component";
import { useTaskHistory } from "../service/use-tasks.hook";
export function TaskHistory({
  owner,
  id,
  onClose,
}: {
  owner: string;
  id: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const query = useTaskHistory(owner, id, true);
  return (
    <Modal opened onClose={onClose} title={t("Task history")} size="lg">
      <Stack>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.data?.pages
          .flatMap((page) => page.items)
          .map((item) => (
            <Paper component="article" key={item.version} p="md" withBorder>
              <Stack gap="xs">
                <Text fw={600}>
                  v{item.version} · {formatDate(item.createdAt)}
                </Text>
                <Text>{item.snapshot.title}</Text>
                <StatusBadge status={item.snapshot.status} />
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {item.snapshot.description}
                </Text>
              </Stack>
            </Paper>
          ))}
        {query.hasNextPage && (
          <Button
            variant="default"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t("Load more")}
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
