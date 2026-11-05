import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from '@mantine/core';
export function Markdown({children}:{children:string}){return <Typography><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{children}</ReactMarkdown></Typography>;}
