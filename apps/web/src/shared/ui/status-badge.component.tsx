import { Badge } from '@mantine/core';
import { statusColors,statusLabels } from '@shared/lib/labels.constant';
export function StatusBadge({status}:{status:string}){return <Badge color={statusColors[status]??'gray'}>{statusLabels[status]??status}</Badge>;}
