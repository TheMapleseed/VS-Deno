// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
import { delay } from "../async/delay.ts";
/** Thrown by Server after it has been closed. */ const ERROR_SERVER_CLOSED = "Server closed";
/** Default port for serving HTTP. */ const HTTP_PORT = 80;
/** Default port for serving HTTPS. */ const HTTPS_PORT = 443;
/** Initial backoff delay of 5ms following a temporary accept failure. */ const INITIAL_ACCEPT_BACKOFF_DELAY = 5;
/** Max backoff delay of 1s following a temporary accept failure. */ const MAX_ACCEPT_BACKOFF_DELAY = 1000;
/**
 * Used to construct an HTTP server.
 */ export class Server {
  #port;
  #host;
  #handler;
  #closed = false;
  #listeners = new Set();
  #acceptBackoffDelayAbortController = new AbortController();
  #httpConnections = new Set();
  #onError;
  /**
   * Constructs a new HTTP Server instance.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   * ```
   *
   * @param serverInit Options for running an HTTP server.
   */ constructor(serverInit){
    this.#port = serverInit.port;
    this.#host = serverInit.hostname;
    this.#handler = serverInit.handler;
    this.#onError = serverInit.onError ?? function(error) {
      console.error(error);
      return new Response("Internal Server Error", {
        status: 500
      });
    };
  }
  /**
   * Accept incoming connections on the given listener, and handle requests on
   * these connections with the given handler.
   *
   * HTTP/2 support is only enabled if the provided Deno.Listener returns TLS
   * connections and was configured with "h2" in the ALPN protocols.
   *
   * Throws a server closed error if called after the server has been closed.
   *
   * Will always close the created listener.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ handler });
   * const listener = Deno.listen({ port: 4505 });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.serve(listener);
   * ```
   *
   * @param listener The listener to accept connections from.
   */ async serve(listener) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#trackListener(listener);
    try {
      return await this.#accept(listener);
    } finally{
      this.#untrackListener(listener);
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
  }
  /**
   * Create a listener on the server, accept incoming connections, and handle
   * requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 80 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * console.log("server listening on http://localhost:4505");
   *
   * await server.listenAndServe();
   * ```
   */ async listenAndServe() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listen({
      port: this.#port ?? HTTP_PORT,
      hostname: this.#host ?? "0.0.0.0",
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Create a listener on the server, accept incoming connections, upgrade them
   * to TLS, and handle requests on these connections with the given handler.
   *
   * If the server was constructed without a specified port, 443 is used.
   *
   * If the server was constructed with the hostname omitted from the options, the
   * non-routable meta-address `0.0.0.0` is used.
   *
   * Throws a server closed error if the server has been closed.
   *
   * ```ts
   * import { Server } from "https://deno.land/std@$STD_VERSION/http/server.ts";
   *
   * const port = 4505;
   * const handler = (request: Request) => {
   *   const body = `Your user-agent is:\n\n${request.headers.get(
   *    "user-agent",
   *   ) ?? "Unknown"}`;
   *
   *   return new Response(body, { status: 200 });
   * };
   *
   * const server = new Server({ port, handler });
   *
   * const certFile = "/path/to/certFile.crt";
   * const keyFile = "/path/to/keyFile.key";
   *
   * console.log("server listening on https://localhost:4505");
   *
   * await server.listenAndServeTls(certFile, keyFile);
   * ```
   *
   * @param certFile The path to the file containing the TLS certificate.
   * @param keyFile The path to the file containing the TLS private key.
   */ async listenAndServeTls(certFile, keyFile) {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    const listener = Deno.listenTls({
      port: this.#port ?? HTTPS_PORT,
      hostname: this.#host ?? "0.0.0.0",
      certFile,
      keyFile,
      transport: "tcp"
    });
    return await this.serve(listener);
  }
  /**
   * Immediately close the server listeners and associated HTTP connections.
   *
   * Throws a server closed error if called after the server has been closed.
   */ close() {
    if (this.#closed) {
      throw new Deno.errors.Http(ERROR_SERVER_CLOSED);
    }
    this.#closed = true;
    for (const listener of this.#listeners){
      try {
        listener.close();
      } catch  {
      // Listener has already been closed.
      }
    }
    this.#listeners.clear();
    this.#acceptBackoffDelayAbortController.abort();
    for (const httpConn of this.#httpConnections){
      this.#closeHttpConn(httpConn);
    }
    this.#httpConnections.clear();
  }
  /** Get whether the server is closed. */ get closed() {
    return this.#closed;
  }
  /** Get the list of network addresses the server is listening on. */ get addrs() {
    return Array.from(this.#listeners).map((listener)=>listener.addr);
  }
  /**
   * Responds to an HTTP request.
   *
   * @param requestEvent The HTTP request to respond to.
   * @param connInfo Information about the underlying connection.
   */ async #respond(requestEvent, connInfo) {
    let response;
    try {
      // Handle the request event, generating a response.
      response = await this.#handler(requestEvent.request, connInfo);
      if (response.bodyUsed && response.body !== null) {
        throw new TypeError("Response body already consumed.");
      }
    } catch (error) {
      // Invoke onError handler when request handler throws.
      response = await this.#onError(error);
    }
    try {
      // Send the response.
      await requestEvent.respondWith(response);
    } catch  {
    // `respondWith()` can throw for various reasons, including downstream and
    // upstream connection errors, as well as errors thrown during streaming
    // of the response content.  In order to avoid false negatives, we ignore
    // the error here and let `serveHttp` close the connection on the
    // following iteration if it is in fact a downstream connection error.
    }
  }
  /**
   * Serves all HTTP requests on a single connection.
   *
   * @param httpConn The HTTP connection to yield requests from.
   * @param connInfo Information about the underlying connection.
   */ async #serveHttp(httpConn, connInfo) {
    while(!this.#closed){
      let requestEvent;
      try {
        // Yield the new HTTP request on the connection.
        requestEvent = await httpConn.nextRequest();
      } catch  {
        break;
      }
      if (requestEvent === null) {
        break;
      }
      // Respond to the request. Note we do not await this async method to
      // allow the connection to handle multiple requests in the case of h2.
      this.#respond(requestEvent, connInfo);
    }
    this.#closeHttpConn(httpConn);
  }
  /**
   * Accepts all connections on a single network listener.
   *
   * @param listener The listener to accept connections from.
   */ async #accept(listener) {
    let acceptBackoffDelay;
    while(!this.#closed){
      let conn;
      try {
        // Wait for a new connection.
        conn = await listener.accept();
      } catch (error) {
        if (// The listener is closed.
        error instanceof Deno.errors.BadResource || // TLS handshake errors.
        error instanceof Deno.errors.InvalidData || error instanceof Deno.errors.UnexpectedEof || error instanceof Deno.errors.ConnectionReset || error instanceof Deno.errors.NotConnected) {
          // Backoff after transient errors to allow time for the system to
          // recover, and avoid blocking up the event loop with a continuously
          // running loop.
          if (!acceptBackoffDelay) {
            acceptBackoffDelay = INITIAL_ACCEPT_BACKOFF_DELAY;
          } else {
            acceptBackoffDelay *= 2;
          }
          if (acceptBackoffDelay >= MAX_ACCEPT_BACKOFF_DELAY) {
            acceptBackoffDelay = MAX_ACCEPT_BACKOFF_DELAY;
          }
          try {
            await delay(acceptBackoffDelay, {
              signal: this.#acceptBackoffDelayAbortController.signal
            });
          } catch (err) {
            // The backoff delay timer is aborted when closing the server.
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              throw err;
            }
          }
          continue;
        }
        throw error;
      }
      acceptBackoffDelay = undefined;
      // "Upgrade" the network connection into an HTTP connection.
      let httpConn;
      try {
        httpConn = Deno.serveHttp(conn);
      } catch  {
        continue;
      }
      // Closing the underlying listener will not close HTTP connections, so we
      // track for closure upon server close.
      this.#trackHttpConnection(httpConn);
      const connInfo = {
        localAddr: conn.localAddr,
        remoteAddr: conn.remoteAddr
      };
      // Serve the requests that arrive on the just-accepted connection. Note
      // we do not await this async method to allow the server to accept new
      // connections.
      this.#serveHttp(httpConn, connInfo);
    }
  }
  /**
   * Untracks and closes an HTTP connection.
   *
   * @param httpConn The HTTP connection to close.
   */ #closeHttpConn(httpConn) {
    this.#untrackHttpConnection(httpConn);
    try {
      httpConn.close();
    } catch  {
    // Connection has already been closed.
    }
  }
  /**
   * Adds the listener to the internal tracking list.
   *
   * @param listener Listener to track.
   */ #trackListener(listener) {
    this.#listeners.add(listener);
  }
  /**
   * Removes the listener from the internal tracking list.
   *
   * @param listener Listener to untrack.
   */ #untrackListener(listener) {
    this.#listeners.delete(listener);
  }
  /**
   * Adds the HTTP connection to the internal tracking list.
   *
   * @param httpConn HTTP connection to track.
   */ #trackHttpConnection(httpConn) {
    this.#httpConnections.add(httpConn);
  }
  /**
   * Removes the HTTP connection from the internal tracking list.
   *
   * @param httpConn HTTP connection to untrack.
   */ #untrackHttpConnection(httpConn) {
    this.#httpConnections.delete(httpConn);
  }
}
/**
 * Constructs a server, accepts incoming connections on the given listener, and
 * handles requests on these connections with the given handler.
 *
 * ```ts
 * import { serveListener } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const listener = Deno.listen({ port: 4505 });
 *
 * console.log("server listening on http://localhost:4505");
 *
 * await serveListener(listener, (request) => {
 *   const body = `Your user-agent is:\n\n${request.headers.get(
 *     "user-agent",
 *   ) ?? "Unknown"}`;
 *
 *   return new Response(body, { status: 200 });
 * });
 * ```
 *
 * @param listener The listener to accept connections from.
 * @param handler The handler for individual HTTP requests.
 * @param options Optional serve options.
 */ export async function serveListener(listener, handler, options) {
  const server = new Server({
    handler,
    onError: options?.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  return await server.serve(listener);
}
function hostnameForDisplay(hostname) {
  // If the hostname is "0.0.0.0", we display "localhost" in console
  // because browsers in Windows don't resolve "0.0.0.0".
  // See the discussion in https://github.com/denoland/deno_std/issues/1165
  return hostname === "0.0.0.0" ? "localhost" : hostname;
}
/**
 * @deprecated (will be removed after 1.0.0) Use `Deno.serve` instead.
 *
 * Serves HTTP requests with the given handler.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8000 on hostname "0.0.0.0".
 *
 * The below example serves with the port 8000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"));
 * ```
 *
 * You can change the listening address by the `hostname` and `port` options.
 * The below example serves with the port 3000.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { port: 3000 });
 * ```
 *
 * `serve` function prints the message `Listening on http://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), {
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at http://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * serve((_req) => new Response("Hello, world"), { onListen: undefined });
 * ```
 *
 * @param handler The handler for individual HTTP requests.
 * @param options The options. See `ServeInit` documentation for details.
 */ export async function serve(handler, options = {}) {
  let port = options.port ?? 8000;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  const listener = Deno.listen({
    port,
    hostname,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on http://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
/**
 * @deprecated (will be removed after 1.0.0) Use `Deno.serve` instead.
 *
 * Serves HTTPS requests with the given handler.
 *
 * You must specify `key` or `keyFile` and `cert` or `certFile` options.
 *
 * You can specify an object with a port and hostname option, which is the
 * address to listen on. The default is port 8443 on hostname "0.0.0.0".
 *
 * The below example serves with the default port 8443.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 *
 * const cert = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n";
 * const key = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";
 * serveTls((_req) => new Response("Hello, world"), { cert, key });
 *
 * // Or
 *
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), { certFile, keyFile });
 * ```
 *
 * `serveTls` function prints the message `Listening on https://<hostname>:<port>/`
 * on start-up by default. If you like to change this message, you can specify
 * `onListen` option to override it.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen({ port, hostname }) {
 *     console.log(`Server started at https://${hostname}:${port}`);
 *     // ... more info specific to your server ..
 *   },
 * });
 * ```
 *
 * You can also specify `undefined` or `null` to stop the logging behavior.
 *
 * ```ts
 * import { serveTls } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * const certFile = "/path/to/certFile.crt";
 * const keyFile = "/path/to/keyFile.key";
 * serveTls((_req) => new Response("Hello, world"), {
 *   certFile,
 *   keyFile,
 *   onListen: undefined,
 * });
 * ```
 *
 * @param handler The handler for individual HTTPS requests.
 * @param options The options. See `ServeTlsInit` documentation for details.
 * @returns
 */ export async function serveTls(handler, options) {
  if (!options.key && !options.keyFile) {
    throw new Error("TLS config is given, but 'key' is missing.");
  }
  if (!options.cert && !options.certFile) {
    throw new Error("TLS config is given, but 'cert' is missing.");
  }
  let port = options.port ?? 8443;
  if (typeof port !== "number") {
    port = Number(port);
  }
  const hostname = options.hostname ?? "0.0.0.0";
  const server = new Server({
    port,
    hostname,
    handler,
    onError: options.onError
  });
  options?.signal?.addEventListener("abort", ()=>server.close(), {
    once: true
  });
  const key = options.key || Deno.readTextFileSync(options.keyFile);
  const cert = options.cert || Deno.readTextFileSync(options.certFile);
  const listener = Deno.listenTls({
    port,
    hostname,
    cert,
    key,
    transport: "tcp"
  });
  const s = server.serve(listener);
  port = server.addrs[0].port;
  if ("onListen" in options) {
    options.onListen?.({
      port,
      hostname
    });
  } else {
    console.log(`Listening on https://${hostnameForDisplay(hostname)}:${port}/`);
  }
  return await s;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL2h0dHAvc2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjMgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCIuLi9hc3luYy9kZWxheS50c1wiO1xuXG4vKiogVGhyb3duIGJ5IFNlcnZlciBhZnRlciBpdCBoYXMgYmVlbiBjbG9zZWQuICovXG5jb25zdCBFUlJPUl9TRVJWRVJfQ0xPU0VEID0gXCJTZXJ2ZXIgY2xvc2VkXCI7XG5cbi8qKiBEZWZhdWx0IHBvcnQgZm9yIHNlcnZpbmcgSFRUUC4gKi9cbmNvbnN0IEhUVFBfUE9SVCA9IDgwO1xuXG4vKiogRGVmYXVsdCBwb3J0IGZvciBzZXJ2aW5nIEhUVFBTLiAqL1xuY29uc3QgSFRUUFNfUE9SVCA9IDQ0MztcblxuLyoqIEluaXRpYWwgYmFja29mZiBkZWxheSBvZiA1bXMgZm9sbG93aW5nIGEgdGVtcG9yYXJ5IGFjY2VwdCBmYWlsdXJlLiAqL1xuY29uc3QgSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWSA9IDU7XG5cbi8qKiBNYXggYmFja29mZiBkZWxheSBvZiAxcyBmb2xsb3dpbmcgYSB0ZW1wb3JhcnkgYWNjZXB0IGZhaWx1cmUuICovXG5jb25zdCBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkgPSAxMDAwO1xuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IHRoZSBjb25uZWN0aW9uIGEgcmVxdWVzdCBhcnJpdmVkIG9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENvbm5JbmZvIHtcbiAgLyoqIFRoZSBsb2NhbCBhZGRyZXNzIG9mIHRoZSBjb25uZWN0aW9uLiAqL1xuICByZWFkb25seSBsb2NhbEFkZHI6IERlbm8uQWRkcjtcbiAgLyoqIFRoZSByZW1vdGUgYWRkcmVzcyBvZiB0aGUgY29ubmVjdGlvbi4gKi9cbiAgcmVhZG9ubHkgcmVtb3RlQWRkcjogRGVuby5BZGRyO1xufVxuXG4vKipcbiAqIEEgaGFuZGxlciBmb3IgSFRUUCByZXF1ZXN0cy4gQ29uc3VtZXMgYSByZXF1ZXN0IGFuZCBjb25uZWN0aW9uIGluZm9ybWF0aW9uXG4gKiBhbmQgcmV0dXJucyBhIHJlc3BvbnNlLlxuICpcbiAqIElmIGEgaGFuZGxlciB0aHJvd3MsIHRoZSBzZXJ2ZXIgY2FsbGluZyB0aGUgaGFuZGxlciB3aWxsIGFzc3VtZSB0aGUgaW1wYWN0XG4gKiBvZiB0aGUgZXJyb3IgaXMgaXNvbGF0ZWQgdG8gdGhlIGluZGl2aWR1YWwgcmVxdWVzdC4gSXQgd2lsbCBjYXRjaCB0aGUgZXJyb3JcbiAqIGFuZCBjbG9zZSB0aGUgdW5kZXJseWluZyBjb25uZWN0aW9uLlxuICovXG5leHBvcnQgdHlwZSBIYW5kbGVyID0gKFxuICByZXF1ZXN0OiBSZXF1ZXN0LFxuICBjb25uSW5mbzogQ29ubkluZm8sXG4pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgcnVubmluZyBhbiBIVFRQIHNlcnZlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJJbml0IGV4dGVuZHMgUGFydGlhbDxEZW5vLkxpc3Rlbk9wdGlvbnM+IHtcbiAgLyoqIFRoZSBoYW5kbGVyIHRvIGludm9rZSBmb3IgaW5kaXZpZHVhbCBIVFRQIHJlcXVlc3RzLiAqL1xuICBoYW5kbGVyOiBIYW5kbGVyO1xuXG4gIC8qKlxuICAgKiBUaGUgaGFuZGxlciB0byBpbnZva2Ugd2hlbiByb3V0ZSBoYW5kbGVycyB0aHJvdyBhbiBlcnJvci5cbiAgICpcbiAgICogVGhlIGRlZmF1bHQgZXJyb3IgaGFuZGxlciBsb2dzIGFuZCByZXR1cm5zIHRoZSBlcnJvciBpbiBKU09OIGZvcm1hdC5cbiAgICovXG4gIG9uRXJyb3I/OiAoZXJyb3I6IHVua25vd24pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT47XG59XG5cbi8qKlxuICogVXNlZCB0byBjb25zdHJ1Y3QgYW4gSFRUUCBzZXJ2ZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXJ2ZXIge1xuICAjcG9ydD86IG51bWJlcjtcbiAgI2hvc3Q/OiBzdHJpbmc7XG4gICNoYW5kbGVyOiBIYW5kbGVyO1xuICAjY2xvc2VkID0gZmFsc2U7XG4gICNsaXN0ZW5lcnM6IFNldDxEZW5vLkxpc3RlbmVyPiA9IG5ldyBTZXQoKTtcbiAgI2FjY2VwdEJhY2tvZmZEZWxheUFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgI2h0dHBDb25uZWN0aW9uczogU2V0PERlbm8uSHR0cENvbm4+ID0gbmV3IFNldCgpO1xuICAjb25FcnJvcjogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xuXG4gIC8qKlxuICAgKiBDb25zdHJ1Y3RzIGEgbmV3IEhUVFAgU2VydmVyIGluc3RhbmNlLlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICAgKlxuICAgKiBjb25zdCBwb3J0ID0gNDUwNTtcbiAgICogY29uc3QgaGFuZGxlciA9IChyZXF1ZXN0OiBSZXF1ZXN0KSA9PiB7XG4gICAqICAgY29uc3QgYm9keSA9IGBZb3VyIHVzZXItYWdlbnQgaXM6XFxuXFxuJHtyZXF1ZXN0LmhlYWRlcnMuZ2V0KFxuICAgKiAgICBcInVzZXItYWdlbnRcIixcbiAgICogICApID8/IFwiVW5rbm93blwifWA7XG4gICAqXG4gICAqICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwIH0pO1xuICAgKiB9O1xuICAgKlxuICAgKiBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgcG9ydCwgaGFuZGxlciB9KTtcbiAgICogYGBgXG4gICAqXG4gICAqIEBwYXJhbSBzZXJ2ZXJJbml0IE9wdGlvbnMgZm9yIHJ1bm5pbmcgYW4gSFRUUCBzZXJ2ZXIuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihzZXJ2ZXJJbml0OiBTZXJ2ZXJJbml0KSB7XG4gICAgdGhpcy4jcG9ydCA9IHNlcnZlckluaXQucG9ydDtcbiAgICB0aGlzLiNob3N0ID0gc2VydmVySW5pdC5ob3N0bmFtZTtcbiAgICB0aGlzLiNoYW5kbGVyID0gc2VydmVySW5pdC5oYW5kbGVyO1xuICAgIHRoaXMuI29uRXJyb3IgPSBzZXJ2ZXJJbml0Lm9uRXJyb3IgPz9cbiAgICAgIGZ1bmN0aW9uIChlcnJvcjogdW5rbm93bikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShcIkludGVybmFsIFNlcnZlciBFcnJvclwiLCB7IHN0YXR1czogNTAwIH0pO1xuICAgICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBY2NlcHQgaW5jb21pbmcgY29ubmVjdGlvbnMgb24gdGhlIGdpdmVuIGxpc3RlbmVyLCBhbmQgaGFuZGxlIHJlcXVlc3RzIG9uXG4gICAqIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gICAqXG4gICAqIEhUVFAvMiBzdXBwb3J0IGlzIG9ubHkgZW5hYmxlZCBpZiB0aGUgcHJvdmlkZWQgRGVuby5MaXN0ZW5lciByZXR1cm5zIFRMU1xuICAgKiBjb25uZWN0aW9ucyBhbmQgd2FzIGNvbmZpZ3VyZWQgd2l0aCBcImgyXCIgaW4gdGhlIEFMUE4gcHJvdG9jb2xzLlxuICAgKlxuICAgKiBUaHJvd3MgYSBzZXJ2ZXIgY2xvc2VkIGVycm9yIGlmIGNhbGxlZCBhZnRlciB0aGUgc2VydmVyIGhhcyBiZWVuIGNsb3NlZC5cbiAgICpcbiAgICogV2lsbCBhbHdheXMgY2xvc2UgdGhlIGNyZWF0ZWQgbGlzdGVuZXIuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IGhhbmRsZXIgPSAocmVxdWVzdDogUmVxdWVzdCkgPT4ge1xuICAgKiAgIGNvbnN0IGJvZHkgPSBgWW91ciB1c2VyLWFnZW50IGlzOlxcblxcbiR7cmVxdWVzdC5oZWFkZXJzLmdldChcbiAgICogICAgXCJ1c2VyLWFnZW50XCIsXG4gICAqICAgKSA/PyBcIlVua25vd25cIn1gO1xuICAgKlxuICAgKiAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IDIwMCB9KTtcbiAgICogfTtcbiAgICpcbiAgICogY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IGhhbmRsZXIgfSk7XG4gICAqIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW4oeyBwb3J0OiA0NTA1IH0pO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIuc2VydmUobGlzdGVuZXIpO1xuICAgKiBgYGBcbiAgICpcbiAgICogQHBhcmFtIGxpc3RlbmVyIFRoZSBsaXN0ZW5lciB0byBhY2NlcHQgY29ubmVjdGlvbnMgZnJvbS5cbiAgICovXG4gIGFzeW5jIHNlcnZlKGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKSB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgdGhpcy4jdHJhY2tMaXN0ZW5lcihsaXN0ZW5lcik7XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuI2FjY2VwdChsaXN0ZW5lcik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuI3VudHJhY2tMaXN0ZW5lcihsaXN0ZW5lcik7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGxpc3RlbmVyLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTGlzdGVuZXIgaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIGxpc3RlbmVyIG9uIHRoZSBzZXJ2ZXIsIGFjY2VwdCBpbmNvbWluZyBjb25uZWN0aW9ucywgYW5kIGhhbmRsZVxuICAgKiByZXF1ZXN0cyBvbiB0aGVzZSBjb25uZWN0aW9ucyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICAgKlxuICAgKiBJZiB0aGUgc2VydmVyIHdhcyBjb25zdHJ1Y3RlZCB3aXRob3V0IGEgc3BlY2lmaWVkIHBvcnQsIDgwIGlzIHVzZWQuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGggdGhlIGhvc3RuYW1lIG9taXR0ZWQgZnJvbSB0aGUgb3B0aW9ucywgdGhlXG4gICAqIG5vbi1yb3V0YWJsZSBtZXRhLWFkZHJlc3MgYDAuMC4wLjBgIGlzIHVzZWQuXG4gICAqXG4gICAqIFRocm93cyBhIHNlcnZlciBjbG9zZWQgZXJyb3IgaWYgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IHBvcnQgPSA0NTA1O1xuICAgKiBjb25zdCBoYW5kbGVyID0gKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgICogICBjb25zdCBib2R5ID0gYFlvdXIgdXNlci1hZ2VudCBpczpcXG5cXG4ke3JlcXVlc3QuaGVhZGVycy5nZXQoXG4gICAqICAgIFwidXNlci1hZ2VudFwiLFxuICAgKiAgICkgPz8gXCJVbmtub3duXCJ9YDtcbiAgICpcbiAgICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gICAqIH07XG4gICAqXG4gICAqIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBwb3J0LCBoYW5kbGVyIH0pO1xuICAgKlxuICAgKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIubGlzdGVuQW5kU2VydmUoKTtcbiAgICogYGBgXG4gICAqL1xuICBhc3luYyBsaXN0ZW5BbmRTZXJ2ZSgpIHtcbiAgICBpZiAodGhpcy4jY2xvc2VkKSB7XG4gICAgICB0aHJvdyBuZXcgRGVuby5lcnJvcnMuSHR0cChFUlJPUl9TRVJWRVJfQ0xPU0VEKTtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKHtcbiAgICAgIHBvcnQ6IHRoaXMuI3BvcnQgPz8gSFRUUF9QT1JULFxuICAgICAgaG9zdG5hbWU6IHRoaXMuI2hvc3QgPz8gXCIwLjAuMC4wXCIsXG4gICAgICB0cmFuc3BvcnQ6IFwidGNwXCIsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXJ2ZShsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbGlzdGVuZXIgb24gdGhlIHNlcnZlciwgYWNjZXB0IGluY29taW5nIGNvbm5lY3Rpb25zLCB1cGdyYWRlIHRoZW1cbiAgICogdG8gVExTLCBhbmQgaGFuZGxlIHJlcXVlc3RzIG9uIHRoZXNlIGNvbm5lY3Rpb25zIHdpdGggdGhlIGdpdmVuIGhhbmRsZXIuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGhvdXQgYSBzcGVjaWZpZWQgcG9ydCwgNDQzIGlzIHVzZWQuXG4gICAqXG4gICAqIElmIHRoZSBzZXJ2ZXIgd2FzIGNvbnN0cnVjdGVkIHdpdGggdGhlIGhvc3RuYW1lIG9taXR0ZWQgZnJvbSB0aGUgb3B0aW9ucywgdGhlXG4gICAqIG5vbi1yb3V0YWJsZSBtZXRhLWFkZHJlc3MgYDAuMC4wLjBgIGlzIHVzZWQuXG4gICAqXG4gICAqIFRocm93cyBhIHNlcnZlciBjbG9zZWQgZXJyb3IgaWYgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGltcG9ydCB7IFNlcnZlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IHBvcnQgPSA0NTA1O1xuICAgKiBjb25zdCBoYW5kbGVyID0gKHJlcXVlc3Q6IFJlcXVlc3QpID0+IHtcbiAgICogICBjb25zdCBib2R5ID0gYFlvdXIgdXNlci1hZ2VudCBpczpcXG5cXG4ke3JlcXVlc3QuaGVhZGVycy5nZXQoXG4gICAqICAgIFwidXNlci1hZ2VudFwiLFxuICAgKiAgICkgPz8gXCJVbmtub3duXCJ9YDtcbiAgICpcbiAgICogICByZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAgfSk7XG4gICAqIH07XG4gICAqXG4gICAqIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBwb3J0LCBoYW5kbGVyIH0pO1xuICAgKlxuICAgKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gICAqIGNvbnN0IGtleUZpbGUgPSBcIi9wYXRoL3RvL2tleUZpbGUua2V5XCI7XG4gICAqXG4gICAqIGNvbnNvbGUubG9nKFwic2VydmVyIGxpc3RlbmluZyBvbiBodHRwczovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICAgKlxuICAgKiBhd2FpdCBzZXJ2ZXIubGlzdGVuQW5kU2VydmVUbHMoY2VydEZpbGUsIGtleUZpbGUpO1xuICAgKiBgYGBcbiAgICpcbiAgICogQHBhcmFtIGNlcnRGaWxlIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBjZXJ0aWZpY2F0ZS5cbiAgICogQHBhcmFtIGtleUZpbGUgVGhlIHBhdGggdG8gdGhlIGZpbGUgY29udGFpbmluZyB0aGUgVExTIHByaXZhdGUga2V5LlxuICAgKi9cbiAgYXN5bmMgbGlzdGVuQW5kU2VydmVUbHMoY2VydEZpbGU6IHN0cmluZywga2V5RmlsZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgdGhyb3cgbmV3IERlbm8uZXJyb3JzLkh0dHAoRVJST1JfU0VSVkVSX0NMT1NFRCk7XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdGVuZXIgPSBEZW5vLmxpc3RlblRscyh7XG4gICAgICBwb3J0OiB0aGlzLiNwb3J0ID8/IEhUVFBTX1BPUlQsXG4gICAgICBob3N0bmFtZTogdGhpcy4jaG9zdCA/PyBcIjAuMC4wLjBcIixcbiAgICAgIGNlcnRGaWxlLFxuICAgICAga2V5RmlsZSxcbiAgICAgIHRyYW5zcG9ydDogXCJ0Y3BcIixcbiAgICAgIC8vIEFMUE4gcHJvdG9jb2wgc3VwcG9ydCBub3QgeWV0IHN0YWJsZS5cbiAgICAgIC8vIGFscG5Qcm90b2NvbHM6IFtcImgyXCIsIFwiaHR0cC8xLjFcIl0sXG4gICAgfSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXJ2ZShsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogSW1tZWRpYXRlbHkgY2xvc2UgdGhlIHNlcnZlciBsaXN0ZW5lcnMgYW5kIGFzc29jaWF0ZWQgSFRUUCBjb25uZWN0aW9ucy5cbiAgICpcbiAgICogVGhyb3dzIGEgc2VydmVyIGNsb3NlZCBlcnJvciBpZiBjYWxsZWQgYWZ0ZXIgdGhlIHNlcnZlciBoYXMgYmVlbiBjbG9zZWQuXG4gICAqL1xuICBjbG9zZSgpIHtcbiAgICBpZiAodGhpcy4jY2xvc2VkKSB7XG4gICAgICB0aHJvdyBuZXcgRGVuby5lcnJvcnMuSHR0cChFUlJPUl9TRVJWRVJfQ0xPU0VEKTtcbiAgICB9XG5cbiAgICB0aGlzLiNjbG9zZWQgPSB0cnVlO1xuXG4gICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLiNsaXN0ZW5lcnMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxpc3RlbmVyLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gTGlzdGVuZXIgaGFzIGFscmVhZHkgYmVlbiBjbG9zZWQuXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy4jbGlzdGVuZXJzLmNsZWFyKCk7XG5cbiAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXlBYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblxuICAgIGZvciAoY29uc3QgaHR0cENvbm4gb2YgdGhpcy4jaHR0cENvbm5lY3Rpb25zKSB7XG4gICAgICB0aGlzLiNjbG9zZUh0dHBDb25uKGh0dHBDb25uKTtcbiAgICB9XG5cbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuY2xlYXIoKTtcbiAgfVxuXG4gIC8qKiBHZXQgd2hldGhlciB0aGUgc2VydmVyIGlzIGNsb3NlZC4gKi9cbiAgZ2V0IGNsb3NlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy4jY2xvc2VkO1xuICB9XG5cbiAgLyoqIEdldCB0aGUgbGlzdCBvZiBuZXR3b3JrIGFkZHJlc3NlcyB0aGUgc2VydmVyIGlzIGxpc3RlbmluZyBvbi4gKi9cbiAgZ2V0IGFkZHJzKCk6IERlbm8uQWRkcltdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLiNsaXN0ZW5lcnMpLm1hcCgobGlzdGVuZXIpID0+IGxpc3RlbmVyLmFkZHIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc3BvbmRzIHRvIGFuIEhUVFAgcmVxdWVzdC5cbiAgICpcbiAgICogQHBhcmFtIHJlcXVlc3RFdmVudCBUaGUgSFRUUCByZXF1ZXN0IHRvIHJlc3BvbmQgdG8uXG4gICAqIEBwYXJhbSBjb25uSW5mbyBJbmZvcm1hdGlvbiBhYm91dCB0aGUgdW5kZXJseWluZyBjb25uZWN0aW9uLlxuICAgKi9cbiAgYXN5bmMgI3Jlc3BvbmQoXG4gICAgcmVxdWVzdEV2ZW50OiBEZW5vLlJlcXVlc3RFdmVudCxcbiAgICBjb25uSW5mbzogQ29ubkluZm8sXG4gICkge1xuICAgIGxldCByZXNwb25zZTogUmVzcG9uc2U7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEhhbmRsZSB0aGUgcmVxdWVzdCBldmVudCwgZ2VuZXJhdGluZyBhIHJlc3BvbnNlLlxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLiNoYW5kbGVyKHJlcXVlc3RFdmVudC5yZXF1ZXN0LCBjb25uSW5mbyk7XG5cbiAgICAgIGlmIChyZXNwb25zZS5ib2R5VXNlZCAmJiByZXNwb25zZS5ib2R5ICE9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJSZXNwb25zZSBib2R5IGFscmVhZHkgY29uc3VtZWQuXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiB1bmtub3duKSB7XG4gICAgICAvLyBJbnZva2Ugb25FcnJvciBoYW5kbGVyIHdoZW4gcmVxdWVzdCBoYW5kbGVyIHRocm93cy5cbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgdGhpcy4jb25FcnJvcihlcnJvcik7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNlbmQgdGhlIHJlc3BvbnNlLlxuICAgICAgYXdhaXQgcmVxdWVzdEV2ZW50LnJlc3BvbmRXaXRoKHJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGByZXNwb25kV2l0aCgpYCBjYW4gdGhyb3cgZm9yIHZhcmlvdXMgcmVhc29ucywgaW5jbHVkaW5nIGRvd25zdHJlYW0gYW5kXG4gICAgICAvLyB1cHN0cmVhbSBjb25uZWN0aW9uIGVycm9ycywgYXMgd2VsbCBhcyBlcnJvcnMgdGhyb3duIGR1cmluZyBzdHJlYW1pbmdcbiAgICAgIC8vIG9mIHRoZSByZXNwb25zZSBjb250ZW50LiAgSW4gb3JkZXIgdG8gYXZvaWQgZmFsc2UgbmVnYXRpdmVzLCB3ZSBpZ25vcmVcbiAgICAgIC8vIHRoZSBlcnJvciBoZXJlIGFuZCBsZXQgYHNlcnZlSHR0cGAgY2xvc2UgdGhlIGNvbm5lY3Rpb24gb24gdGhlXG4gICAgICAvLyBmb2xsb3dpbmcgaXRlcmF0aW9uIGlmIGl0IGlzIGluIGZhY3QgYSBkb3duc3RyZWFtIGNvbm5lY3Rpb24gZXJyb3IuXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlcnZlcyBhbGwgSFRUUCByZXF1ZXN0cyBvbiBhIHNpbmdsZSBjb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0gaHR0cENvbm4gVGhlIEhUVFAgY29ubmVjdGlvbiB0byB5aWVsZCByZXF1ZXN0cyBmcm9tLlxuICAgKiBAcGFyYW0gY29ubkluZm8gSW5mb3JtYXRpb24gYWJvdXQgdGhlIHVuZGVybHlpbmcgY29ubmVjdGlvbi5cbiAgICovXG4gIGFzeW5jICNzZXJ2ZUh0dHAoaHR0cENvbm46IERlbm8uSHR0cENvbm4sIGNvbm5JbmZvOiBDb25uSW5mbykge1xuICAgIHdoaWxlICghdGhpcy4jY2xvc2VkKSB7XG4gICAgICBsZXQgcmVxdWVzdEV2ZW50OiBEZW5vLlJlcXVlc3RFdmVudCB8IG51bGw7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFlpZWxkIHRoZSBuZXcgSFRUUCByZXF1ZXN0IG9uIHRoZSBjb25uZWN0aW9uLlxuICAgICAgICByZXF1ZXN0RXZlbnQgPSBhd2FpdCBodHRwQ29ubi5uZXh0UmVxdWVzdCgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIENvbm5lY3Rpb24gaGFzIGJlZW4gY2xvc2VkLlxuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcXVlc3RFdmVudCA9PT0gbnVsbCkge1xuICAgICAgICAvLyBDb25uZWN0aW9uIGhhcyBiZWVuIGNsb3NlZC5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlc3BvbmQgdG8gdGhlIHJlcXVlc3QuIE5vdGUgd2UgZG8gbm90IGF3YWl0IHRoaXMgYXN5bmMgbWV0aG9kIHRvXG4gICAgICAvLyBhbGxvdyB0aGUgY29ubmVjdGlvbiB0byBoYW5kbGUgbXVsdGlwbGUgcmVxdWVzdHMgaW4gdGhlIGNhc2Ugb2YgaDIuXG4gICAgICB0aGlzLiNyZXNwb25kKHJlcXVlc3RFdmVudCwgY29ubkluZm8pO1xuICAgIH1cblxuICAgIHRoaXMuI2Nsb3NlSHR0cENvbm4oaHR0cENvbm4pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFjY2VwdHMgYWxsIGNvbm5lY3Rpb25zIG9uIGEgc2luZ2xlIG5ldHdvcmsgbGlzdGVuZXIuXG4gICAqXG4gICAqIEBwYXJhbSBsaXN0ZW5lciBUaGUgbGlzdGVuZXIgdG8gYWNjZXB0IGNvbm5lY3Rpb25zIGZyb20uXG4gICAqL1xuICBhc3luYyAjYWNjZXB0KGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKSB7XG4gICAgbGV0IGFjY2VwdEJhY2tvZmZEZWxheTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG4gICAgd2hpbGUgKCF0aGlzLiNjbG9zZWQpIHtcbiAgICAgIGxldCBjb25uOiBEZW5vLkNvbm47XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFdhaXQgZm9yIGEgbmV3IGNvbm5lY3Rpb24uXG4gICAgICAgIGNvbm4gPSBhd2FpdCBsaXN0ZW5lci5hY2NlcHQoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAvLyBUaGUgbGlzdGVuZXIgaXMgY2xvc2VkLlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQmFkUmVzb3VyY2UgfHxcbiAgICAgICAgICAvLyBUTFMgaGFuZHNoYWtlIGVycm9ycy5cbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLkludmFsaWREYXRhIHx8XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5VbmV4cGVjdGVkRW9mIHx8XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Db25uZWN0aW9uUmVzZXQgfHxcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdENvbm5lY3RlZFxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBCYWNrb2ZmIGFmdGVyIHRyYW5zaWVudCBlcnJvcnMgdG8gYWxsb3cgdGltZSBmb3IgdGhlIHN5c3RlbSB0b1xuICAgICAgICAgIC8vIHJlY292ZXIsIGFuZCBhdm9pZCBibG9ja2luZyB1cCB0aGUgZXZlbnQgbG9vcCB3aXRoIGEgY29udGludW91c2x5XG4gICAgICAgICAgLy8gcnVubmluZyBsb29wLlxuICAgICAgICAgIGlmICghYWNjZXB0QmFja29mZkRlbGF5KSB7XG4gICAgICAgICAgICBhY2NlcHRCYWNrb2ZmRGVsYXkgPSBJTklUSUFMX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhY2NlcHRCYWNrb2ZmRGVsYXkgKj0gMjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYWNjZXB0QmFja29mZkRlbGF5ID49IE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWSkge1xuICAgICAgICAgICAgYWNjZXB0QmFja29mZkRlbGF5ID0gTUFYX0FDQ0VQVF9CQUNLT0ZGX0RFTEFZO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBkZWxheShhY2NlcHRCYWNrb2ZmRGVsYXksIHtcbiAgICAgICAgICAgICAgc2lnbmFsOiB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXlBYm9ydENvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG4gICAgICAgICAgICAvLyBUaGUgYmFja29mZiBkZWxheSB0aW1lciBpcyBhYm9ydGVkIHdoZW4gY2xvc2luZyB0aGUgc2VydmVyLlxuICAgICAgICAgICAgaWYgKCEoZXJyIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVyci5uYW1lID09PSBcIkFib3J0RXJyb3JcIikpIHtcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG5cbiAgICAgIGFjY2VwdEJhY2tvZmZEZWxheSA9IHVuZGVmaW5lZDtcblxuICAgICAgLy8gXCJVcGdyYWRlXCIgdGhlIG5ldHdvcmsgY29ubmVjdGlvbiBpbnRvIGFuIEhUVFAgY29ubmVjdGlvbi5cbiAgICAgIGxldCBodHRwQ29ubjogRGVuby5IdHRwQ29ubjtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgaHR0cENvbm4gPSBEZW5vLnNlcnZlSHR0cChjb25uKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBDb25uZWN0aW9uIGhhcyBiZWVuIGNsb3NlZC5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIENsb3NpbmcgdGhlIHVuZGVybHlpbmcgbGlzdGVuZXIgd2lsbCBub3QgY2xvc2UgSFRUUCBjb25uZWN0aW9ucywgc28gd2VcbiAgICAgIC8vIHRyYWNrIGZvciBjbG9zdXJlIHVwb24gc2VydmVyIGNsb3NlLlxuICAgICAgdGhpcy4jdHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubik7XG5cbiAgICAgIGNvbnN0IGNvbm5JbmZvOiBDb25uSW5mbyA9IHtcbiAgICAgICAgbG9jYWxBZGRyOiBjb25uLmxvY2FsQWRkcixcbiAgICAgICAgcmVtb3RlQWRkcjogY29ubi5yZW1vdGVBZGRyLFxuICAgICAgfTtcblxuICAgICAgLy8gU2VydmUgdGhlIHJlcXVlc3RzIHRoYXQgYXJyaXZlIG9uIHRoZSBqdXN0LWFjY2VwdGVkIGNvbm5lY3Rpb24uIE5vdGVcbiAgICAgIC8vIHdlIGRvIG5vdCBhd2FpdCB0aGlzIGFzeW5jIG1ldGhvZCB0byBhbGxvdyB0aGUgc2VydmVyIHRvIGFjY2VwdCBuZXdcbiAgICAgIC8vIGNvbm5lY3Rpb25zLlxuICAgICAgdGhpcy4jc2VydmVIdHRwKGh0dHBDb25uLCBjb25uSW5mbyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVudHJhY2tzIGFuZCBjbG9zZXMgYW4gSFRUUCBjb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0gaHR0cENvbm4gVGhlIEhUVFAgY29ubmVjdGlvbiB0byBjbG9zZS5cbiAgICovXG4gICNjbG9zZUh0dHBDb25uKGh0dHBDb25uOiBEZW5vLkh0dHBDb25uKSB7XG4gICAgdGhpcy4jdW50cmFja0h0dHBDb25uZWN0aW9uKGh0dHBDb25uKTtcblxuICAgIHRyeSB7XG4gICAgICBodHRwQ29ubi5jbG9zZSgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gQ29ubmVjdGlvbiBoYXMgYWxyZWFkeSBiZWVuIGNsb3NlZC5cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWRkcyB0aGUgbGlzdGVuZXIgdG8gdGhlIGludGVybmFsIHRyYWNraW5nIGxpc3QuXG4gICAqXG4gICAqIEBwYXJhbSBsaXN0ZW5lciBMaXN0ZW5lciB0byB0cmFjay5cbiAgICovXG4gICN0cmFja0xpc3RlbmVyKGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKSB7XG4gICAgdGhpcy4jbGlzdGVuZXJzLmFkZChsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgbGlzdGVuZXIgZnJvbSB0aGUgaW50ZXJuYWwgdHJhY2tpbmcgbGlzdC5cbiAgICpcbiAgICogQHBhcmFtIGxpc3RlbmVyIExpc3RlbmVyIHRvIHVudHJhY2suXG4gICAqL1xuICAjdW50cmFja0xpc3RlbmVyKGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyKSB7XG4gICAgdGhpcy4jbGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyB0aGUgSFRUUCBjb25uZWN0aW9uIHRvIHRoZSBpbnRlcm5hbCB0cmFja2luZyBsaXN0LlxuICAgKlxuICAgKiBAcGFyYW0gaHR0cENvbm4gSFRUUCBjb25uZWN0aW9uIHRvIHRyYWNrLlxuICAgKi9cbiAgI3RyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm46IERlbm8uSHR0cENvbm4pIHtcbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuYWRkKGh0dHBDb25uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHRoZSBIVFRQIGNvbm5lY3Rpb24gZnJvbSB0aGUgaW50ZXJuYWwgdHJhY2tpbmcgbGlzdC5cbiAgICpcbiAgICogQHBhcmFtIGh0dHBDb25uIEhUVFAgY29ubmVjdGlvbiB0byB1bnRyYWNrLlxuICAgKi9cbiAgI3VudHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubjogRGVuby5IdHRwQ29ubikge1xuICAgIHRoaXMuI2h0dHBDb25uZWN0aW9ucy5kZWxldGUoaHR0cENvbm4pO1xuICB9XG59XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBhZnRlciAxLjAuMCkgVXNlIGBEZW5vLlNlcnZlSW5pdGAgaW5zdGVhZC5cbiAqXG4gKiBBZGRpdGlvbmFsIHNlcnZlIG9wdGlvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVJbml0IGV4dGVuZHMgUGFydGlhbDxEZW5vLkxpc3Rlbk9wdGlvbnM+IHtcbiAgLyoqIEFuIEFib3J0U2lnbmFsIHRvIGNsb3NlIHRoZSBzZXJ2ZXIgYW5kIGFsbCBjb25uZWN0aW9ucy4gKi9cbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG5cbiAgLyoqIFRoZSBoYW5kbGVyIHRvIGludm9rZSB3aGVuIHJvdXRlIGhhbmRsZXJzIHRocm93IGFuIGVycm9yLiAqL1xuICBvbkVycm9yPzogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xuXG4gIC8qKiBUaGUgY2FsbGJhY2sgd2hpY2ggaXMgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBzdGFydGVkIGxpc3RlbmluZyAqL1xuICBvbkxpc3Rlbj86IChwYXJhbXM6IHsgaG9zdG5hbWU6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0pID0+IHZvaWQ7XG59XG5cbi8qKlxuICogQWRkaXRpb25hbCBzZXJ2ZSBsaXN0ZW5lciBvcHRpb25zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlTGlzdGVuZXJPcHRpb25zIHtcbiAgLyoqIEFuIEFib3J0U2lnbmFsIHRvIGNsb3NlIHRoZSBzZXJ2ZXIgYW5kIGFsbCBjb25uZWN0aW9ucy4gKi9cbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG5cbiAgLyoqIFRoZSBoYW5kbGVyIHRvIGludm9rZSB3aGVuIHJvdXRlIGhhbmRsZXJzIHRocm93IGFuIGVycm9yLiAqL1xuICBvbkVycm9yPzogKGVycm9yOiB1bmtub3duKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+O1xuXG4gIC8qKiBUaGUgY2FsbGJhY2sgd2hpY2ggaXMgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBzdGFydGVkIGxpc3RlbmluZyAqL1xuICBvbkxpc3Rlbj86IChwYXJhbXM6IHsgaG9zdG5hbWU6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0pID0+IHZvaWQ7XG59XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHNlcnZlciwgYWNjZXB0cyBpbmNvbWluZyBjb25uZWN0aW9ucyBvbiB0aGUgZ2l2ZW4gbGlzdGVuZXIsIGFuZFxuICogaGFuZGxlcyByZXF1ZXN0cyBvbiB0aGVzZSBjb25uZWN0aW9ucyB3aXRoIHRoZSBnaXZlbiBoYW5kbGVyLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZUxpc3RlbmVyIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqXG4gKiBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKHsgcG9ydDogNDUwNSB9KTtcbiAqXG4gKiBjb25zb2xlLmxvZyhcInNlcnZlciBsaXN0ZW5pbmcgb24gaHR0cDovL2xvY2FsaG9zdDo0NTA1XCIpO1xuICpcbiAqIGF3YWl0IHNlcnZlTGlzdGVuZXIobGlzdGVuZXIsIChyZXF1ZXN0KSA9PiB7XG4gKiAgIGNvbnN0IGJvZHkgPSBgWW91ciB1c2VyLWFnZW50IGlzOlxcblxcbiR7cmVxdWVzdC5oZWFkZXJzLmdldChcbiAqICAgICBcInVzZXItYWdlbnRcIixcbiAqICAgKSA/PyBcIlVua25vd25cIn1gO1xuICpcbiAqICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwIH0pO1xuICogfSk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gbGlzdGVuZXIgVGhlIGxpc3RlbmVyIHRvIGFjY2VwdCBjb25uZWN0aW9ucyBmcm9tLlxuICogQHBhcmFtIGhhbmRsZXIgVGhlIGhhbmRsZXIgZm9yIGluZGl2aWR1YWwgSFRUUCByZXF1ZXN0cy5cbiAqIEBwYXJhbSBvcHRpb25zIE9wdGlvbmFsIHNlcnZlIG9wdGlvbnMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZUxpc3RlbmVyKFxuICBsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcixcbiAgaGFuZGxlcjogSGFuZGxlcixcbiAgb3B0aW9ucz86IFNlcnZlTGlzdGVuZXJPcHRpb25zLFxuKSB7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoeyBoYW5kbGVyLCBvbkVycm9yOiBvcHRpb25zPy5vbkVycm9yIH0pO1xuXG4gIG9wdGlvbnM/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IHNlcnZlci5jbG9zZSgpLCB7XG4gICAgb25jZTogdHJ1ZSxcbiAgfSk7XG5cbiAgcmV0dXJuIGF3YWl0IHNlcnZlci5zZXJ2ZShsaXN0ZW5lcik7XG59XG5cbmZ1bmN0aW9uIGhvc3RuYW1lRm9yRGlzcGxheShob3N0bmFtZTogc3RyaW5nKSB7XG4gIC8vIElmIHRoZSBob3N0bmFtZSBpcyBcIjAuMC4wLjBcIiwgd2UgZGlzcGxheSBcImxvY2FsaG9zdFwiIGluIGNvbnNvbGVcbiAgLy8gYmVjYXVzZSBicm93c2VycyBpbiBXaW5kb3dzIGRvbid0IHJlc29sdmUgXCIwLjAuMC4wXCIuXG4gIC8vIFNlZSB0aGUgZGlzY3Vzc2lvbiBpbiBodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvZGVub19zdGQvaXNzdWVzLzExNjVcbiAgcmV0dXJuIGhvc3RuYW1lID09PSBcIjAuMC4wLjBcIiA/IFwibG9jYWxob3N0XCIgOiBob3N0bmFtZTtcbn1cblxuLyoqXG4gKiBAZGVwcmVjYXRlZCAod2lsbCBiZSByZW1vdmVkIGFmdGVyIDEuMC4wKSBVc2UgYERlbm8uc2VydmVgIGluc3RlYWQuXG4gKlxuICogU2VydmVzIEhUVFAgcmVxdWVzdHMgd2l0aCB0aGUgZ2l2ZW4gaGFuZGxlci5cbiAqXG4gKiBZb3UgY2FuIHNwZWNpZnkgYW4gb2JqZWN0IHdpdGggYSBwb3J0IGFuZCBob3N0bmFtZSBvcHRpb24sIHdoaWNoIGlzIHRoZVxuICogYWRkcmVzcyB0byBsaXN0ZW4gb24uIFRoZSBkZWZhdWx0IGlzIHBvcnQgODAwMCBvbiBob3N0bmFtZSBcIjAuMC4wLjBcIi5cbiAqXG4gKiBUaGUgYmVsb3cgZXhhbXBsZSBzZXJ2ZXMgd2l0aCB0aGUgcG9ydCA4MDAwLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpKTtcbiAqIGBgYFxuICpcbiAqIFlvdSBjYW4gY2hhbmdlIHRoZSBsaXN0ZW5pbmcgYWRkcmVzcyBieSB0aGUgYGhvc3RuYW1lYCBhbmQgYHBvcnRgIG9wdGlvbnMuXG4gKiBUaGUgYmVsb3cgZXhhbXBsZSBzZXJ2ZXMgd2l0aCB0aGUgcG9ydCAzMDAwLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7IHBvcnQ6IDMwMDAgfSk7XG4gKiBgYGBcbiAqXG4gKiBgc2VydmVgIGZ1bmN0aW9uIHByaW50cyB0aGUgbWVzc2FnZSBgTGlzdGVuaW5nIG9uIGh0dHA6Ly88aG9zdG5hbWU+Ojxwb3J0Pi9gXG4gKiBvbiBzdGFydC11cCBieSBkZWZhdWx0LiBJZiB5b3UgbGlrZSB0byBjaGFuZ2UgdGhpcyBtZXNzYWdlLCB5b3UgY2FuIHNwZWNpZnlcbiAqIGBvbkxpc3RlbmAgb3B0aW9uIHRvIG92ZXJyaWRlIGl0LlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBzZXJ2ZSgoX3JlcSkgPT4gbmV3IFJlc3BvbnNlKFwiSGVsbG8sIHdvcmxkXCIpLCB7XG4gKiAgIG9uTGlzdGVuKHsgcG9ydCwgaG9zdG5hbWUgfSkge1xuICogICAgIGNvbnNvbGUubG9nKGBTZXJ2ZXIgc3RhcnRlZCBhdCBodHRwOi8vJHtob3N0bmFtZX06JHtwb3J0fWApO1xuICogICAgIC8vIC4uLiBtb3JlIGluZm8gc3BlY2lmaWMgdG8geW91ciBzZXJ2ZXIgLi5cbiAqICAgfSxcbiAqIH0pO1xuICogYGBgXG4gKlxuICogWW91IGNhbiBhbHNvIHNwZWNpZnkgYHVuZGVmaW5lZGAgb3IgYG51bGxgIHRvIHN0b3AgdGhlIGxvZ2dpbmcgYmVoYXZpb3IuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqIHNlcnZlKChfcmVxKSA9PiBuZXcgUmVzcG9uc2UoXCJIZWxsbywgd29ybGRcIiksIHsgb25MaXN0ZW46IHVuZGVmaW5lZCB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBoYW5kbGVyIFRoZSBoYW5kbGVyIGZvciBpbmRpdmlkdWFsIEhUVFAgcmVxdWVzdHMuXG4gKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucy4gU2VlIGBTZXJ2ZUluaXRgIGRvY3VtZW50YXRpb24gZm9yIGRldGFpbHMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZShcbiAgaGFuZGxlcjogSGFuZGxlcixcbiAgb3B0aW9uczogU2VydmVJbml0ID0ge30sXG4pIHtcbiAgbGV0IHBvcnQgPSBvcHRpb25zLnBvcnQgPz8gODAwMDtcbiAgaWYgKHR5cGVvZiBwb3J0ICE9PSBcIm51bWJlclwiKSB7XG4gICAgcG9ydCA9IE51bWJlcihwb3J0KTtcbiAgfVxuXG4gIGNvbnN0IGhvc3RuYW1lID0gb3B0aW9ucy5ob3N0bmFtZSA/PyBcIjAuMC4wLjBcIjtcbiAgY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7XG4gICAgcG9ydCxcbiAgICBob3N0bmFtZSxcbiAgICBoYW5kbGVyLFxuICAgIG9uRXJyb3I6IG9wdGlvbnMub25FcnJvcixcbiAgfSk7XG5cbiAgb3B0aW9ucz8uc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gc2VydmVyLmNsb3NlKCksIHtcbiAgICBvbmNlOiB0cnVlLFxuICB9KTtcblxuICBjb25zdCBsaXN0ZW5lciA9IERlbm8ubGlzdGVuKHtcbiAgICBwb3J0LFxuICAgIGhvc3RuYW1lLFxuICAgIHRyYW5zcG9ydDogXCJ0Y3BcIixcbiAgfSk7XG5cbiAgY29uc3QgcyA9IHNlcnZlci5zZXJ2ZShsaXN0ZW5lcik7XG5cbiAgcG9ydCA9IChzZXJ2ZXIuYWRkcnNbMF0gYXMgRGVuby5OZXRBZGRyKS5wb3J0O1xuXG4gIGlmIChcIm9uTGlzdGVuXCIgaW4gb3B0aW9ucykge1xuICAgIG9wdGlvbnMub25MaXN0ZW4/Lih7IHBvcnQsIGhvc3RuYW1lIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKGBMaXN0ZW5pbmcgb24gaHR0cDovLyR7aG9zdG5hbWVGb3JEaXNwbGF5KGhvc3RuYW1lKX06JHtwb3J0fS9gKTtcbiAgfVxuXG4gIHJldHVybiBhd2FpdCBzO1xufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkICh3aWxsIGJlIHJlbW92ZWQgYWZ0ZXIgMS4wLjApIFVzZSBgRGVuby5TZXJ2ZVRsc09wdGlvbnNgIGluc3RlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVUbHNJbml0IGV4dGVuZHMgU2VydmVJbml0IHtcbiAgLyoqIFNlcnZlciBwcml2YXRlIGtleSBpbiBQRU0gZm9ybWF0ICovXG4gIGtleT86IHN0cmluZztcblxuICAvKiogQ2VydCBjaGFpbiBpbiBQRU0gZm9ybWF0ICovXG4gIGNlcnQ/OiBzdHJpbmc7XG5cbiAgLyoqIFRoZSBwYXRoIHRvIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIFRMUyBwcml2YXRlIGtleS4gKi9cbiAga2V5RmlsZT86IHN0cmluZztcblxuICAvKiogVGhlIHBhdGggdG8gdGhlIGZpbGUgY29udGFpbmluZyB0aGUgVExTIGNlcnRpZmljYXRlICovXG4gIGNlcnRGaWxlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkICh3aWxsIGJlIHJlbW92ZWQgYWZ0ZXIgMS4wLjApIFVzZSBgRGVuby5zZXJ2ZWAgaW5zdGVhZC5cbiAqXG4gKiBTZXJ2ZXMgSFRUUFMgcmVxdWVzdHMgd2l0aCB0aGUgZ2l2ZW4gaGFuZGxlci5cbiAqXG4gKiBZb3UgbXVzdCBzcGVjaWZ5IGBrZXlgIG9yIGBrZXlGaWxlYCBhbmQgYGNlcnRgIG9yIGBjZXJ0RmlsZWAgb3B0aW9ucy5cbiAqXG4gKiBZb3UgY2FuIHNwZWNpZnkgYW4gb2JqZWN0IHdpdGggYSBwb3J0IGFuZCBob3N0bmFtZSBvcHRpb24sIHdoaWNoIGlzIHRoZVxuICogYWRkcmVzcyB0byBsaXN0ZW4gb24uIFRoZSBkZWZhdWx0IGlzIHBvcnQgODQ0MyBvbiBob3N0bmFtZSBcIjAuMC4wLjBcIi5cbiAqXG4gKiBUaGUgYmVsb3cgZXhhbXBsZSBzZXJ2ZXMgd2l0aCB0aGUgZGVmYXVsdCBwb3J0IDg0NDMuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlVGxzIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9zZXJ2ZXIudHNcIjtcbiAqXG4gKiBjb25zdCBjZXJ0ID0gXCItLS0tLUJFR0lOIENFUlRJRklDQVRFLS0tLS1cXG4uLi5cXG4tLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tXFxuXCI7XG4gKiBjb25zdCBrZXkgPSBcIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxcbi4uLlxcbi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS1cXG5cIjtcbiAqIHNlcnZlVGxzKChfcmVxKSA9PiBuZXcgUmVzcG9uc2UoXCJIZWxsbywgd29ybGRcIiksIHsgY2VydCwga2V5IH0pO1xuICpcbiAqIC8vIE9yXG4gKlxuICogY29uc3QgY2VydEZpbGUgPSBcIi9wYXRoL3RvL2NlcnRGaWxlLmNydFwiO1xuICogY29uc3Qga2V5RmlsZSA9IFwiL3BhdGgvdG8va2V5RmlsZS5rZXlcIjtcbiAqIHNlcnZlVGxzKChfcmVxKSA9PiBuZXcgUmVzcG9uc2UoXCJIZWxsbywgd29ybGRcIiksIHsgY2VydEZpbGUsIGtleUZpbGUgfSk7XG4gKiBgYGBcbiAqXG4gKiBgc2VydmVUbHNgIGZ1bmN0aW9uIHByaW50cyB0aGUgbWVzc2FnZSBgTGlzdGVuaW5nIG9uIGh0dHBzOi8vPGhvc3RuYW1lPjo8cG9ydD4vYFxuICogb24gc3RhcnQtdXAgYnkgZGVmYXVsdC4gSWYgeW91IGxpa2UgdG8gY2hhbmdlIHRoaXMgbWVzc2FnZSwgeW91IGNhbiBzcGVjaWZ5XG4gKiBgb25MaXN0ZW5gIG9wdGlvbiB0byBvdmVycmlkZSBpdC5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgc2VydmVUbHMgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL3NlcnZlci50c1wiO1xuICogY29uc3QgY2VydEZpbGUgPSBcIi9wYXRoL3RvL2NlcnRGaWxlLmNydFwiO1xuICogY29uc3Qga2V5RmlsZSA9IFwiL3BhdGgvdG8va2V5RmlsZS5rZXlcIjtcbiAqIHNlcnZlVGxzKChfcmVxKSA9PiBuZXcgUmVzcG9uc2UoXCJIZWxsbywgd29ybGRcIiksIHtcbiAqICAgY2VydEZpbGUsXG4gKiAgIGtleUZpbGUsXG4gKiAgIG9uTGlzdGVuKHsgcG9ydCwgaG9zdG5hbWUgfSkge1xuICogICAgIGNvbnNvbGUubG9nKGBTZXJ2ZXIgc3RhcnRlZCBhdCBodHRwczovLyR7aG9zdG5hbWV9OiR7cG9ydH1gKTtcbiAqICAgICAvLyAuLi4gbW9yZSBpbmZvIHNwZWNpZmljIHRvIHlvdXIgc2VydmVyIC4uXG4gKiAgIH0sXG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIFlvdSBjYW4gYWxzbyBzcGVjaWZ5IGB1bmRlZmluZWRgIG9yIGBudWxsYCB0byBzdG9wIHRoZSBsb2dnaW5nIGJlaGF2aW9yLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZVRscyB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBjb25zdCBjZXJ0RmlsZSA9IFwiL3BhdGgvdG8vY2VydEZpbGUuY3J0XCI7XG4gKiBjb25zdCBrZXlGaWxlID0gXCIvcGF0aC90by9rZXlGaWxlLmtleVwiO1xuICogc2VydmVUbHMoKF9yZXEpID0+IG5ldyBSZXNwb25zZShcIkhlbGxvLCB3b3JsZFwiKSwge1xuICogICBjZXJ0RmlsZSxcbiAqICAga2V5RmlsZSxcbiAqICAgb25MaXN0ZW46IHVuZGVmaW5lZCxcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQHBhcmFtIGhhbmRsZXIgVGhlIGhhbmRsZXIgZm9yIGluZGl2aWR1YWwgSFRUUFMgcmVxdWVzdHMuXG4gKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucy4gU2VlIGBTZXJ2ZVRsc0luaXRgIGRvY3VtZW50YXRpb24gZm9yIGRldGFpbHMuXG4gKiBAcmV0dXJuc1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmVUbHMoXG4gIGhhbmRsZXI6IEhhbmRsZXIsXG4gIG9wdGlvbnM6IFNlcnZlVGxzSW5pdCxcbikge1xuICBpZiAoIW9wdGlvbnMua2V5ICYmICFvcHRpb25zLmtleUZpbGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUTFMgY29uZmlnIGlzIGdpdmVuLCBidXQgJ2tleScgaXMgbWlzc2luZy5cIik7XG4gIH1cblxuICBpZiAoIW9wdGlvbnMuY2VydCAmJiAhb3B0aW9ucy5jZXJ0RmlsZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlRMUyBjb25maWcgaXMgZ2l2ZW4sIGJ1dCAnY2VydCcgaXMgbWlzc2luZy5cIik7XG4gIH1cblxuICBsZXQgcG9ydCA9IG9wdGlvbnMucG9ydCA/PyA4NDQzO1xuICBpZiAodHlwZW9mIHBvcnQgIT09IFwibnVtYmVyXCIpIHtcbiAgICBwb3J0ID0gTnVtYmVyKHBvcnQpO1xuICB9XG5cbiAgY29uc3QgaG9zdG5hbWUgPSBvcHRpb25zLmhvc3RuYW1lID8/IFwiMC4wLjAuMFwiO1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHtcbiAgICBwb3J0LFxuICAgIGhvc3RuYW1lLFxuICAgIGhhbmRsZXIsXG4gICAgb25FcnJvcjogb3B0aW9ucy5vbkVycm9yLFxuICB9KTtcblxuICBvcHRpb25zPy5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiBzZXJ2ZXIuY2xvc2UoKSwge1xuICAgIG9uY2U6IHRydWUsXG4gIH0pO1xuXG4gIGNvbnN0IGtleSA9IG9wdGlvbnMua2V5IHx8IERlbm8ucmVhZFRleHRGaWxlU3luYyhvcHRpb25zLmtleUZpbGUhKTtcbiAgY29uc3QgY2VydCA9IG9wdGlvbnMuY2VydCB8fCBEZW5vLnJlYWRUZXh0RmlsZVN5bmMob3B0aW9ucy5jZXJ0RmlsZSEpO1xuXG4gIGNvbnN0IGxpc3RlbmVyID0gRGVuby5saXN0ZW5UbHMoe1xuICAgIHBvcnQsXG4gICAgaG9zdG5hbWUsXG4gICAgY2VydCxcbiAgICBrZXksXG4gICAgdHJhbnNwb3J0OiBcInRjcFwiLFxuICAgIC8vIEFMUE4gcHJvdG9jb2wgc3VwcG9ydCBub3QgeWV0IHN0YWJsZS5cbiAgICAvLyBhbHBuUHJvdG9jb2xzOiBbXCJoMlwiLCBcImh0dHAvMS4xXCJdLFxuICB9KTtcblxuICBjb25zdCBzID0gc2VydmVyLnNlcnZlKGxpc3RlbmVyKTtcblxuICBwb3J0ID0gKHNlcnZlci5hZGRyc1swXSBhcyBEZW5vLk5ldEFkZHIpLnBvcnQ7XG5cbiAgaWYgKFwib25MaXN0ZW5cIiBpbiBvcHRpb25zKSB7XG4gICAgb3B0aW9ucy5vbkxpc3Rlbj8uKHsgcG9ydCwgaG9zdG5hbWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBgTGlzdGVuaW5nIG9uIGh0dHBzOi8vJHtob3N0bmFtZUZvckRpc3BsYXkoaG9zdG5hbWUpfToke3BvcnR9L2AsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBhd2FpdCBzO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxTQUFTLEtBQUssUUFBUSxvQkFBb0I7QUFFMUMsK0NBQStDLEdBQy9DLE1BQU0sc0JBQXNCO0FBRTVCLG1DQUFtQyxHQUNuQyxNQUFNLFlBQVk7QUFFbEIsb0NBQW9DLEdBQ3BDLE1BQU0sYUFBYTtBQUVuQix1RUFBdUUsR0FDdkUsTUFBTSwrQkFBK0I7QUFFckMsa0VBQWtFLEdBQ2xFLE1BQU0sMkJBQTJCO0FBd0NqQzs7Q0FFQyxHQUNELE9BQU8sTUFBTTtFQUNYLENBQUEsSUFBSyxDQUFVO0VBQ2YsQ0FBQSxJQUFLLENBQVU7RUFDZixDQUFBLE9BQVEsQ0FBVTtFQUNsQixDQUFBLE1BQU8sR0FBRyxNQUFNO0VBQ2hCLENBQUEsU0FBVSxHQUF1QixJQUFJLE1BQU07RUFDM0MsQ0FBQSxpQ0FBa0MsR0FBRyxJQUFJLGtCQUFrQjtFQUMzRCxDQUFBLGVBQWdCLEdBQXVCLElBQUksTUFBTTtFQUNqRCxDQUFBLE9BQVEsQ0FBbUQ7RUFFM0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkMsR0FDRCxZQUFZLFVBQXNCLENBQUU7SUFDbEMsSUFBSSxDQUFDLENBQUEsSUFBSyxHQUFHLFdBQVcsSUFBSTtJQUM1QixJQUFJLENBQUMsQ0FBQSxJQUFLLEdBQUcsV0FB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
// denoCacheMetadata=14712053926461471785,3791237708023034126