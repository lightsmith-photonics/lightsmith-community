import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isPrivateAddress } from "./signing";

// Outbound webhook requests. The SSRF guard runs inside the socket's own DNS lookup, so the address
// that passes the check is the address the request connects to. A hostname that resolves to a public
// address when the URL is checked and to a private one a moment later (DNS rebinding) fails here.
// Redirects are not followed and the response body is discarded.

export type Resolver = (hostname: string, options: LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

const systemResolver: Resolver = (hostname, options, callback) => dnsLookup(hostname, options, callback);

/** A `lookup` for http.request that refuses hostnames resolving to any private or reserved address. */
export function guardedLookup(resolve: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        return callback(Object.assign(new Error(`${hostname} resolves to an address that is not public`), { code: "ENOTPUBLIC" }), "");
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/**
 * POST `body` to `url` on a fresh connection and resolve with the HTTP status. Rejects on network
 * errors, on a refused lookup, and when no response arrives within `timeoutMs` (error name
 * "TimeoutError").
 */
export function postJson(url: URL, headers: Record<string, string>, body: string, opts: { timeoutMs: number; lookup?: LookupFunction }): Promise<number> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        agent: false,
        ...(opts.lookup ? { lookup: opts.lookup } : {}),
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
      },
      (res) => {
        clearTimeout(timer);
        resolve(res.statusCode ?? 0);
        res.destroy();
      },
    );
    const timer = setTimeout(() => req.destroy(Object.assign(new Error(`no response within ${opts.timeoutMs / 1000} s`), { name: "TimeoutError" })), opts.timeoutMs);
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end(body);
  });
}
