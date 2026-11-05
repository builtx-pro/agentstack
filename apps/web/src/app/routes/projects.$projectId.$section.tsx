import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@pages/workspace/page';
import { searchSchema } from '@units/catalog/model/search.schema';
export const Route=createFileRoute('/projects/$projectId/$section')({validateSearch:searchSchema,component:WorkspacePage});
