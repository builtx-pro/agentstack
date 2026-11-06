import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import classes from "./markdown.module.css";
import { Typography } from "@mantine/core";
export function Markdown({ children }: { children: string }) {
  return (
    <Typography className={classes.content}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          h5: ({ children }) => <h6>{children}</h6>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </Typography>
  );
}
