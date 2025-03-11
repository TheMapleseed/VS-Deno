#!/usr/bin/env -S deno run --allow-net --allow-read
// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This program serves files in the current directory over HTTP.
// TODO(bartlomieju): Add tests like these:
// https://github.com/indexzero/http-server/blob/master/test/http-server-test.js
/**
 * Contains functions {@linkcode serveDir} and {@linkcode serveFile} for building a static file server.
 *
 * This module can also be used as a cli. If you want to run directly:
 *
 * ```shell
 * > # start server
 * > deno run --allow-net --allow-read https://deno.land/std@$STD_VERSION/http/file_server.ts
 * > # show help
 * > deno run --allow-net --allow-read https://deno.land/std@$STD_VERSION/http/file_server.ts --help
 * ```
 *
 * If you want to install and run:
 *
 * ```shell
 * > # install
 * > deno install --allow-net --allow-read https://deno.land/std@$STD_VERSION/http/file_server.ts
 * > # start server
 * > file_server
 * > # show help
 * > file_server --help
 * ```
 *
 * @module
 */ import { join as posixJoin } from "../path/posix/join.ts";
import { normalize as posixNormalize } from "../path/posix/normalize.ts";
import { extname } from "../path/extname.ts";
import { join } from "../path/join.ts";
import { relative } from "../path/relative.ts";
import { resolve } from "../path/resolve.ts";
import { SEP_PATTERN } from "../path/separator.ts";
import { contentType } from "../media_types/content_type.ts";
import { calculate, ifNoneMatch } from "./etag.ts";
import { isRedirectStatus, Status } from "./http_status.ts";
import { ByteSliceStream } from "../streams/byte_slice_stream.ts";
import { parse } from "../flags/mod.ts";
import { red } from "../fmt/colors.ts";
import { createCommonResponse } from "./util.ts";
import { VERSION } from "../version.ts";
import { format as formatBytes } from "../fmt/bytes.ts";
const ENV_PERM_STATUS = Deno.permissions.querySync?.({
  name: "env",
  variable: "DENO_DEPLOYMENT_ID"
}).state ?? "granted"; // for deno deploy
const DENO_DEPLOYMENT_ID = ENV_PERM_STATUS === "granted" ? Deno.env.get("DENO_DEPLOYMENT_ID") : undefined;
const HASHED_DENO_DEPLOYMENT_ID = DENO_DEPLOYMENT_ID ? calculate(DENO_DEPLOYMENT_ID, {
  weak: true
}) : undefined;
function modeToString(isDir, maybeMode) {
  const modeMap = [
    "---",
    "--x",
    "-w-",
    "-wx",
    "r--",
    "r-x",
    "rw-",
    "rwx"
  ];
  if (maybeMode === null) {
    return "(unknown mode)";
  }
  const mode = maybeMode.toString(8);
  if (mode.length < 3) {
    return "(unknown mode)";
  }
  let output = "";
  mode.split("").reverse().slice(0, 3).forEach((v)=>{
    output = `${modeMap[+v]} ${output}`;
  });
  output = `${isDir ? "d" : "-"} ${output}`;
  return output;
}
/**
 * parse range header.
 *
 * ```ts ignore
 * parseRangeHeader("bytes=0-100",   500); // => { start: 0, end: 100 }
 * parseRangeHeader("bytes=0-",      500); // => { start: 0, end: 499 }
 * parseRangeHeader("bytes=-100",    500); // => { start: 400, end: 499 }
 * parseRangeHeader("bytes=invalid", 500); // => null
 * ```
 *
 * Note: Currently, no support for multiple Ranges (e.g. `bytes=0-10, 20-30`)
 */ function parseRangeHeader(rangeValue, fileSize) {
  const rangeRegex = /bytes=(?<start>\d+)?-(?<end>\d+)?$/u;
  const parsed = rangeValue.match(rangeRegex);
  if (!parsed || !parsed.groups) {
    // failed to parse range header
    return null;
  }
  const { start, end } = parsed.groups;
  if (start !== undefined) {
    if (end !== undefined) {
      return {
        start: +start,
        end: +end
      };
    } else {
      return {
        start: +start,
        end: fileSize - 1
      };
    }
  } else {
    if (end !== undefined) {
      // example: `bytes=-100` means the last 100 bytes.
      return {
        start: fileSize - +end,
        end: fileSize - 1
      };
    } else {
      // failed to parse range header
      return null;
    }
  }
}
/**
 * Returns an HTTP Response with the requested file as the body.
 * @param req The server request context used to cleanup the file handle.
 * @param filePath Path of the file to serve.
 */ export async function serveFile(req, filePath, { etagAlgorithm: algorithm, fileInfo } = {}) {
  try {
    fileInfo ??= await Deno.stat(filePath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      await req.body?.cancel();
      return createCommonResponse(Status.NotFound);
    } else {
      throw error;
    }
  }
  if (fileInfo.isDirectory) {
    await req.body?.cancel();
    return createCommonResponse(Status.NotFound);
  }
  const headers = createBaseHeaders();
  // Set date header if access timestamp is available
  if (fileInfo.atime) {
    headers.set("date", fileInfo.atime.toUTCString());
  }
  const etag = fileInfo.mtime ? await calculate(fileInfo, {
    algorithm
  }) : await HASHED_DENO_DEPLOYMENT_ID;
  // Set last modified header if last modification timestamp is available
  if (fileInfo.mtime) {
    headers.set("last-modified", fileInfo.mtime.toUTCString());
  }
  if (etag) {
    headers.set("etag", etag);
  }
  if (etag || fileInfo.mtime) {
    // If a `if-none-match` header is present and the value matches the tag or
    // if a `if-modified-since` header is present and the value is bigger than
    // the access timestamp value, then return 304
    const ifNoneMatchValue = req.headers.get("if-none-match");
    const ifModifiedSinceValue = req.headers.get("if-modified-since");
    if (!ifNoneMatch(ifNoneMatchValue, etag) || ifNoneMatchValue === null && fileInfo.mtime && ifModifiedSinceValue && fileInfo.mtime.getTime() < new Date(ifModifiedSinceValue).getTime() + 1000) {
      return createCommonResponse(Status.NotModified, null, {
        headers
      });
    }
  }
  // Set mime-type using the file extension in filePath
  const contentTypeValue = contentType(extname(filePath));
  if (contentTypeValue) {
    headers.set("content-type", contentTypeValue);
  }
  const fileSize = fileInfo.size;
  const rangeValue = req.headers.get("range");
  // handle range request
  // Note: Some clients add a Range header to all requests to limit the size of the response.
  // If the file is empty, ignore the range header and respond with a 200 rather than a 416.
  // https://github.com/golang/go/blob/0d347544cbca0f42b160424f6bc2458ebcc7b3fc/src/net/http/fs.go#L273-L276
  if (rangeValue && 0 < fileSize) {
    const parsed = parseRangeHeader(rangeValue, fileSize);
    // Returns 200 OK if parsing the range header fails
    if (!parsed) {
      // Set content length
      headers.set("content-length", `${fileSize}`);
      const file = await Deno.open(filePath);
      return createCommonResponse(Status.OK, file.readable, {
        headers
      });
    }
    // Return 416 Range Not Satisfiable if invalid range header value
    if (parsed.end < 0 || parsed.end < parsed.start || fileSize <= parsed.start) {
      // Set the "Content-range" header
      headers.set("content-range", `bytes */${fileSize}`);
      return createCommonResponse(Status.RequestedRangeNotSatisfiable, undefined, {
        headers
      });
    }
    // clamps the range header value
    const start = Math.max(0, parsed.start);
    const end = Math.min(parsed.end, fileSize - 1);
    // Set the "Content-range" header
    headers.set("content-range", `bytes ${start}-${end}/${fileSize}`);
    // Set content length
    const contentLength = end - start + 1;
    headers.set("content-length", `${contentLength}`);
    // Return 206 Partial Content
    const file = await Deno.open(filePath);
    await file.seek(start, Deno.SeekMode.Start);
    const sliced = file.readable.pipeThrough(new ByteSliceStream(0, contentLength - 1));
    return createCommonResponse(Status.PartialContent, sliced, {
      headers
    });
  }
  // Set content length
  headers.set("content-length", `${fileSize}`);
  const file = await Deno.open(filePath);
  return createCommonResponse(Status.OK, file.readable, {
    headers
  });
}
async function serveDirIndex(dirPath, options) {
  const { showDotfiles } = options;
  const dirUrl = `/${relative(options.target, dirPath).replaceAll(new RegExp(SEP_PATTERN, "g"), "/")}`;
  const listEntryPromise = [];
  // if ".." makes sense
  if (dirUrl !== "/") {
    const prevPath = join(dirPath, "..");
    const entryInfo = Deno.stat(prevPath).then((fileInfo)=>({
        mode: modeToString(true, fileInfo.mode),
        size: "",
        name: "../",
        url: posixJoin(dirUrl, "..")
      }));
    listEntryPromise.push(entryInfo);
  }
  // Read fileInfo in parallel
  for await (const entry of Deno.readDir(dirPath)){
    if (!showDotfiles && entry.name[0] === ".") {
      continue;
    }
    const filePath = join(dirPath, entry.name);
    const fileUrl = encodeURIComponent(posixJoin(dirUrl, entry.name)).replaceAll("%2F", "/");
    listEntryPromise.push((async ()=>{
      try {
        const fileInfo = await Deno.stat(filePath);
        return {
          mode: modeToString(entry.isDirectory, fileInfo.mode),
          size: entry.isFile ? formatBytes(fileInfo.size ?? 0) : "",
          name: `${entry.name}${entry.isDirectory ? "/" : ""}`,
          url: `${fileUrl}${entry.isDirectory ? "/" : ""}`
        };
      } catch (error) {
        // Note: Deno.stat for windows system files may be rejected with os error 32.
        if (!options.quiet) logError(error);
        return {
          mode: "(unknown mode)",
          size: "",
          name: `${entry.name}${entry.isDirectory ? "/" : ""}`,
          url: `${fileUrl}${entry.isDirectory ? "/" : ""}`
        };
      }
    })());
  }
  const listEntry = await Promise.all(listEntryPromise);
  listEntry.sort((a, b)=>a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
  const formattedDirUrl = `${dirUrl.replace(/\/$/, "")}/`;
  const page = dirViewerTemplate(formattedDirUrl, listEntry);
  const headers = createBaseHeaders();
  headers.set("content-type", "text/html; charset=UTF-8");
  return createCommonResponse(Status.OK, page, {
    headers
  });
}
function serveFallback(maybeError) {
  if (maybeError instanceof URIError) {
    return createCommonResponse(Status.BadRequest);
  }
  if (maybeError instanceof Deno.errors.NotFound) {
    return createCommonResponse(Status.NotFound);
  }
  return createCommonResponse(Status.InternalServerError);
}
function serverLog(req, status) {
  const d = new Date().toISOString();
  const dateFmt = `[${d.slice(0, 10)} ${d.slice(11, 19)}]`;
  const url = new URL(req.url);
  const s = `${dateFmt} [${req.method}] ${url.pathname}${url.search} ${status}`;
  // using console.debug instead of console.log so chrome inspect users can hide request logs
  console.debug(s);
}
function createBaseHeaders() {
  return new Headers({
    server: "deno",
    // Set "accept-ranges" so that the client knows it can make range requests on future requests
    "accept-ranges": "bytes"
  });
}
function dirViewerTemplate(dirname, entries) {
  const paths = dirname.split("/");
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="ie=edge" />
        <title>Deno File Server</title>
        <style>
          :root {
            --background-color: #fafafa;
            --color: rgba(0, 0, 0, 0.87);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --background-color: #292929;
              --color: #fff;
            }
            thead {
              color: #7f7f7f;
            }
          }
          @media (min-width: 960px) {
            main {
              max-width: 960px;
            }
            body {
              padding-left: 32px;
              padding-right: 32px;
            }
          }
          @media (min-width: 600px) {
            main {
              padding-left: 24px;
              padding-right: 24px;
            }
          }
          body {
            background: var(--background-color);
            color: var(--color);
            font-family: "Roboto", "Helvetica", "Arial", sans-serif;
            font-weight: 400;
            line-height: 1.43;
            font-size: 0.875rem;
          }
          a {
            color: #2196f3;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          thead {
            text-align: left;
          }
          thead th {
            padding-bottom: 12px;
          }
          table td {
            padding: 6px 36px 6px 0px;
          }
          .size {
            text-align: right;
            padding: 6px 12px 6px 24px;
          }
          .mode {
            font-family: monospace, monospace;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Index of
          <a href="/">home</a>${paths.map((path, index, array)=>{
    if (path === "") return "";
    const link = array.slice(0, index + 1).join("/");
    return `<a href="${link}">${path}</a>`;
  }).join("/")}
          </h1>
          <table>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Size</th>
                <th>Name</th>
              </tr>
            </thead>
            ${entries.map((entry)=>`
                  <tr>
                    <td class="mode">
                      ${entry.mode}
                    </td>
                    <td class="size">
                      ${entry.size}
                    </td>
                    <td>
                      <a href="${entry.url}">${entry.name}</a>
                    </td>
                  </tr>
                `).join("")}
          </table>
        </main>
      </body>
    </html>
  `;
}
/**
 * Serves the files under the given directory root (opts.fsRoot).
 *
 * ```ts
 * import { serveDir } from "https://deno.land/std@$STD_VERSION/http/file_server.ts";
 *
 * Deno.serve((req) => {
 *   const pathname = new URL(req.url).pathname;
 *   if (pathname.startsWith("/static")) {
 *     return serveDir(req, {
 *       fsRoot: "path/to/static/files/dir",
 *     });
 *   }
 *   // Do dynamic responses
 *   return new Response();
 * });
 * ```
 *
 * Optionally you can pass `urlRoot` option. If it's specified that part is stripped from the beginning of the requested pathname.
 *
 * ```ts
 * import { serveDir } from "https://deno.land/std@$STD_VERSION/http/file_server.ts";
 *
 * // ...
 * serveDir(new Request("http://localhost/static/path/to/file"), {
 *   fsRoot: "public",
 *   urlRoot: "static",
 * });
 * ```
 *
 * The above example serves `./public/path/to/file` for the request to `/static/path/to/file`.
 *
 * @param req The request to handle
 */ export async function serveDir(req, opts = {}) {
  let response;
  try {
    response = await createServeDirResponse(req, opts);
  } catch (error) {
    if (!opts.quiet) logError(error);
    response = serveFallback(error);
  }
  // Do not update the header if the response is a 301 redirect.
  const isRedirectResponse = isRedirectStatus(response.status);
  if (opts.enableCors && !isRedirectResponse) {
    response.headers.append("access-control-allow-origin", "*");
    response.headers.append("access-control-allow-headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
  }
  if (!opts.quiet) serverLog(req, response.status);
  if (opts.headers && !isRedirectResponse) {
    for (const header of opts.headers){
      const headerSplit = header.split(":");
      const name = headerSplit[0];
      const value = headerSplit.slice(1).join(":");
      response.headers.append(name, value);
    }
  }
  return response;
}
async function createServeDirResponse(req, opts) {
  const target = opts.fsRoot || ".";
  const urlRoot = opts.urlRoot;
  const showIndex = opts.showIndex ?? true;
  const showDotfiles = opts.showDotfiles || false;
  const { etagAlgorithm, showDirListing, quiet } = opts;
  const url = new URL(req.url);
  const decodedUrl = decodeURIComponent(url.pathname);
  let normalizedPath = posixNormalize(decodedUrl);
  if (urlRoot && !normalizedPath.startsWith("/" + urlRoot)) {
    return createCommonResponse(Status.NotFound);
  }
  // Redirect paths like `/foo////bar` and `/foo/bar/////` to normalized paths.
  if (normalizedPath !== decodedUrl) {
    url.pathname = normalizedPath;
    return Response.redirect(url, 301);
  }
  if (urlRoot) {
    normalizedPath = normalizedPath.replace(urlRoot, "");
  }
  // Remove trailing slashes to avoid ENOENT errors
  // when accessing a path to a file with a trailing slash.
  if (normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  const fsPath = join(target, normalizedPath);
  const fileInfo = await Deno.stat(fsPath);
  // For files, remove the trailing slash from the path.
  if (fileInfo.isFile && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return Response.redirect(url, 301);
  }
  // For directories, the path must have a trailing slash.
  if (fileInfo.isDirectory && !url.pathname.endsWith("/")) {
    // On directory listing pages,
    // if the current URL's pathname doesn't end with a slash, any
    // relative URLs in the index file will resolve against the parent
    // directory, rather than the current directory. To prevent that, we
    // return a 301 redirect to the URL with a slash.
    url.pathname += "/";
    return Response.redirect(url, 301);
  }
  // if target is file, serve file.
  if (!fileInfo.isDirectory) {
    return serveFile(req, fsPath, {
      etagAlgorithm,
      fileInfo
    });
  }
  // if target is directory, serve index or dir listing.
  if (showIndex) {
    const indexPath = join(fsPath, "index.html");
    let indexFileInfo;
    try {
      indexFileInfo = await Deno.lstat(indexPath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    // skip Not Found error
    }
    if (indexFileInfo?.isFile) {
      return serveFile(req, indexPath, {
        etagAlgorithm,
        fileInfo: indexFileInfo
      });
    }
  }
  if (showDirListing) {
    return serveDirIndex(fsPath, {
      showDotfiles,
      target,
      quiet
    });
  }
  return createCommonResponse(Status.NotFound);
}
function logError(error) {
  console.error(red(error instanceof Error ? error.message : `${error}`));
}
function main() {
  const serverArgs = parse(Deno.args, {
    string: [
      "port",
      "host",
      "cert",
      "key",
      "header"
    ],
    boolean: [
      "help",
      "dir-listing",
      "dotfiles",
      "cors",
      "verbose",
      "version"
    ],
    negatable: [
      "dir-listing",
      "dotfiles",
      "cors"
    ],
    collect: [
      "header"
    ],
    default: {
      "dir-listing": true,
      dotfiles: true,
      cors: true,
      verbose: false,
      version: false,
      host: "0.0.0.0",
      port: "4507",
      cert: "",
      key: ""
    },
    alias: {
      p: "port",
      c: "cert",
      k: "key",
      h: "help",
      v: "verbose",
      V: "version",
      H: "header"
    }
  });
  const port = Number(serverArgs.port);
  const headers = serverArgs.header || [];
  const host = serverArgs.host;
  const certFile = serverArgs.cert;
  const keyFile = serverArgs.key;
  if (serverArgs.help) {
    printUsage();
    Deno.exit();
  }
  if (serverArgs.version) {
    console.log(`Deno File Server ${VERSION}`);
    Deno.exit();
  }
  if (keyFile || certFile) {
    if (keyFile === "" || certFile === "") {
      console.log("--key and --cert are required for TLS");
      printUsage();
      Deno.exit(1);
    }
  }
  const wild = serverArgs._;
  const target = resolve(wild[0] ?? "");
  const handler = (req)=>{
    return serveDir(req, {
      fsRoot: target,
      showDirListing: serverArgs["dir-listing"],
      showDotfiles: serverArgs.dotfiles,
      enableCors: serverArgs.cors,
      quiet: !serverArgs.verbose,
      headers
    });
  };
  const useTls = !!(keyFile && certFile);
  if (useTls) {
    Deno.serve({
      port,
      hostname: host,
      cert: Deno.readTextFileSync(certFile),
      key: Deno.readTextFileSync(keyFile)
    }, handler);
  } else {
    Deno.serve({
      port,
      hostname: host
    }, handler);
  }
}
function printUsage() {
  console.log(`Deno File Server ${VERSION}
  Serves a local directory in HTTP.

INSTALL:
  deno install --allow-net --allow-read https://deno.land/std/http/file_server.ts

USAGE:
  file_server [path] [options]

OPTIONS:
  -h, --help            Prints help information
  -p, --port <PORT>     Set port
  --cors                Enable CORS via the "Access-Control-Allow-Origin" header
  --host     <HOST>     Hostname (default is 0.0.0.0)
  -c, --cert <FILE>     TLS certificate file (enables TLS)
  -k, --key  <FILE>     TLS key file (enables TLS)
  -H, --header <HEADER> Sets a header on every request.
                        (e.g. --header "Cache-Control: no-cache")
                        This option can be specified multiple times.
  --no-dir-listing      Disable directory listing
  --no-dotfiles         Do not show dotfiles
  --no-cors             Disable cross-origin resource sharing
  -v, --verbose         Print request level logs
  -V, --version         Print version information

  All TLS options are required when one is provided.`);
}
if (import.meta.main) {
  main();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL2h0dHAvZmlsZV9zZXJ2ZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgLVMgZGVubyBydW4gLS1hbGxvdy1uZXQgLS1hbGxvdy1yZWFkXG4vLyBDb3B5cmlnaHQgMjAxOC0yMDIzIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBUaGlzIHByb2dyYW0gc2VydmVzIGZpbGVzIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeSBvdmVyIEhUVFAuXG4vLyBUT0RPKGJhcnRsb21pZWp1KTogQWRkIHRlc3RzIGxpa2UgdGhlc2U6XG4vLyBodHRwczovL2dpdGh1Yi5jb20vaW5kZXh6ZXJvL2h0dHAtc2VydmVyL2Jsb2IvbWFzdGVyL3Rlc3QvaHR0cC1zZXJ2ZXItdGVzdC5qc1xuXG4vKipcbiAqIENvbnRhaW5zIGZ1bmN0aW9ucyB7QGxpbmtjb2RlIHNlcnZlRGlyfSBhbmQge0BsaW5rY29kZSBzZXJ2ZUZpbGV9IGZvciBidWlsZGluZyBhIHN0YXRpYyBmaWxlIHNlcnZlci5cbiAqXG4gKiBUaGlzIG1vZHVsZSBjYW4gYWxzbyBiZSB1c2VkIGFzIGEgY2xpLiBJZiB5b3Ugd2FudCB0byBydW4gZGlyZWN0bHk6XG4gKlxuICogYGBgc2hlbGxcbiAqID4gIyBzdGFydCBzZXJ2ZXJcbiAqID4gZGVubyBydW4gLS1hbGxvdy1uZXQgLS1hbGxvdy1yZWFkIGh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9maWxlX3NlcnZlci50c1xuICogPiAjIHNob3cgaGVscFxuICogPiBkZW5vIHJ1biAtLWFsbG93LW5ldCAtLWFsbG93LXJlYWQgaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2ZpbGVfc2VydmVyLnRzIC0taGVscFxuICogYGBgXG4gKlxuICogSWYgeW91IHdhbnQgdG8gaW5zdGFsbCBhbmQgcnVuOlxuICpcbiAqIGBgYHNoZWxsXG4gKiA+ICMgaW5zdGFsbFxuICogPiBkZW5vIGluc3RhbGwgLS1hbGxvdy1uZXQgLS1hbGxvdy1yZWFkIGh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9maWxlX3NlcnZlci50c1xuICogPiAjIHN0YXJ0IHNlcnZlclxuICogPiBmaWxlX3NlcnZlclxuICogPiAjIHNob3cgaGVscFxuICogPiBmaWxlX3NlcnZlciAtLWhlbHBcbiAqIGBgYFxuICpcbiAqIEBtb2R1bGVcbiAqL1xuXG5pbXBvcnQgeyBqb2luIGFzIHBvc2l4Sm9pbiB9IGZyb20gXCIuLi9wYXRoL3Bvc2l4L2pvaW4udHNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZSBhcyBwb3NpeE5vcm1hbGl6ZSB9IGZyb20gXCIuLi9wYXRoL3Bvc2l4L25vcm1hbGl6ZS50c1wiO1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gXCIuLi9wYXRoL2V4dG5hbWUudHNcIjtcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwiLi4vcGF0aC9qb2luLnRzXCI7XG5pbXBvcnQgeyByZWxhdGl2ZSB9IGZyb20gXCIuLi9wYXRoL3JlbGF0aXZlLnRzXCI7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSBcIi4uL3BhdGgvcmVzb2x2ZS50c1wiO1xuaW1wb3J0IHsgU0VQX1BBVFRFUk4gfSBmcm9tIFwiLi4vcGF0aC9zZXBhcmF0b3IudHNcIjtcbmltcG9ydCB7IGNvbnRlbnRUeXBlIH0gZnJvbSBcIi4uL21lZGlhX3R5cGVzL2NvbnRlbnRfdHlwZS50c1wiO1xuaW1wb3J0IHsgY2FsY3VsYXRlLCBpZk5vbmVNYXRjaCB9IGZyb20gXCIuL2V0YWcudHNcIjtcbmltcG9ydCB7IGlzUmVkaXJlY3RTdGF0dXMsIFN0YXR1cyB9IGZyb20gXCIuL2h0dHBfc3RhdHVzLnRzXCI7XG5pbXBvcnQgeyBCeXRlU2xpY2VTdHJlYW0gfSBmcm9tIFwiLi4vc3RyZWFtcy9ieXRlX3NsaWNlX3N0cmVhbS50c1wiO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tIFwiLi4vZmxhZ3MvbW9kLnRzXCI7XG5pbXBvcnQgeyByZWQgfSBmcm9tIFwiLi4vZm10L2NvbG9ycy50c1wiO1xuaW1wb3J0IHsgY3JlYXRlQ29tbW9uUmVzcG9uc2UgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5pbXBvcnQgeyBWRVJTSU9OIH0gZnJvbSBcIi4uL3ZlcnNpb24udHNcIjtcbmltcG9ydCB7IGZvcm1hdCBhcyBmb3JtYXRCeXRlcyB9IGZyb20gXCIuLi9mbXQvYnl0ZXMudHNcIjtcblxuaW50ZXJmYWNlIEVudHJ5SW5mbyB7XG4gIG1vZGU6IHN0cmluZztcbiAgc2l6ZTogc3RyaW5nO1xuICB1cmw6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xufVxuXG5jb25zdCBFTlZfUEVSTV9TVEFUVVMgPVxuICBEZW5vLnBlcm1pc3Npb25zLnF1ZXJ5U3luYz8uKHsgbmFtZTogXCJlbnZcIiwgdmFyaWFibGU6IFwiREVOT19ERVBMT1lNRU5UX0lEXCIgfSlcbiAgICAuc3RhdGUgPz8gXCJncmFudGVkXCI7IC8vIGZvciBkZW5vIGRlcGxveVxuY29uc3QgREVOT19ERVBMT1lNRU5UX0lEID0gRU5WX1BFUk1fU1RBVFVTID09PSBcImdyYW50ZWRcIlxuICA/IERlbm8uZW52LmdldChcIkRFTk9fREVQTE9ZTUVOVF9JRFwiKVxuICA6IHVuZGVmaW5lZDtcbmNvbnN0IEhBU0hFRF9ERU5PX0RFUExPWU1FTlRfSUQgPSBERU5PX0RFUExPWU1FTlRfSURcbiAgPyBjYWxjdWxhdGUoREVOT19ERVBMT1lNRU5UX0lELCB7IHdlYWs6IHRydWUgfSlcbiAgOiB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uIG1vZGVUb1N0cmluZyhpc0RpcjogYm9vbGVhbiwgbWF5YmVNb2RlOiBudW1iZXIgfCBudWxsKTogc3RyaW5nIHtcbiAgY29uc3QgbW9kZU1hcCA9IFtcIi0tLVwiLCBcIi0teFwiLCBcIi13LVwiLCBcIi13eFwiLCBcInItLVwiLCBcInIteFwiLCBcInJ3LVwiLCBcInJ3eFwiXTtcblxuICBpZiAobWF5YmVNb2RlID09PSBudWxsKSB7XG4gICAgcmV0dXJuIFwiKHVua25vd24gbW9kZSlcIjtcbiAgfVxuICBjb25zdCBtb2RlID0gbWF5YmVNb2RlLnRvU3RyaW5nKDgpO1xuICBpZiAobW9kZS5sZW5ndGggPCAzKSB7XG4gICAgcmV0dXJuIFwiKHVua25vd24gbW9kZSlcIjtcbiAgfVxuICBsZXQgb3V0cHV0ID0gXCJcIjtcbiAgbW9kZVxuICAgIC5zcGxpdChcIlwiKVxuICAgIC5yZXZlcnNlKClcbiAgICAuc2xpY2UoMCwgMylcbiAgICAuZm9yRWFjaCgodikgPT4ge1xuICAgICAgb3V0cHV0ID0gYCR7bW9kZU1hcFsrdl19ICR7b3V0cHV0fWA7XG4gICAgfSk7XG4gIG91dHB1dCA9IGAke2lzRGlyID8gXCJkXCIgOiBcIi1cIn0gJHtvdXRwdXR9YDtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuLyoqXG4gKiBwYXJzZSByYW5nZSBoZWFkZXIuXG4gKlxuICogYGBgdHMgaWdub3JlXG4gKiBwYXJzZVJhbmdlSGVhZGVyKFwiYnl0ZXM9MC0xMDBcIiwgICA1MDApOyAvLyA9PiB7IHN0YXJ0OiAwLCBlbmQ6IDEwMCB9XG4gKiBwYXJzZVJhbmdlSGVhZGVyKFwiYnl0ZXM9MC1cIiwgICAgICA1MDApOyAvLyA9PiB7IHN0YXJ0OiAwLCBlbmQ6IDQ5OSB9XG4gKiBwYXJzZVJhbmdlSGVhZGVyKFwiYnl0ZXM9LTEwMFwiLCAgICA1MDApOyAvLyA9PiB7IHN0YXJ0OiA0MDAsIGVuZDogNDk5IH1cbiAqIHBhcnNlUmFuZ2VIZWFkZXIoXCJieXRlcz1pbnZhbGlkXCIsIDUwMCk7IC8vID0+IG51bGxcbiAqIGBgYFxuICpcbiAqIE5vdGU6IEN1cnJlbnRseSwgbm8gc3VwcG9ydCBmb3IgbXVsdGlwbGUgUmFuZ2VzIChlLmcuIGBieXRlcz0wLTEwLCAyMC0zMGApXG4gKi9cbmZ1bmN0aW9uIHBhcnNlUmFuZ2VIZWFkZXIocmFuZ2VWYWx1ZTogc3RyaW5nLCBmaWxlU2l6ZTogbnVtYmVyKSB7XG4gIGNvbnN0IHJhbmdlUmVnZXggPSAvYnl0ZXM9KD88c3RhcnQ+XFxkKyk/LSg/PGVuZD5cXGQrKT8kL3U7XG4gIGNvbnN0IHBhcnNlZCA9IHJhbmdlVmFsdWUubWF0Y2gocmFuZ2VSZWdleCk7XG5cbiAgaWYgKCFwYXJzZWQgfHwgIXBhcnNlZC5ncm91cHMpIHtcbiAgICAvLyBmYWlsZWQgdG8gcGFyc2UgcmFuZ2UgaGVhZGVyXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCB7IHN0YXJ0LCBlbmQgfSA9IHBhcnNlZC5ncm91cHM7XG4gIGlmIChzdGFydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKGVuZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4geyBzdGFydDogK3N0YXJ0LCBlbmQ6ICtlbmQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHsgc3RhcnQ6ICtzdGFydCwgZW5kOiBmaWxlU2l6ZSAtIDEgfTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGVuZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAvLyBleGFtcGxlOiBgYnl0ZXM9LTEwMGAgbWVhbnMgdGhlIGxhc3QgMTAwIGJ5dGVzLlxuICAgICAgcmV0dXJuIHsgc3RhcnQ6IGZpbGVTaXplIC0gK2VuZCwgZW5kOiBmaWxlU2l6ZSAtIDEgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gZmFpbGVkIHRvIHBhcnNlIHJhbmdlIGhlYWRlclxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG59XG5cbi8qKiBJbnRlcmZhY2UgZm9yIHNlcnZlRmlsZSBvcHRpb25zLiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZUZpbGVPcHRpb25zIHtcbiAgLyoqIFRoZSBhbGdvcml0aG0gdG8gdXNlIGZvciBnZW5lcmF0aW5nIHRoZSBFVGFnLlxuICAgKlxuICAgKiBAZGVmYXVsdCB7XCJTSEEtMjU2XCJ9XG4gICAqL1xuICBldGFnQWxnb3JpdGhtPzogQWxnb3JpdGhtSWRlbnRpZmllcjtcbiAgLyoqIEFuIG9wdGlvbmFsIEZpbGVJbmZvIG9iamVjdCByZXR1cm5lZCBieSBEZW5vLnN0YXQuIEl0IGlzIHVzZWQgZm9yIG9wdGltaXphdGlvbiBwdXJwb3Nlcy4gKi9cbiAgZmlsZUluZm8/OiBEZW5vLkZpbGVJbmZvO1xufVxuXG4vKipcbiAqIFJldHVybnMgYW4gSFRUUCBSZXNwb25zZSB3aXRoIHRoZSByZXF1ZXN0ZWQgZmlsZSBhcyB0aGUgYm9keS5cbiAqIEBwYXJhbSByZXEgVGhlIHNlcnZlciByZXF1ZXN0IGNvbnRleHQgdXNlZCB0byBjbGVhbnVwIHRoZSBmaWxlIGhhbmRsZS5cbiAqIEBwYXJhbSBmaWxlUGF0aCBQYXRoIG9mIHRoZSBmaWxlIHRvIHNlcnZlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmVGaWxlKFxuICByZXE6IFJlcXVlc3QsXG4gIGZpbGVQYXRoOiBzdHJpbmcsXG4gIHsgZXRhZ0FsZ29yaXRobTogYWxnb3JpdGhtLCBmaWxlSW5mbyB9OiBTZXJ2ZUZpbGVPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gIHRyeSB7XG4gICAgZmlsZUluZm8gPz89IGF3YWl0IERlbm8uc3RhdChmaWxlUGF0aCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpIHtcbiAgICAgIGF3YWl0IHJlcS5ib2R5Py5jYW5jZWwoKTtcbiAgICAgIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuTm90Rm91bmQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBpZiAoZmlsZUluZm8uaXNEaXJlY3RvcnkpIHtcbiAgICBhd2FpdCByZXEuYm9keT8uY2FuY2VsKCk7XG4gICAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFN0YXR1cy5Ob3RGb3VuZCk7XG4gIH1cblxuICBjb25zdCBoZWFkZXJzID0gY3JlYXRlQmFzZUhlYWRlcnMoKTtcblxuICAvLyBTZXQgZGF0ZSBoZWFkZXIgaWYgYWNjZXNzIHRpbWVzdGFtcCBpcyBhdmFpbGFibGVcbiAgaWYgKGZpbGVJbmZvLmF0aW1lKSB7XG4gICAgaGVhZGVycy5zZXQoXCJkYXRlXCIsIGZpbGVJbmZvLmF0aW1lLnRvVVRDU3RyaW5nKCkpO1xuICB9XG5cbiAgY29uc3QgZXRhZyA9IGZpbGVJbmZvLm10aW1lXG4gICAgPyBhd2FpdCBjYWxjdWxhdGUoZmlsZUluZm8sIHsgYWxnb3JpdGhtIH0pXG4gICAgOiBhd2FpdCBIQVNIRURfREVOT19ERVBMT1lNRU5UX0lEO1xuXG4gIC8vIFNldCBsYXN0IG1vZGlmaWVkIGhlYWRlciBpZiBsYXN0IG1vZGlmaWNhdGlvbiB0aW1lc3RhbXAgaXMgYXZhaWxhYmxlXG4gIGlmIChmaWxlSW5mby5tdGltZSkge1xuICAgIGhlYWRlcnMuc2V0KFwibGFzdC1tb2RpZmllZFwiLCBmaWxlSW5mby5tdGltZS50b1VUQ1N0cmluZygpKTtcbiAgfVxuICBpZiAoZXRhZykge1xuICAgIGhlYWRlcnMuc2V0KFwiZXRhZ1wiLCBldGFnKTtcbiAgfVxuXG4gIGlmIChldGFnIHx8IGZpbGVJbmZvLm10aW1lKSB7XG4gICAgLy8gSWYgYSBgaWYtbm9uZS1tYXRjaGAgaGVhZGVyIGlzIHByZXNlbnQgYW5kIHRoZSB2YWx1ZSBtYXRjaGVzIHRoZSB0YWcgb3JcbiAgICAvLyBpZiBhIGBpZi1tb2RpZmllZC1zaW5jZWAgaGVhZGVyIGlzIHByZXNlbnQgYW5kIHRoZSB2YWx1ZSBpcyBiaWdnZXIgdGhhblxuICAgIC8vIHRoZSBhY2Nlc3MgdGltZXN0YW1wIHZhbHVlLCB0aGVuIHJldHVybiAzMDRcbiAgICBjb25zdCBpZk5vbmVNYXRjaFZhbHVlID0gcmVxLmhlYWRlcnMuZ2V0KFwiaWYtbm9uZS1tYXRjaFwiKTtcbiAgICBjb25zdCBpZk1vZGlmaWVkU2luY2VWYWx1ZSA9IHJlcS5oZWFkZXJzLmdldChcImlmLW1vZGlmaWVkLXNpbmNlXCIpO1xuICAgIGlmIChcbiAgICAgICghaWZOb25lTWF0Y2goaWZOb25lTWF0Y2hWYWx1ZSwgZXRhZykpIHx8XG4gICAgICAoaWZOb25lTWF0Y2hWYWx1ZSA9PT0gbnVsbCAmJlxuICAgICAgICBmaWxlSW5mby5tdGltZSAmJlxuICAgICAgICBpZk1vZGlmaWVkU2luY2VWYWx1ZSAmJlxuICAgICAgICBmaWxlSW5mby5tdGltZS5nZXRUaW1lKCkgPFxuICAgICAgICAgIG5ldyBEYXRlKGlmTW9kaWZpZWRTaW5jZVZhbHVlKS5nZXRUaW1lKCkgKyAxMDAwKVxuICAgICkge1xuICAgICAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFN0YXR1cy5Ob3RNb2RpZmllZCwgbnVsbCwgeyBoZWFkZXJzIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIFNldCBtaW1lLXR5cGUgdXNpbmcgdGhlIGZpbGUgZXh0ZW5zaW9uIGluIGZpbGVQYXRoXG4gIGNvbnN0IGNvbnRlbnRUeXBlVmFsdWUgPSBjb250ZW50VHlwZShleHRuYW1lKGZpbGVQYXRoKSk7XG4gIGlmIChjb250ZW50VHlwZVZhbHVlKSB7XG4gICAgaGVhZGVycy5zZXQoXCJjb250ZW50LXR5cGVcIiwgY29udGVudFR5cGVWYWx1ZSk7XG4gIH1cblxuICBjb25zdCBmaWxlU2l6ZSA9IGZpbGVJbmZvLnNpemU7XG5cbiAgY29uc3QgcmFuZ2VWYWx1ZSA9IHJlcS5oZWFkZXJzLmdldChcInJhbmdlXCIpO1xuXG4gIC8vIGhhbmRsZSByYW5nZSByZXF1ZXN0XG4gIC8vIE5vdGU6IFNvbWUgY2xpZW50cyBhZGQgYSBSYW5nZSBoZWFkZXIgdG8gYWxsIHJlcXVlc3RzIHRvIGxpbWl0IHRoZSBzaXplIG9mIHRoZSByZXNwb25zZS5cbiAgLy8gSWYgdGhlIGZpbGUgaXMgZW1wdHksIGlnbm9yZSB0aGUgcmFuZ2UgaGVhZGVyIGFuZCByZXNwb25kIHdpdGggYSAyMDAgcmF0aGVyIHRoYW4gYSA0MTYuXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9nb2xhbmcvZ28vYmxvYi8wZDM0NzU0NGNiY2EwZjQyYjE2MDQyNGY2YmMyNDU4ZWJjYzdiM2ZjL3NyYy9uZXQvaHR0cC9mcy5nbyNMMjczLUwyNzZcbiAgaWYgKHJhbmdlVmFsdWUgJiYgMCA8IGZpbGVTaXplKSB7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VSYW5nZUhlYWRlcihyYW5nZVZhbHVlLCBmaWxlU2l6ZSk7XG5cbiAgICAvLyBSZXR1cm5zIDIwMCBPSyBpZiBwYXJzaW5nIHRoZSByYW5nZSBoZWFkZXIgZmFpbHNcbiAgICBpZiAoIXBhcnNlZCkge1xuICAgICAgLy8gU2V0IGNvbnRlbnQgbGVuZ3RoXG4gICAgICBoZWFkZXJzLnNldChcImNvbnRlbnQtbGVuZ3RoXCIsIGAke2ZpbGVTaXplfWApO1xuXG4gICAgICBjb25zdCBmaWxlID0gYXdhaXQgRGVuby5vcGVuKGZpbGVQYXRoKTtcbiAgICAgIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuT0ssIGZpbGUucmVhZGFibGUsIHsgaGVhZGVycyB9KTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gNDE2IFJhbmdlIE5vdCBTYXRpc2ZpYWJsZSBpZiBpbnZhbGlkIHJhbmdlIGhlYWRlciB2YWx1ZVxuICAgIGlmIChcbiAgICAgIHBhcnNlZC5lbmQgPCAwIHx8XG4gICAgICBwYXJzZWQuZW5kIDwgcGFyc2VkLnN0YXJ0IHx8XG4gICAgICBmaWxlU2l6ZSA8PSBwYXJzZWQuc3RhcnRcbiAgICApIHtcbiAgICAgIC8vIFNldCB0aGUgXCJDb250ZW50LXJhbmdlXCIgaGVhZGVyXG4gICAgICBoZWFkZXJzLnNldChcImNvbnRlbnQtcmFuZ2VcIiwgYGJ5dGVzICovJHtmaWxlU2l6ZX1gKTtcblxuICAgICAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFxuICAgICAgICBTdGF0dXMuUmVxdWVzdGVkUmFuZ2VOb3RTYXRpc2ZpYWJsZSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB7IGhlYWRlcnMgfSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gY2xhbXBzIHRoZSByYW5nZSBoZWFkZXIgdmFsdWVcbiAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDAsIHBhcnNlZC5zdGFydCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5taW4ocGFyc2VkLmVuZCwgZmlsZVNpemUgLSAxKTtcblxuICAgIC8vIFNldCB0aGUgXCJDb250ZW50LXJhbmdlXCIgaGVhZGVyXG4gICAgaGVhZGVycy5zZXQoXCJjb250ZW50LXJhbmdlXCIsIGBieXRlcyAke3N0YXJ0fS0ke2VuZH0vJHtmaWxlU2l6ZX1gKTtcblxuICAgIC8vIFNldCBjb250ZW50IGxlbmd0aFxuICAgIGNvbnN0IGNvbnRlbnRMZW5ndGggPSBlbmQgLSBzdGFydCArIDE7XG4gICAgaGVhZGVycy5zZXQoXCJjb250ZW50LWxlbmd0aFwiLCBgJHtjb250ZW50TGVuZ3RofWApO1xuXG4gICAgLy8gUmV0dXJuIDIwNiBQYXJ0aWFsIENvbnRlbnRcbiAgICBjb25zdCBmaWxlID0gYXdhaXQgRGVuby5vcGVuKGZpbGVQYXRoKTtcbiAgICBhd2FpdCBmaWxlLnNlZWsoc3RhcnQsIERlbm8uU2Vla01vZGUuU3RhcnQpO1xuICAgIGNvbnN0IHNsaWNlZCA9IGZpbGUucmVhZGFibGVcbiAgICAgIC5waXBlVGhyb3VnaChuZXcgQnl0ZVNsaWNlU3RyZWFtKDAsIGNvbnRlbnRMZW5ndGggLSAxKSk7XG4gICAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFN0YXR1cy5QYXJ0aWFsQ29udGVudCwgc2xpY2VkLCB7IGhlYWRlcnMgfSk7XG4gIH1cblxuICAvLyBTZXQgY29udGVudCBsZW5ndGhcbiAgaGVhZGVycy5zZXQoXCJjb250ZW50LWxlbmd0aFwiLCBgJHtmaWxlU2l6ZX1gKTtcblxuICBjb25zdCBmaWxlID0gYXdhaXQgRGVuby5vcGVuKGZpbGVQYXRoKTtcbiAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFN0YXR1cy5PSywgZmlsZS5yZWFkYWJsZSwgeyBoZWFkZXJzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZXJ2ZURpckluZGV4KFxuICBkaXJQYXRoOiBzdHJpbmcsXG4gIG9wdGlvbnM6IHtcbiAgICBzaG93RG90ZmlsZXM6IGJvb2xlYW47XG4gICAgdGFyZ2V0OiBzdHJpbmc7XG4gICAgcXVpZXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG4gIH0sXG4pOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gIGNvbnN0IHsgc2hvd0RvdGZpbGVzIH0gPSBvcHRpb25zO1xuICBjb25zdCBkaXJVcmwgPSBgLyR7XG4gICAgcmVsYXRpdmUob3B0aW9ucy50YXJnZXQsIGRpclBhdGgpLnJlcGxhY2VBbGwoXG4gICAgICBuZXcgUmVnRXhwKFNFUF9QQVRURVJOLCBcImdcIiksXG4gICAgICBcIi9cIixcbiAgICApXG4gIH1gO1xuICBjb25zdCBsaXN0RW50cnlQcm9taXNlOiBQcm9taXNlPEVudHJ5SW5mbz5bXSA9IFtdO1xuXG4gIC8vIGlmIFwiLi5cIiBtYWtlcyBzZW5zZVxuICBpZiAoZGlyVXJsICE9PSBcIi9cIikge1xuICAgIGNvbnN0IHByZXZQYXRoID0gam9pbihkaXJQYXRoLCBcIi4uXCIpO1xuICAgIGNvbnN0IGVudHJ5SW5mbyA9IERlbm8uc3RhdChwcmV2UGF0aCkudGhlbigoZmlsZUluZm8pOiBFbnRyeUluZm8gPT4gKHtcbiAgICAgIG1vZGU6IG1vZGVUb1N0cmluZyh0cnVlLCBmaWxlSW5mby5tb2RlKSxcbiAgICAgIHNpemU6IFwiXCIsXG4gICAgICBuYW1lOiBcIi4uL1wiLFxuICAgICAgdXJsOiBwb3NpeEpvaW4oZGlyVXJsLCBcIi4uXCIpLFxuICAgIH0pKTtcbiAgICBsaXN0RW50cnlQcm9taXNlLnB1c2goZW50cnlJbmZvKTtcbiAgfVxuXG4gIC8vIFJlYWQgZmlsZUluZm8gaW4gcGFyYWxsZWxcbiAgZm9yIGF3YWl0IChjb25zdCBlbnRyeSBvZiBEZW5vLnJlYWREaXIoZGlyUGF0aCkpIHtcbiAgICBpZiAoIXNob3dEb3RmaWxlcyAmJiBlbnRyeS5uYW1lWzBdID09PSBcIi5cIikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGZpbGVQYXRoID0gam9pbihkaXJQYXRoLCBlbnRyeS5uYW1lKTtcbiAgICBjb25zdCBmaWxlVXJsID0gZW5jb2RlVVJJQ29tcG9uZW50KHBvc2l4Sm9pbihkaXJVcmwsIGVudHJ5Lm5hbWUpKVxuICAgICAgLnJlcGxhY2VBbGwoXCIlMkZcIiwgXCIvXCIpO1xuXG4gICAgbGlzdEVudHJ5UHJvbWlzZS5wdXNoKChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWxlSW5mbyA9IGF3YWl0IERlbm8uc3RhdChmaWxlUGF0aCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbW9kZTogbW9kZVRvU3RyaW5nKGVudHJ5LmlzRGlyZWN0b3J5LCBmaWxlSW5mby5tb2RlKSxcbiAgICAgICAgICBzaXplOiBlbnRyeS5pc0ZpbGUgPyBmb3JtYXRCeXRlcyhmaWxlSW5mby5zaXplID8/IDApIDogXCJcIixcbiAgICAgICAgICBuYW1lOiBgJHtlbnRyeS5uYW1lfSR7ZW50cnkuaXNEaXJlY3RvcnkgPyBcIi9cIiA6IFwiXCJ9YCxcbiAgICAgICAgICB1cmw6IGAke2ZpbGVVcmx9JHtlbnRyeS5pc0RpcmVjdG9yeSA/IFwiL1wiIDogXCJcIn1gLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gTm90ZTogRGVuby5zdGF0IGZvciB3aW5kb3dzIHN5c3RlbSBmaWxlcyBtYXkgYmUgcmVqZWN0ZWQgd2l0aCBvcyBlcnJvciAzMi5cbiAgICAgICAgaWYgKCFvcHRpb25zLnF1aWV0KSBsb2dFcnJvcihlcnJvcik7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgbW9kZTogXCIodW5rbm93biBtb2RlKVwiLFxuICAgICAgICAgIHNpemU6IFwiXCIsXG4gICAgICAgICAgbmFtZTogYCR7ZW50cnkubmFtZX0ke2VudHJ5LmlzRGlyZWN0b3J5ID8gXCIvXCIgOiBcIlwifWAsXG4gICAgICAgICAgdXJsOiBgJHtmaWxlVXJsfSR7ZW50cnkuaXNEaXJlY3RvcnkgPyBcIi9cIiA6IFwiXCJ9YCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KSgpKTtcbiAgfVxuXG4gIGNvbnN0IGxpc3RFbnRyeSA9IGF3YWl0IFByb21pc2UuYWxsKGxpc3RFbnRyeVByb21pc2UpO1xuICBsaXN0RW50cnkuc29ydCgoYSwgYikgPT5cbiAgICBhLm5hbWUudG9Mb3dlckNhc2UoKSA+IGIubmFtZS50b0xvd2VyQ2FzZSgpID8gMSA6IC0xXG4gICk7XG4gIGNvbnN0IGZvcm1hdHRlZERpclVybCA9IGAke2RpclVybC5yZXBsYWNlKC9cXC8kLywgXCJcIil9L2A7XG4gIGNvbnN0IHBhZ2UgPSBkaXJWaWV3ZXJUZW1wbGF0ZShmb3JtYXR0ZWREaXJVcmwsIGxpc3RFbnRyeSk7XG5cbiAgY29uc3QgaGVhZGVycyA9IGNyZWF0ZUJhc2VIZWFkZXJzKCk7XG4gIGhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsIFwidGV4dC9odG1sOyBjaGFyc2V0PVVURi04XCIpO1xuXG4gIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuT0ssIHBhZ2UsIHsgaGVhZGVycyB9KTtcbn1cblxuZnVuY3Rpb24gc2VydmVGYWxsYmFjayhtYXliZUVycm9yOiB1bmtub3duKTogUmVzcG9uc2Uge1xuICBpZiAobWF5YmVFcnJvciBpbnN0YW5jZW9mIFVSSUVycm9yKSB7XG4gICAgcmV0dXJuIGNyZWF0ZUNvbW1vblJlc3BvbnNlKFN0YXR1cy5CYWRSZXF1ZXN0KTtcbiAgfVxuXG4gIGlmIChtYXliZUVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpIHtcbiAgICByZXR1cm4gY3JlYXRlQ29tbW9uUmVzcG9uc2UoU3RhdHVzLk5vdEZvdW5kKTtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuSW50ZXJuYWxTZXJ2ZXJFcnJvcik7XG59XG5cbmZ1bmN0aW9uIHNlcnZlckxvZyhyZXE6IFJlcXVlc3QsIHN0YXR1czogbnVtYmVyKSB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGNvbnN0IGRhdGVGbXQgPSBgWyR7ZC5zbGljZSgwLCAxMCl9ICR7ZC5zbGljZSgxMSwgMTkpfV1gO1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwpO1xuICBjb25zdCBzID0gYCR7ZGF0ZUZtdH0gWyR7cmVxLm1ldGhvZH1dICR7dXJsLnBhdGhuYW1lfSR7dXJsLnNlYXJjaH0gJHtzdGF0dXN9YDtcbiAgLy8gdXNpbmcgY29uc29sZS5kZWJ1ZyBpbnN0ZWFkIG9mIGNvbnNvbGUubG9nIHNvIGNocm9tZSBpbnNwZWN0IHVzZXJzIGNhbiBoaWRlIHJlcXVlc3QgbG9nc1xuICBjb25zb2xlLmRlYnVnKHMpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCYXNlSGVhZGVycygpOiBIZWFkZXJzIHtcbiAgcmV0dXJuIG5ldyBIZWFkZXJzKHtcbiAgICBzZXJ2ZXI6IFwiZGVub1wiLFxuICAgIC8vIFNldCBcImFjY2VwdC1yYW5nZXNcIiBzbyB0aGF0IHRoZSBjbGllbnQga25vd3MgaXQgY2FuIG1ha2UgcmFuZ2UgcmVxdWVzdHMgb24gZnV0dXJlIHJlcXVlc3RzXG4gICAgXCJhY2NlcHQtcmFuZ2VzXCI6IFwiYnl0ZXNcIixcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGRpclZpZXdlclRlbXBsYXRlKGRpcm5hbWU6IHN0cmluZywgZW50cmllczogRW50cnlJbmZvW10pOiBzdHJpbmcge1xuICBjb25zdCBwYXRocyA9IGRpcm5hbWUuc3BsaXQoXCIvXCIpO1xuXG4gIHJldHVybiBgXG4gICAgPCFET0NUWVBFIGh0bWw+XG4gICAgPGh0bWwgbGFuZz1cImVuXCI+XG4gICAgICA8aGVhZD5cbiAgICAgICAgPG1ldGEgY2hhcnNldD1cIlVURi04XCIgLz5cbiAgICAgICAgPG1ldGEgbmFtZT1cInZpZXdwb3J0XCIgY29udGVudD1cIndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjBcIiAvPlxuICAgICAgICA8bWV0YSBodHRwLWVxdWl2PVwiWC1VQS1Db21wYXRpYmxlXCIgY29udGVudD1cImllPWVkZ2VcIiAvPlxuICAgICAgICA8dGl0bGU+RGVubyBGaWxlIFNlcnZlcjwvdGl0bGU+XG4gICAgICAgIDxzdHlsZT5cbiAgICAgICAgICA6cm9vdCB7XG4gICAgICAgICAgICAtLWJhY2tncm91bmQtY29sb3I6ICNmYWZhZmE7XG4gICAgICAgICAgICAtLWNvbG9yOiByZ2JhKDAsIDAsIDAsIDAuODcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKSB7XG4gICAgICAgICAgICA6cm9vdCB7XG4gICAgICAgICAgICAgIC0tYmFja2dyb3VuZC1jb2xvcjogIzI5MjkyOTtcbiAgICAgICAgICAgICAgLS1jb2xvcjogI2ZmZjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZWFkIHtcbiAgICAgICAgICAgICAgY29sb3I6ICM3ZjdmN2Y7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIEBtZWRpYSAobWluLXdpZHRoOiA5NjBweCkge1xuICAgICAgICAgICAgbWFpbiB7XG4gICAgICAgICAgICAgIG1heC13aWR0aDogOTYwcHg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBib2R5IHtcbiAgICAgICAgICAgICAgcGFkZGluZy1sZWZ0OiAzMnB4O1xuICAgICAgICAgICAgICBwYWRkaW5nLXJpZ2h0OiAzMnB4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBAbWVkaWEgKG1pbi13aWR0aDogNjAwcHgpIHtcbiAgICAgICAgICAgIG1haW4ge1xuICAgICAgICAgICAgICBwYWRkaW5nLWxlZnQ6IDI0cHg7XG4gICAgICAgICAgICAgIHBhZGRpbmctcmlnaHQ6IDI0cHg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJvZHkge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1jb2xvcik7XG4gICAgICAgICAgICBjb2xvcjogdmFyKC0tY29sb3IpO1xuICAgICAgICAgICAgZm9udC1mYW1pbHk6IFwiUm9ib3RvXCIsIFwiSGVsdmV0aWNhXCIsIFwiQXJpYWxcIiwgc2Fucy1zZXJpZjtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA0MDA7XG4gICAgICAgICAgICBsaW5lLWhlaWdodDogMS40MztcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMC44NzVyZW07XG4gICAgICAgICAgfVxuICAgICAgICAgIGEge1xuICAgICAgICAgICAgY29sb3I6ICMyMTk2ZjM7XG4gICAgICAgICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGE6aG92ZXIge1xuICAgICAgICAgICAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoZWFkIHtcbiAgICAgICAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoZWFkIHRoIHtcbiAgICAgICAgICAgIHBhZGRpbmctYm90dG9tOiAxMnB4O1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YWJsZSB0ZCB7XG4gICAgICAgICAgICBwYWRkaW5nOiA2cHggMzZweCA2cHggMHB4O1xuICAgICAgICAgIH1cbiAgICAgICAgICAuc2l6ZSB7XG4gICAgICAgICAgICB0ZXh0LWFsaWduOiByaWdodDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMnB4IDZweCAyNHB4O1xuICAgICAgICAgIH1cbiAgICAgICAgICAubW9kZSB7XG4gICAgICAgICAgICBmb250LWZhbWlseTogbW9ub3NwYWNlLCBtb25vc3BhY2U7XG4gICAgICAgICAgfVxuICAgICAgICA8L3N0eWxlPlxuICAgICAgPC9oZWFkPlxuICAgICAgPGJvZHk+XG4gICAgICAgIDxtYWluPlxuICAgICAgICAgIDxoMT5JbmRleCBvZlxuICAgICAgICAgIDxhIGhyZWY9XCIvXCI+aG9tZTwvYT4ke1xuICAgIHBhdGhzXG4gICAgICAubWFwKChwYXRoLCBpbmRleCwgYXJyYXkpID0+IHtcbiAgICAgICAgaWYgKHBhdGggPT09IFwiXCIpIHJldHVybiBcIlwiO1xuICAgICAgICBjb25zdCBsaW5rID0gYXJyYXkuc2xpY2UoMCwgaW5kZXggKyAxKS5qb2luKFwiL1wiKTtcbiAgICAgICAgcmV0dXJuIGA8YSBocmVmPVwiJHtsaW5rfVwiPiR7cGF0aH08L2E+YDtcbiAgICAgIH0pXG4gICAgICAuam9pbihcIi9cIilcbiAgfVxuICAgICAgICAgIDwvaDE+XG4gICAgICAgICAgPHRhYmxlPlxuICAgICAgICAgICAgPHRoZWFkPlxuICAgICAgICAgICAgICA8dHI+XG4gICAgICAgICAgICAgICAgPHRoPk1vZGU8L3RoPlxuICAgICAgICAgICAgICAgIDx0aD5TaXplPC90aD5cbiAgICAgICAgICAgICAgICA8dGg+TmFtZTwvdGg+XG4gICAgICAgICAgICAgIDwvdHI+XG4gICAgICAgICAgICA8L3RoZWFkPlxuICAgICAgICAgICAgJHtcbiAgICBlbnRyaWVzXG4gICAgICAubWFwKFxuICAgICAgICAoZW50cnkpID0+IGBcbiAgICAgICAgICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgICAgICAgICAgPHRkIGNsYXNzPVwibW9kZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICR7ZW50cnkubW9kZX1cbiAgICAgICAgICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgICAgICAgICAgICAgPHRkIGNsYXNzPVwic2l6ZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICR7ZW50cnkuc2l6ZX1cbiAgICAgICAgICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgICAgICAgICAgICAgPHRkPlxuICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIke2VudHJ5LnVybH1cIj4ke2VudHJ5Lm5hbWV9PC9hPlxuICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgPC90cj5cbiAgICAgICAgICAgICAgICBgLFxuICAgICAgKVxuICAgICAgLmpvaW4oXCJcIilcbiAgfVxuICAgICAgICAgIDwvdGFibGU+XG4gICAgICAgIDwvbWFpbj5cbiAgICAgIDwvYm9keT5cbiAgICA8L2h0bWw+XG4gIGA7XG59XG5cbi8qKiBJbnRlcmZhY2UgZm9yIHNlcnZlRGlyIG9wdGlvbnMuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlRGlyT3B0aW9ucyB7XG4gIC8qKiBTZXJ2ZXMgdGhlIGZpbGVzIHVuZGVyIHRoZSBnaXZlbiBkaXJlY3Rvcnkgcm9vdC4gRGVmYXVsdHMgdG8geW91ciBjdXJyZW50IGRpcmVjdG9yeS5cbiAgICpcbiAgICogQGRlZmF1bHQge1wiLlwifVxuICAgKi9cbiAgZnNSb290Pzogc3RyaW5nO1xuICAvKiogU3BlY2lmaWVkIHRoYXQgcGFydCBpcyBzdHJpcHBlZCBmcm9tIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHJlcXVlc3RlZCBwYXRobmFtZS5cbiAgICpcbiAgICogQGRlZmF1bHQge3VuZGVmaW5lZH1cbiAgICovXG4gIHVybFJvb3Q/OiBzdHJpbmc7XG4gIC8qKiBFbmFibGUgZGlyZWN0b3J5IGxpc3RpbmcuXG4gICAqXG4gICAqIEBkZWZhdWx0IHtmYWxzZX1cbiAgICovXG4gIHNob3dEaXJMaXN0aW5nPzogYm9vbGVhbjtcbiAgLyoqIFNlcnZlcyBkb3RmaWxlcy5cbiAgICpcbiAgICogQGRlZmF1bHQge2ZhbHNlfVxuICAgKi9cbiAgc2hvd0RvdGZpbGVzPzogYm9vbGVhbjtcbiAgLyoqIFNlcnZlcyBpbmRleC5odG1sIGFzIHRoZSBpbmRleCBmaWxlIG9mIHRoZSBkaXJlY3RvcnkuXG4gICAqXG4gICAqIEBkZWZhdWx0IHt0cnVlfVxuICAgKi9cbiAgc2hvd0luZGV4PzogYm9vbGVhbjtcbiAgLyoqIEVuYWJsZSBDT1JTIHZpYSB0aGUgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIiBoZWFkZXIuXG4gICAqXG4gICAqIEBkZWZhdWx0IHtmYWxzZX1cbiAgICovXG4gIGVuYWJsZUNvcnM/OiBib29sZWFuO1xuICAvKiogRG8gbm90IHByaW50IHJlcXVlc3QgbGV2ZWwgbG9ncy4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAqXG4gICAqIEBkZWZhdWx0IHtmYWxzZX1cbiAgICovXG4gIHF1aWV0PzogYm9vbGVhbjtcbiAgLyoqIFRoZSBhbGdvcml0aG0gdG8gdXNlIGZvciBnZW5lcmF0aW5nIHRoZSBFVGFnLlxuICAgKlxuICAgKiBAZGVmYXVsdCB7XCJTSEEtMjU2XCJ9XG4gICAqL1xuICBldGFnQWxnb3JpdGhtPzogQWxnb3JpdGhtSWRlbnRpZmllcjtcbiAgLyoqIEhlYWRlcnMgdG8gYWRkIHRvIGVhY2ggcmVzcG9uc2VcbiAgICpcbiAgICogQGRlZmF1bHQge1tdfVxuICAgKi9cbiAgaGVhZGVycz86IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFNlcnZlcyB0aGUgZmlsZXMgdW5kZXIgdGhlIGdpdmVuIGRpcmVjdG9yeSByb290IChvcHRzLmZzUm9vdCkuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlRGlyIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9maWxlX3NlcnZlci50c1wiO1xuICpcbiAqIERlbm8uc2VydmUoKHJlcSkgPT4ge1xuICogICBjb25zdCBwYXRobmFtZSA9IG5ldyBVUkwocmVxLnVybCkucGF0aG5hbWU7XG4gKiAgIGlmIChwYXRobmFtZS5zdGFydHNXaXRoKFwiL3N0YXRpY1wiKSkge1xuICogICAgIHJldHVybiBzZXJ2ZURpcihyZXEsIHtcbiAqICAgICAgIGZzUm9vdDogXCJwYXRoL3RvL3N0YXRpYy9maWxlcy9kaXJcIixcbiAqICAgICB9KTtcbiAqICAgfVxuICogICAvLyBEbyBkeW5hbWljIHJlc3BvbnNlc1xuICogICByZXR1cm4gbmV3IFJlc3BvbnNlKCk7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIE9wdGlvbmFsbHkgeW91IGNhbiBwYXNzIGB1cmxSb290YCBvcHRpb24uIElmIGl0J3Mgc3BlY2lmaWVkIHRoYXQgcGFydCBpcyBzdHJpcHBlZCBmcm9tIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHJlcXVlc3RlZCBwYXRobmFtZS5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmVEaXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2ZpbGVfc2VydmVyLnRzXCI7XG4gKlxuICogLy8gLi4uXG4gKiBzZXJ2ZURpcihuZXcgUmVxdWVzdChcImh0dHA6Ly9sb2NhbGhvc3Qvc3RhdGljL3BhdGgvdG8vZmlsZVwiKSwge1xuICogICBmc1Jvb3Q6IFwicHVibGljXCIsXG4gKiAgIHVybFJvb3Q6IFwic3RhdGljXCIsXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIFRoZSBhYm92ZSBleGFtcGxlIHNlcnZlcyBgLi9wdWJsaWMvcGF0aC90by9maWxlYCBmb3IgdGhlIHJlcXVlc3QgdG8gYC9zdGF0aWMvcGF0aC90by9maWxlYC5cbiAqXG4gKiBAcGFyYW0gcmVxIFRoZSByZXF1ZXN0IHRvIGhhbmRsZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmVEaXIocmVxOiBSZXF1ZXN0LCBvcHRzOiBTZXJ2ZURpck9wdGlvbnMgPSB7fSkge1xuICBsZXQgcmVzcG9uc2U6IFJlc3BvbnNlO1xuICB0cnkge1xuICAgIHJlc3BvbnNlID0gYXdhaXQgY3JlYXRlU2VydmVEaXJSZXNwb25zZShyZXEsIG9wdHMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmICghb3B0cy5xdWlldCkgbG9nRXJyb3IoZXJyb3IpO1xuICAgIHJlc3BvbnNlID0gc2VydmVGYWxsYmFjayhlcnJvcik7XG4gIH1cblxuICAvLyBEbyBub3QgdXBkYXRlIHRoZSBoZWFkZXIgaWYgdGhlIHJlc3BvbnNlIGlzIGEgMzAxIHJlZGlyZWN0LlxuICBjb25zdCBpc1JlZGlyZWN0UmVzcG9uc2UgPSBpc1JlZGlyZWN0U3RhdHVzKHJlc3BvbnNlLnN0YXR1cyk7XG5cbiAgaWYgKG9wdHMuZW5hYmxlQ29ycyAmJiAhaXNSZWRpcmVjdFJlc3BvbnNlKSB7XG4gICAgcmVzcG9uc2UuaGVhZGVycy5hcHBlbmQoXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1vcmlnaW5cIiwgXCIqXCIpO1xuICAgIHJlc3BvbnNlLmhlYWRlcnMuYXBwZW5kKFxuICAgICAgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1oZWFkZXJzXCIsXG4gICAgICBcIk9yaWdpbiwgWC1SZXF1ZXN0ZWQtV2l0aCwgQ29udGVudC1UeXBlLCBBY2NlcHQsIFJhbmdlXCIsXG4gICAgKTtcbiAgfVxuXG4gIGlmICghb3B0cy5xdWlldCkgc2VydmVyTG9nKHJlcSwgcmVzcG9uc2Uuc3RhdHVzKTtcblxuICBpZiAob3B0cy5oZWFkZXJzICYmICFpc1JlZGlyZWN0UmVzcG9uc2UpIHtcbiAgICBmb3IgKGNvbnN0IGhlYWRlciBvZiBvcHRzLmhlYWRlcnMpIHtcbiAgICAgIGNvbnN0IGhlYWRlclNwbGl0ID0gaGVhZGVyLnNwbGl0KFwiOlwiKTtcbiAgICAgIGNvbnN0IG5hbWUgPSBoZWFkZXJTcGxpdFswXTtcbiAgICAgIGNvbnN0IHZhbHVlID0gaGVhZGVyU3BsaXQuc2xpY2UoMSkuam9pbihcIjpcIik7XG4gICAgICByZXNwb25zZS5oZWFkZXJzLmFwcGVuZChuYW1lLCB2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVTZXJ2ZURpclJlc3BvbnNlKFxuICByZXE6IFJlcXVlc3QsXG4gIG9wdHM6IFNlcnZlRGlyT3B0aW9ucyxcbikge1xuICBjb25zdCB0YXJnZXQgPSBvcHRzLmZzUm9vdCB8fCBcIi5cIjtcbiAgY29uc3QgdXJsUm9vdCA9IG9wdHMudXJsUm9vdDtcbiAgY29uc3Qgc2hvd0luZGV4ID0gb3B0cy5zaG93SW5kZXggPz8gdHJ1ZTtcbiAgY29uc3Qgc2hvd0RvdGZpbGVzID0gb3B0cy5zaG93RG90ZmlsZXMgfHwgZmFsc2U7XG4gIGNvbnN0IHsgZXRhZ0FsZ29yaXRobSwgc2hvd0Rpckxpc3RpbmcsIHF1aWV0IH0gPSBvcHRzO1xuXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCk7XG4gIGNvbnN0IGRlY29kZWRVcmwgPSBkZWNvZGVVUklDb21wb25lbnQodXJsLnBhdGhuYW1lKTtcbiAgbGV0IG5vcm1hbGl6ZWRQYXRoID0gcG9zaXhOb3JtYWxpemUoZGVjb2RlZFVybCk7XG5cbiAgaWYgKHVybFJvb3QgJiYgIW5vcm1hbGl6ZWRQYXRoLnN0YXJ0c1dpdGgoXCIvXCIgKyB1cmxSb290KSkge1xuICAgIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuTm90Rm91bmQpO1xuICB9XG5cbiAgLy8gUmVkaXJlY3QgcGF0aHMgbGlrZSBgL2Zvby8vLy9iYXJgIGFuZCBgL2Zvby9iYXIvLy8vL2AgdG8gbm9ybWFsaXplZCBwYXRocy5cbiAgaWYgKG5vcm1hbGl6ZWRQYXRoICE9PSBkZWNvZGVkVXJsKSB7XG4gICAgdXJsLnBhdGhuYW1lID0gbm9ybWFsaXplZFBhdGg7XG4gICAgcmV0dXJuIFJlc3BvbnNlLnJlZGlyZWN0KHVybCwgMzAxKTtcbiAgfVxuXG4gIGlmICh1cmxSb290KSB7XG4gICAgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVkUGF0aC5yZXBsYWNlKHVybFJvb3QsIFwiXCIpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoZXMgdG8gYXZvaWQgRU5PRU5UIGVycm9yc1xuICAvLyB3aGVuIGFjY2Vzc2luZyBhIHBhdGggdG8gYSBmaWxlIHdpdGggYSB0cmFpbGluZyBzbGFzaC5cbiAgaWYgKG5vcm1hbGl6ZWRQYXRoLmVuZHNXaXRoKFwiL1wiKSkge1xuICAgIG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplZFBhdGguc2xpY2UoMCwgLTEpO1xuICB9XG5cbiAgY29uc3QgZnNQYXRoID0gam9pbih0YXJnZXQsIG5vcm1hbGl6ZWRQYXRoKTtcbiAgY29uc3QgZmlsZUluZm8gPSBhd2FpdCBEZW5vLnN0YXQoZnNQYXRoKTtcblxuICAvLyBGb3IgZmlsZXMsIHJlbW92ZSB0aGUgdHJhaWxpbmcgc2xhc2ggZnJvbSB0aGUgcGF0aC5cbiAgaWYgKGZpbGVJbmZvLmlzRmlsZSAmJiB1cmwucGF0aG5hbWUuZW5kc1dpdGgoXCIvXCIpKSB7XG4gICAgdXJsLnBhdGhuYW1lID0gdXJsLnBhdGhuYW1lLnNsaWNlKDAsIC0xKTtcbiAgICByZXR1cm4gUmVzcG9uc2UucmVkaXJlY3QodXJsLCAzMDEpO1xuICB9XG4gIC8vIEZvciBkaXJlY3RvcmllcywgdGhlIHBhdGggbXVzdCBoYXZlIGEgdHJhaWxpbmcgc2xhc2guXG4gIGlmIChmaWxlSW5mby5pc0RpcmVjdG9yeSAmJiAhdXJsLnBhdGhuYW1lLmVuZHNXaXRoKFwiL1wiKSkge1xuICAgIC8vIE9uIGRpcmVjdG9yeSBsaXN0aW5nIHBhZ2VzLFxuICAgIC8vIGlmIHRoZSBjdXJyZW50IFVSTCdzIHBhdGhuYW1lIGRvZXNuJ3QgZW5kIHdpdGggYSBzbGFzaCwgYW55XG4gICAgLy8gcmVsYXRpdmUgVVJMcyBpbiB0aGUgaW5kZXggZmlsZSB3aWxsIHJlc29sdmUgYWdhaW5zdCB0aGUgcGFyZW50XG4gICAgLy8gZGlyZWN0b3J5LCByYXRoZXIgdGhhbiB0aGUgY3VycmVudCBkaXJlY3RvcnkuIFRvIHByZXZlbnQgdGhhdCwgd2VcbiAgICAvLyByZXR1cm4gYSAzMDEgcmVkaXJlY3QgdG8gdGhlIFVSTCB3aXRoIGEgc2xhc2guXG4gICAgdXJsLnBhdGhuYW1lICs9IFwiL1wiO1xuICAgIHJldHVybiBSZXNwb25zZS5yZWRpcmVjdCh1cmwsIDMwMSk7XG4gIH1cblxuICAvLyBpZiB0YXJnZXQgaXMgZmlsZSwgc2VydmUgZmlsZS5cbiAgaWYgKCFmaWxlSW5mby5pc0RpcmVjdG9yeSkge1xuICAgIHJldHVybiBzZXJ2ZUZpbGUocmVxLCBmc1BhdGgsIHtcbiAgICAgIGV0YWdBbGdvcml0aG0sXG4gICAgICBmaWxlSW5mbyxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIGlmIHRhcmdldCBpcyBkaXJlY3RvcnksIHNlcnZlIGluZGV4IG9yIGRpciBsaXN0aW5nLlxuICBpZiAoc2hvd0luZGV4KSB7IC8vIHNlcnZlIGluZGV4Lmh0bWxcbiAgICBjb25zdCBpbmRleFBhdGggPSBqb2luKGZzUGF0aCwgXCJpbmRleC5odG1sXCIpO1xuXG4gICAgbGV0IGluZGV4RmlsZUluZm86IERlbm8uRmlsZUluZm8gfCB1bmRlZmluZWQ7XG4gICAgdHJ5IHtcbiAgICAgIGluZGV4RmlsZUluZm8gPSBhd2FpdCBEZW5vLmxzdGF0KGluZGV4UGF0aCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmICghKGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmQpKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgLy8gc2tpcCBOb3QgRm91bmQgZXJyb3JcbiAgICB9XG5cbiAgICBpZiAoaW5kZXhGaWxlSW5mbz8uaXNGaWxlKSB7XG4gICAgICByZXR1cm4gc2VydmVGaWxlKHJlcSwgaW5kZXhQYXRoLCB7XG4gICAgICAgIGV0YWdBbGdvcml0aG0sXG4gICAgICAgIGZpbGVJbmZvOiBpbmRleEZpbGVJbmZvLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNob3dEaXJMaXN0aW5nKSB7IC8vIHNlcnZlIGRpcmVjdG9yeSBsaXN0XG4gICAgcmV0dXJuIHNlcnZlRGlySW5kZXgoZnNQYXRoLCB7IHNob3dEb3RmaWxlcywgdGFyZ2V0LCBxdWlldCB9KTtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVDb21tb25SZXNwb25zZShTdGF0dXMuTm90Rm91bmQpO1xufVxuXG5mdW5jdGlvbiBsb2dFcnJvcihlcnJvcjogdW5rbm93bikge1xuICBjb25zb2xlLmVycm9yKHJlZChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGAke2Vycm9yfWApKTtcbn1cblxuZnVuY3Rpb24gbWFpbigpIHtcbiAgY29uc3Qgc2VydmVyQXJncyA9IHBhcnNlKERlbm8uYXJncywge1xuICAgIHN0cmluZzogW1wicG9ydFwiLCBcImhvc3RcIiwgXCJjZXJ0XCIsIFwia2V5XCIsIFwiaGVhZGVyXCJdLFxuICAgIGJvb2xlYW46IFtcImhlbHBcIiwgXCJkaXItbGlzdGluZ1wiLCBcImRvdGZpbGVzXCIsIFwiY29yc1wiLCBcInZlcmJvc2VcIiwgXCJ2ZXJzaW9uXCJdLFxuICAgIG5lZ2F0YWJsZTogW1wiZGlyLWxpc3RpbmdcIiwgXCJkb3RmaWxlc1wiLCBcImNvcnNcIl0sXG4gICAgY29sbGVjdDogW1wiaGVhZGVyXCJdLFxuICAgIGRlZmF1bHQ6IHtcbiAgICAgIFwiZGlyLWxpc3RpbmdcIjogdHJ1ZSxcbiAgICAgIGRvdGZpbGVzOiB0cnVlLFxuICAgICAgY29yczogdHJ1ZSxcbiAgICAgIHZlcmJvc2U6IGZhbHNlLFxuICAgICAgdmVyc2lvbjogZmFsc2UsXG4gICAgICBob3N0OiBcIjAuMC4wLjBcIixcbiAgICAgIHBvcnQ6IFwiNDUwN1wiLFxuICAgICAgY2VydDogXCJcIixcbiAgICAgIGtleTogXCJcIixcbiAgICB9LFxuICAgIGFsaWFzOiB7XG4gICAgICBwOiBcInBvcnRcIixcbiAgICAgIGM6IFwiY2VydFwiLFxuICAgICAgazogXCJrZXlcIixcbiAgICAgIGg6IFwiaGVscFwiLFxuICAgICAgdjogXCJ2ZXJib3NlXCIsXG4gICAgICBWOiBcInZlcnNpb25cIixcbiAgICAgIEg6IFwiaGVhZGVyXCIsXG4gICAgfSxcbiAgfSk7XG4gIGNvbnN0IHBvcnQgPSBOdW1iZXIoc2VydmVyQXJncy5wb3J0KTtcbiAgY29uc3QgaGVhZGVycyA9IHNlcnZlckFyZ3MuaGVhZGVyIHx8IFtdO1xuICBjb25zdCBob3N0ID0gc2VydmVyQXJncy5ob3N0O1xuICBjb25zdCBjZXJ0RmlsZSA9IHNlcnZlckFyZ3MuY2VydDtcbiAgY29uc3Qga2V5RmlsZSA9IHNlcnZlckFyZ3Mua2V5O1xuXG4gIGlmIChzZXJ2ZXJBcmdzLmhlbHApIHtcbiAgICBwcmludFVzYWdlKCk7XG4gICAgRGVuby5leGl0KCk7XG4gIH1cblxuICBpZiAoc2VydmVyQXJncy52ZXJzaW9uKSB7XG4gICAgY29uc29sZS5sb2coYERlbm8gRmlsZSBTZXJ2ZXIgJHtWRVJTSU9OfWApO1xuICAgIERlbm8uZXhpdCgpO1xuICB9XG5cbiAgaWYgKGtleUZpbGUgfHwgY2VydEZpbGUpIHtcbiAgICBpZiAoa2V5RmlsZSA9PT0gXCJcIiB8fCBjZXJ0RmlsZSA9PT0gXCJcIikge1xuICAgICAgY29uc29sZS5sb2coXCItLWtleSBhbmQgLS1jZXJ0IGFyZSByZXF1aXJlZCBmb3IgVExTXCIpO1xuICAgICAgcHJpbnRVc2FnZSgpO1xuICAgICAgRGVuby5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHdpbGQgPSBzZXJ2ZXJBcmdzLl8gYXMgc3RyaW5nW107XG4gIGNvbnN0IHRhcmdldCA9IHJlc29sdmUod2lsZFswXSA/PyBcIlwiKTtcblxuICBjb25zdCBoYW5kbGVyID0gKHJlcTogUmVxdWVzdCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICByZXR1cm4gc2VydmVEaXIocmVxLCB7XG4gICAgICBmc1Jvb3Q6IHRhcmdldCxcbiAgICAgIHNob3dEaXJMaXN0aW5nOiBzZXJ2ZXJBcmdzW1wiZGlyLWxpc3RpbmdcIl0sXG4gICAgICBzaG93RG90ZmlsZXM6IHNlcnZlckFyZ3MuZG90ZmlsZXMsXG4gICAgICBlbmFibGVDb3JzOiBzZXJ2ZXJBcmdzLmNvcnMsXG4gICAgICBxdWlldDogIXNlcnZlckFyZ3MudmVyYm9zZSxcbiAgICAgIGhlYWRlcnMsXG4gICAgfSk7XG4gIH07XG5cbiAgY29uc3QgdXNlVGxzID0gISEoa2V5RmlsZSAmJiBjZXJ0RmlsZSk7XG5cbiAgaWYgKHVzZVRscykge1xuICAgIERlbm8uc2VydmUoe1xuICAgICAgcG9ydCxcbiAgICAgIGhvc3RuYW1lOiBob3N0LFxuICAgICAgY2VydDogRGVuby5yZWFkVGV4dEZpbGVTeW5jKGNlcnRGaWxlKSxcbiAgICAgIGtleTogRGVuby5yZWFkVGV4dEZpbGVTeW5jKGtleUZpbGUpLFxuICAgIH0sIGhhbmRsZXIpO1xuICB9IGVsc2Uge1xuICAgIERlbm8uc2VydmUoe1xuICAgICAgcG9ydCxcbiAgICAgIGhvc3RuYW1lOiBob3N0LFxuICAgIH0sIGhhbmRsZXIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHByaW50VXNhZ2UoKSB7XG4gIGNvbnNvbGUubG9nKGBEZW5vIEZpbGUgU2VydmVyICR7VkVSU0lPTn1cbiAgU2VydmVzIGEgbG9jYWwgZGlyZWN0b3J5IGluIEhUVFAuXG5cbklOU1RBTEw6XG4gIGRlbm8gaW5zdGFsbCAtLWFsbG93LW5ldCAtLWFsbG93LXJlYWQgaHR0cHM6Ly9kZW5vLmxhbmQvc3RkL2h0dHAvZmlsZV9zZXJ2ZXIudHNcblxuVVNBR0U6XG4gIGZpbGVfc2VydmVyIFtwYXRoXSBbb3B0aW9uc11cblxuT1BUSU9OUzpcbiAgLWgsIC0taGVscCAgICAgICAgICAgIFByaW50cyBoZWxwIGluZm9ybWF0aW9uXG4gIC1wLCAtLXBvcnQgPFBPUlQ+ICAgICBTZXQgcG9ydFxuICAtLWNvcnMgICAgICAgICAgICAgICAgRW5hYmxlIENPUlMgdmlhIHRoZSBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiIGhlYWRlclxuICAtLWhvc3QgICAgIDxIT1NUPiAgICAgSG9zdG5hbWUgKGRlZmF1bHQgaXMgMC4wLjAuMClcbiAgLWMsIC0tY2VydCA8RklMRT4gICAgIFRMUyBjZXJ0aWZpY2F0ZSBmaWxlIChlbmFibGVzIFRMUylcbiAgLWssIC0ta2V5ICA8RklMRT4gICAgIFRMUyBrZXkgZmlsZSAoZW5hYmxlcyBUTFMpXG4gIC1ILCAtLWhlYWRlciA8SEVBREVSPiBTZXRzIGEgaGVhZGVyIG9uIGV2ZXJ5IHJlcXVlc3QuXG4gICAgICAgICAgICAgICAgICAgICAgICAoZS5nLiAtLWhlYWRlciBcIkNhY2hlLUNvbnRyb2w6IG5vLWNhY2hlXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBUaGlzIG9wdGlvbiBjYW4gYmUgc3BlY2lmaWVkIG11bHRpcGxlIHRpbWVzLlxuICAtLW5vLWRpci1saXN0aW5nICAgICAgRGlzYWJsZSBkaXJlY3RvcnkgbGlzdGluZ1xuICAtLW5vLWRvdGZpbGVzICAgICAgICAgRG8gbm90IHNob3cgZG90ZmlsZXNcbiAgLS1uby1jb3JzICAgICAgICAgICAgIERpc2FibGUgY3Jvc3Mtb3JpZ2luIHJlc291cmNlIHNoYXJpbmdcbiAgLXYsIC0tdmVyYm9zZSAgICAgICAgIFByaW50IHJlcXVlc3QgbGV2ZWwgbG9nc1xuICAtViwgLS12ZXJzaW9uICAgICAgICAgUHJpbnQgdmVyc2lvbiBpbmZvcm1hdGlvblxuXG4gIEFsbCBUTFMgb3B0aW9ucyBhcmUgcmVxdWlyZWQgd2hlbiBvbmUgaXMgcHJvdmlkZWQuYCk7XG59XG5cbmlmIChpbXBvcnQubWV0YS5tYWluKSB7XG4gIG1haW4oKTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsMEVBQTBFO0FBRTFFLGdFQUFnRTtBQUNoRSwyQ0FBMkM7QUFDM0MsZ0ZBQWdGO0FBRWhGOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0F3QkMsR0FFRCxTQUFTLFFBQVEsU0FBUyxRQUFRLHdCQUF3QjtBQUMxRCxTQUFTLGFBQWEsY0FBYyxRQUFRLDZCQUE2QjtBQUN6RSxTQUFTLE9BQU8sUUFBUSxxQkFBcUI7QUFDN0MsU0FBUyxJQUFJLFFBQVEsa0JBQWtCO0FBQ3ZDLFNBQVMsUUFBUSxRQUFRLHNCQUFzQjtBQUMvQyxTQUFTLE9BQU8sUUFBUSxxQkFBcUI7QUFDN0MsU0FBUyxXQUFXLFFBQVEsdUJBQXVCO0FBQ25ELFNBQVMsV0FBVyxRQUFRLGlDQUFpQztBQUM3RCxTQUFTLFNBQVMsRUFBRSxXQUFXLFFBQVEsWUFBWTtBQUNuRCxTQUFTLGdCQUFnQixFQUFFLE1BQU0sUUFBUSxtQkFBbUI7QUFDNUQsU0FBUyxlQUFlLFFBQVEsa0NBQWtDO0FBQ2xF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
// denoCacheMetadata=11554562048226463540,5697204514221621582