import { createFileRoute } from '@tanstack/react-router';
import {z} from 'zod';
import { LoginPage } from '@pages/login/page';
export const Route=createFileRoute('/login')({validateSearch:z.object({returnTo:z.string().optional()}),component:LoginPage});
