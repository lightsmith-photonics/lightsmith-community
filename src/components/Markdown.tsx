import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

/**
 * Markdown with GFM, $inline$ / $$display$$ LaTeX (KaTeX) and highlighted code blocks.
 * Raw HTML is not rendered (react-markdown default), and unsafe URLs are dropped.
 */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-os ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ({ href, children, ...rest }) => {
            const external = href?.startsWith("http");
            return (
              <a href={href} {...rest} {...(external ? { rel: "nofollow ugc noopener", target: "_blank" } : {})}>
                {children}
              </a>
            );
          },
          // Scrollable code blocks must be reachable by keyboard (WCAG 2.1.1).
          pre: ({ children, node: _node, ...rest }) => (
            <pre tabIndex={0} {...rest}>
              {children}
            </pre>
          ),
          img: ({ alt, src }) => (
            // User images are shown as links to avoid tracking pixels and layout shifts.
            <a href={typeof src === "string" ? src : undefined} rel="nofollow ugc noopener" target="_blank">
              [image: {alt || "untitled"}]
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
