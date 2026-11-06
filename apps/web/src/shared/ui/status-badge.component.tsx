import {translate as t,useI18n} from '@shared/i18n';
import { Badge } from '@mantine/core';
import { statusColors,statusLabels } from '@shared/lib/labels.constant';
export function StatusBadge({status}:{status:string}){useI18n();return <Badge component="span" color={statusColors[status]??'gray'}>{t(statusLabels[status]??status)}</Badge>;}
