// Options for rendering user-written LaTeX. `trust` is set explicitly although false is KaTeX's default:
// katex below 0.19 reads it from the options object, so a polluted Object.prototype could otherwise turn on
// \href, \url and \includegraphics (GHSA-238p-pmpm-9mq7).
export const KATEX_OPTIONS = { throwOnError: false, strict: "ignore", trust: false } as const;
