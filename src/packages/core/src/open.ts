import open from "open"

/** Opens an http(s) URL in `app` (a browser exe path) or, without it, the system default browser. */
export function openUrl(input: string, app?: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:"))
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  return open(url.href, app ? { app: { name: app } } : undefined)
}
