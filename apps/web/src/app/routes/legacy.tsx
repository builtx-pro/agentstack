import {createFileRoute} from '@tanstack/react-router';
import {LegacyPage} from '@pages/legacy/page';
import {legacySearchSchema} from '@pages/legacy/legacy-link.util';
export const Route=createFileRoute('/legacy')({validateSearch:legacySearchSchema,component:LegacyPage});
