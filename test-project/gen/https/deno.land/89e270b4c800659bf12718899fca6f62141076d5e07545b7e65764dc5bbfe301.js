// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/**
 * Contains the enum {@linkcode Status} which enumerates standard HTTP status
 * codes and provides several type guards for handling status codes with type
 * safety.
 *
 * @example
 * ```ts
 * import {
 *   Status,
 *   STATUS_TEXT,
 * } from "https://deno.land/std@$STD_VERSION/http/http_status.ts";
 *
 * console.log(Status.NotFound); //=> 404
 * console.log(STATUS_TEXT[Status.NotFound]); //=> "Not Found"
 * ```
 *
 * ```ts
 * import { isErrorStatus } from "https://deno.land/std@$STD_VERSION/http/http_status.ts";
 *
 * const res = await fetch("https://example.com/");
 *
 * if (isErrorStatus(res.status)) {
 *   // error handling here...
 * }
 * ```
 *
 * @module
 */ /** Standard HTTP status codes. */ export var Status = /*#__PURE__*/ function(Status) {
  /** RFC 7231, 6.2.1 */ Status[Status["Continue"] = 100] = "Continue";
  /** RFC 7231, 6.2.2 */ Status[Status["SwitchingProtocols"] = 101] = "SwitchingProtocols";
  /** RFC 2518, 10.1 */ Status[Status["Processing"] = 102] = "Processing";
  /** RFC 8297 **/ Status[Status["EarlyHints"] = 103] = "EarlyHints";
  /** RFC 7231, 6.3.1 */ Status[Status["OK"] = 200] = "OK";
  /** RFC 7231, 6.3.2 */ Status[Status["Created"] = 201] = "Created";
  /** RFC 7231, 6.3.3 */ Status[Status["Accepted"] = 202] = "Accepted";
  /** RFC 7231, 6.3.4 */ Status[Status["NonAuthoritativeInfo"] = 203] = "NonAuthoritativeInfo";
  /** RFC 7231, 6.3.5 */ Status[Status["NoContent"] = 204] = "NoContent";
  /** RFC 7231, 6.3.6 */ Status[Status["ResetContent"] = 205] = "ResetContent";
  /** RFC 7233, 4.1 */ Status[Status["PartialContent"] = 206] = "PartialContent";
  /** RFC 4918, 11.1 */ Status[Status["MultiStatus"] = 207] = "MultiStatus";
  /** RFC 5842, 7.1 */ Status[Status["AlreadyReported"] = 208] = "AlreadyReported";
  /** RFC 3229, 10.4.1 */ Status[Status["IMUsed"] = 226] = "IMUsed";
  /** RFC 7231, 6.4.1 */ Status[Status["MultipleChoices"] = 300] = "MultipleChoices";
  /** RFC 7231, 6.4.2 */ Status[Status["MovedPermanently"] = 301] = "MovedPermanently";
  /** RFC 7231, 6.4.3 */ Status[Status["Found"] = 302] = "Found";
  /** RFC 7231, 6.4.4 */ Status[Status["SeeOther"] = 303] = "SeeOther";
  /** RFC 7232, 4.1 */ Status[Status["NotModified"] = 304] = "NotModified";
  /** RFC 7231, 6.4.5 */ Status[Status["UseProxy"] = 305] = "UseProxy";
  /** RFC 7231, 6.4.7 */ Status[Status["TemporaryRedirect"] = 307] = "TemporaryRedirect";
  /** RFC 7538, 3 */ Status[Status["PermanentRedirect"] = 308] = "PermanentRedirect";
  /** RFC 7231, 6.5.1 */ Status[Status["BadRequest"] = 400] = "BadRequest";
  /** RFC 7235, 3.1 */ Status[Status["Unauthorized"] = 401] = "Unauthorized";
  /** RFC 7231, 6.5.2 */ Status[Status["PaymentRequired"] = 402] = "PaymentRequired";
  /** RFC 7231, 6.5.3 */ Status[Status["Forbidden"] = 403] = "Forbidden";
  /** RFC 7231, 6.5.4 */ Status[Status["NotFound"] = 404] = "NotFound";
  /** RFC 7231, 6.5.5 */ Status[Status["MethodNotAllowed"] = 405] = "MethodNotAllowed";
  /** RFC 7231, 6.5.6 */ Status[Status["NotAcceptable"] = 406] = "NotAcceptable";
  /** RFC 7235, 3.2 */ Status[Status["ProxyAuthRequired"] = 407] = "ProxyAuthRequired";
  /** RFC 7231, 6.5.7 */ Status[Status["RequestTimeout"] = 408] = "RequestTimeout";
  /** RFC 7231, 6.5.8 */ Status[Status["Conflict"] = 409] = "Conflict";
  /** RFC 7231, 6.5.9 */ Status[Status["Gone"] = 410] = "Gone";
  /** RFC 7231, 6.5.10 */ Status[Status["LengthRequired"] = 411] = "LengthRequired";
  /** RFC 7232, 4.2 */ Status[Status["PreconditionFailed"] = 412] = "PreconditionFailed";
  /** RFC 7231, 6.5.11 */ Status[Status["RequestEntityTooLarge"] = 413] = "RequestEntityTooLarge";
  /** RFC 7231, 6.5.12 */ Status[Status["RequestURITooLong"] = 414] = "RequestURITooLong";
  /** RFC 7231, 6.5.13 */ Status[Status["UnsupportedMediaType"] = 415] = "UnsupportedMediaType";
  /** RFC 7233, 4.4 */ Status[Status["RequestedRangeNotSatisfiable"] = 416] = "RequestedRangeNotSatisfiable";
  /** RFC 7231, 6.5.14 */ Status[Status["ExpectationFailed"] = 417] = "ExpectationFailed";
  /** RFC 7168, 2.3.3 */ Status[Status["Teapot"] = 418] = "Teapot";
  /** RFC 7540, 9.1.2 */ Status[Status["MisdirectedRequest"] = 421] = "MisdirectedRequest";
  /** RFC 4918, 11.2 */ Status[Status["UnprocessableEntity"] = 422] = "UnprocessableEntity";
  /** RFC 4918, 11.3 */ Status[Status["Locked"] = 423] = "Locked";
  /** RFC 4918, 11.4 */ Status[Status["FailedDependency"] = 424] = "FailedDependency";
  /** RFC 8470, 5.2 */ Status[Status["TooEarly"] = 425] = "TooEarly";
  /** RFC 7231, 6.5.15 */ Status[Status["UpgradeRequired"] = 426] = "UpgradeRequired";
  /** RFC 6585, 3 */ Status[Status["PreconditionRequired"] = 428] = "PreconditionRequired";
  /** RFC 6585, 4 */ Status[Status["TooManyRequests"] = 429] = "TooManyRequests";
  /** RFC 6585, 5 */ Status[Status["RequestHeaderFieldsTooLarge"] = 431] = "RequestHeaderFieldsTooLarge";
  /** RFC 7725, 3 */ Status[Status["UnavailableForLegalReasons"] = 451] = "UnavailableForLegalReasons";
  /** RFC 7231, 6.6.1 */ Status[Status["InternalServerError"] = 500] = "InternalServerError";
  /** RFC 7231, 6.6.2 */ Status[Status["NotImplemented"] = 501] = "NotImplemented";
  /** RFC 7231, 6.6.3 */ Status[Status["BadGateway"] = 502] = "BadGateway";
  /** RFC 7231, 6.6.4 */ Status[Status["ServiceUnavailable"] = 503] = "ServiceUnavailable";
  /** RFC 7231, 6.6.5 */ Status[Status["GatewayTimeout"] = 504] = "GatewayTimeout";
  /** RFC 7231, 6.6.6 */ Status[Status["HTTPVersionNotSupported"] = 505] = "HTTPVersionNotSupported";
  /** RFC 2295, 8.1 */ Status[Status["VariantAlsoNegotiates"] = 506] = "VariantAlsoNegotiates";
  /** RFC 4918, 11.5 */ Status[Status["InsufficientStorage"] = 507] = "InsufficientStorage";
  /** RFC 5842, 7.2 */ Status[Status["LoopDetected"] = 508] = "LoopDetected";
  /** RFC 2774, 7 */ Status[Status["NotExtended"] = 510] = "NotExtended";
  /** RFC 6585, 6 */ Status[Status["NetworkAuthenticationRequired"] = 511] = "NetworkAuthenticationRequired";
  return Status;
}({});
/** A record of all the status codes text. */ export const STATUS_TEXT = {
  [Status.Accepted]: "Accepted",
  [Status.AlreadyReported]: "Already Reported",
  [Status.BadGateway]: "Bad Gateway",
  [Status.BadRequest]: "Bad Request",
  [Status.Conflict]: "Conflict",
  [Status.Continue]: "Continue",
  [Status.Created]: "Created",
  [Status.EarlyHints]: "Early Hints",
  [Status.ExpectationFailed]: "Expectation Failed",
  [Status.FailedDependency]: "Failed Dependency",
  [Status.Forbidden]: "Forbidden",
  [Status.Found]: "Found",
  [Status.GatewayTimeout]: "Gateway Timeout",
  [Status.Gone]: "Gone",
  [Status.HTTPVersionNotSupported]: "HTTP Version Not Supported",
  [Status.IMUsed]: "IM Used",
  [Status.InsufficientStorage]: "Insufficient Storage",
  [Status.InternalServerError]: "Internal Server Error",
  [Status.LengthRequired]: "Length Required",
  [Status.Locked]: "Locked",
  [Status.LoopDetected]: "Loop Detected",
  [Status.MethodNotAllowed]: "Method Not Allowed",
  [Status.MisdirectedRequest]: "Misdirected Request",
  [Status.MovedPermanently]: "Moved Permanently",
  [Status.MultiStatus]: "Multi Status",
  [Status.MultipleChoices]: "Multiple Choices",
  [Status.NetworkAuthenticationRequired]: "Network Authentication Required",
  [Status.NoContent]: "No Content",
  [Status.NonAuthoritativeInfo]: "Non Authoritative Info",
  [Status.NotAcceptable]: "Not Acceptable",
  [Status.NotExtended]: "Not Extended",
  [Status.NotFound]: "Not Found",
  [Status.NotImplemented]: "Not Implemented",
  [Status.NotModified]: "Not Modified",
  [Status.OK]: "OK",
  [Status.PartialContent]: "Partial Content",
  [Status.PaymentRequired]: "Payment Required",
  [Status.PermanentRedirect]: "Permanent Redirect",
  [Status.PreconditionFailed]: "Precondition Failed",
  [Status.PreconditionRequired]: "Precondition Required",
  [Status.Processing]: "Processing",
  [Status.ProxyAuthRequired]: "Proxy Auth Required",
  [Status.RequestEntityTooLarge]: "Request Entity Too Large",
  [Status.RequestHeaderFieldsTooLarge]: "Request Header Fields Too Large",
  [Status.RequestTimeout]: "Request Timeout",
  [Status.RequestURITooLong]: "Request URI Too Long",
  [Status.RequestedRangeNotSatisfiable]: "Requested Range Not Satisfiable",
  [Status.ResetContent]: "Reset Content",
  [Status.SeeOther]: "See Other",
  [Status.ServiceUnavailable]: "Service Unavailable",
  [Status.SwitchingProtocols]: "Switching Protocols",
  [Status.Teapot]: "I'm a teapot",
  [Status.TemporaryRedirect]: "Temporary Redirect",
  [Status.TooEarly]: "Too Early",
  [Status.TooManyRequests]: "Too Many Requests",
  [Status.Unauthorized]: "Unauthorized",
  [Status.UnavailableForLegalReasons]: "Unavailable For Legal Reasons",
  [Status.UnprocessableEntity]: "Unprocessable Entity",
  [Status.UnsupportedMediaType]: "Unsupported Media Type",
  [Status.UpgradeRequired]: "Upgrade Required",
  [Status.UseProxy]: "Use Proxy",
  [Status.VariantAlsoNegotiates]: "Variant Also Negotiates"
};
/** A type guard that determines if the status code is informational. */ export function isInformationalStatus(status) {
  return status >= 100 && status < 200;
}
/** A type guard that determines if the status code is successful. */ export function isSuccessfulStatus(status) {
  return status >= 200 && status < 300;
}
/** A type guard that determines if the status code is a redirection. */ export function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}
/** A type guard that determines if the status code is a client error. */ export function isClientErrorStatus(status) {
  return status >= 400 && status < 500;
}
/** A type guard that determines if the status code is a server error. */ export function isServerErrorStatus(status) {
  return status >= 500 && status < 600;
}
/** A type guard that determines if the status code is an error. */ export function isErrorStatus(status) {
  return status >= 400 && status < 600;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL2h0dHAvaHR0cF9zdGF0dXMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMyB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIFRoaXMgbW9kdWxlIGlzIGJyb3dzZXIgY29tcGF0aWJsZS5cblxuLyoqXG4gKiBDb250YWlucyB0aGUgZW51bSB7QGxpbmtjb2RlIFN0YXR1c30gd2hpY2ggZW51bWVyYXRlcyBzdGFuZGFyZCBIVFRQIHN0YXR1c1xuICogY29kZXMgYW5kIHByb3ZpZGVzIHNldmVyYWwgdHlwZSBndWFyZHMgZm9yIGhhbmRsaW5nIHN0YXR1cyBjb2RlcyB3aXRoIHR5cGVcbiAqIHNhZmV0eS5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHNcbiAqIGltcG9ydCB7XG4gKiAgIFN0YXR1cyxcbiAqICAgU1RBVFVTX1RFWFQsXG4gKiB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvaHR0cF9zdGF0dXMudHNcIjtcbiAqXG4gKiBjb25zb2xlLmxvZyhTdGF0dXMuTm90Rm91bmQpOyAvLz0+IDQwNFxuICogY29uc29sZS5sb2coU1RBVFVTX1RFWFRbU3RhdHVzLk5vdEZvdW5kXSk7IC8vPT4gXCJOb3QgRm91bmRcIlxuICogYGBgXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGlzRXJyb3JTdGF0dXMgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2h0dHBfc3RhdHVzLnRzXCI7XG4gKlxuICogY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goXCJodHRwczovL2V4YW1wbGUuY29tL1wiKTtcbiAqXG4gKiBpZiAoaXNFcnJvclN0YXR1cyhyZXMuc3RhdHVzKSkge1xuICogICAvLyBlcnJvciBoYW5kbGluZyBoZXJlLi4uXG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBAbW9kdWxlXG4gKi9cblxuLyoqIFN0YW5kYXJkIEhUVFAgc3RhdHVzIGNvZGVzLiAqL1xuZXhwb3J0IGVudW0gU3RhdHVzIHtcbiAgLyoqIFJGQyA3MjMxLCA2LjIuMSAqL1xuICBDb250aW51ZSA9IDEwMCxcbiAgLyoqIFJGQyA3MjMxLCA2LjIuMiAqL1xuICBTd2l0Y2hpbmdQcm90b2NvbHMgPSAxMDEsXG4gIC8qKiBSRkMgMjUxOCwgMTAuMSAqL1xuICBQcm9jZXNzaW5nID0gMTAyLFxuICAvKiogUkZDIDgyOTcgKiovXG4gIEVhcmx5SGludHMgPSAxMDMsXG5cbiAgLyoqIFJGQyA3MjMxLCA2LjMuMSAqL1xuICBPSyA9IDIwMCxcbiAgLyoqIFJGQyA3MjMxLCA2LjMuMiAqL1xuICBDcmVhdGVkID0gMjAxLFxuICAvKiogUkZDIDcyMzEsIDYuMy4zICovXG4gIEFjY2VwdGVkID0gMjAyLFxuICAvKiogUkZDIDcyMzEsIDYuMy40ICovXG4gIE5vbkF1dGhvcml0YXRpdmVJbmZvID0gMjAzLFxuICAvKiogUkZDIDcyMzEsIDYuMy41ICovXG4gIE5vQ29udGVudCA9IDIwNCxcbiAgLyoqIFJGQyA3MjMxLCA2LjMuNiAqL1xuICBSZXNldENvbnRlbnQgPSAyMDUsXG4gIC8qKiBSRkMgNzIzMywgNC4xICovXG4gIFBhcnRpYWxDb250ZW50ID0gMjA2LFxuICAvKiogUkZDIDQ5MTgsIDExLjEgKi9cbiAgTXVsdGlTdGF0dXMgPSAyMDcsXG4gIC8qKiBSRkMgNTg0MiwgNy4xICovXG4gIEFscmVhZHlSZXBvcnRlZCA9IDIwOCxcbiAgLyoqIFJGQyAzMjI5LCAxMC40LjEgKi9cbiAgSU1Vc2VkID0gMjI2LFxuXG4gIC8qKiBSRkMgNzIzMSwgNi40LjEgKi9cbiAgTXVsdGlwbGVDaG9pY2VzID0gMzAwLFxuICAvKiogUkZDIDcyMzEsIDYuNC4yICovXG4gIE1vdmVkUGVybWFuZW50bHkgPSAzMDEsXG4gIC8qKiBSRkMgNzIzMSwgNi40LjMgKi9cbiAgRm91bmQgPSAzMDIsXG4gIC8qKiBSRkMgNzIzMSwgNi40LjQgKi9cbiAgU2VlT3RoZXIgPSAzMDMsXG4gIC8qKiBSRkMgNzIzMiwgNC4xICovXG4gIE5vdE1vZGlmaWVkID0gMzA0LFxuICAvKiogUkZDIDcyMzEsIDYuNC41ICovXG4gIFVzZVByb3h5ID0gMzA1LFxuICAvKiogUkZDIDcyMzEsIDYuNC43ICovXG4gIFRlbXBvcmFyeVJlZGlyZWN0ID0gMzA3LFxuICAvKiogUkZDIDc1MzgsIDMgKi9cbiAgUGVybWFuZW50UmVkaXJlY3QgPSAzMDgsXG5cbiAgLyoqIFJGQyA3MjMxLCA2LjUuMSAqL1xuICBCYWRSZXF1ZXN0ID0gNDAwLFxuICAvKiogUkZDIDcyMzUsIDMuMSAqL1xuICBVbmF1dGhvcml6ZWQgPSA0MDEsXG4gIC8qKiBSRkMgNzIzMSwgNi41LjIgKi9cbiAgUGF5bWVudFJlcXVpcmVkID0gNDAyLFxuICAvKiogUkZDIDcyMzEsIDYuNS4zICovXG4gIEZvcmJpZGRlbiA9IDQwMyxcbiAgLyoqIFJGQyA3MjMxLCA2LjUuNCAqL1xuICBOb3RGb3VuZCA9IDQwNCxcbiAgLyoqIFJGQyA3MjMxLCA2LjUuNSAqL1xuICBNZXRob2ROb3RBbGxvd2VkID0gNDA1LFxuICAvKiogUkZDIDcyMzEsIDYuNS42ICovXG4gIE5vdEFjY2VwdGFibGUgPSA0MDYsXG4gIC8qKiBSRkMgNzIzNSwgMy4yICovXG4gIFByb3h5QXV0aFJlcXVpcmVkID0gNDA3LFxuICAvKiogUkZDIDcyMzEsIDYuNS43ICovXG4gIFJlcXVlc3RUaW1lb3V0ID0gNDA4LFxuICAvKiogUkZDIDcyMzEsIDYuNS44ICovXG4gIENvbmZsaWN0ID0gNDA5LFxuICAvKiogUkZDIDcyMzEsIDYuNS45ICovXG4gIEdvbmUgPSA0MTAsXG4gIC8qKiBSRkMgNzIzMSwgNi41LjEwICovXG4gIExlbmd0aFJlcXVpcmVkID0gNDExLFxuICAvKiogUkZDIDcyMzIsIDQuMiAqL1xuICBQcmVjb25kaXRpb25GYWlsZWQgPSA0MTIsXG4gIC8qKiBSRkMgNzIzMSwgNi41LjExICovXG4gIFJlcXVlc3RFbnRpdHlUb29MYXJnZSA9IDQxMyxcbiAgLyoqIFJGQyA3MjMxLCA2LjUuMTIgKi9cbiAgUmVxdWVzdFVSSVRvb0xvbmcgPSA0MTQsXG4gIC8qKiBSRkMgNzIzMSwgNi41LjEzICovXG4gIFVuc3VwcG9ydGVkTWVkaWFUeXBlID0gNDE1LFxuICAvKiogUkZDIDcyMzMsIDQuNCAqL1xuICBSZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlID0gNDE2LFxuICAvKiogUkZDIDcyMzEsIDYuNS4xNCAqL1xuICBFeHBlY3RhdGlvbkZhaWxlZCA9IDQxNyxcbiAgLyoqIFJGQyA3MTY4LCAyLjMuMyAqL1xuICBUZWFwb3QgPSA0MTgsXG4gIC8qKiBSRkMgNzU0MCwgOS4xLjIgKi9cbiAgTWlzZGlyZWN0ZWRSZXF1ZXN0ID0gNDIxLFxuICAvKiogUkZDIDQ5MTgsIDExLjIgKi9cbiAgVW5wcm9jZXNzYWJsZUVudGl0eSA9IDQyMixcbiAgLyoqIFJGQyA0OTE4LCAxMS4zICovXG4gIExvY2tlZCA9IDQyMyxcbiAgLyoqIFJGQyA0OTE4LCAxMS40ICovXG4gIEZhaWxlZERlcGVuZGVuY3kgPSA0MjQsXG4gIC8qKiBSRkMgODQ3MCwgNS4yICovXG4gIFRvb0Vhcmx5ID0gNDI1LFxuICAvKiogUkZDIDcyMzEsIDYuNS4xNSAqL1xuICBVcGdyYWRlUmVxdWlyZWQgPSA0MjYsXG4gIC8qKiBSRkMgNjU4NSwgMyAqL1xuICBQcmVjb25kaXRpb25SZXF1aXJlZCA9IDQyOCxcbiAgLyoqIFJGQyA2NTg1LCA0ICovXG4gIFRvb01hbnlSZXF1ZXN0cyA9IDQyOSxcbiAgLyoqIFJGQyA2NTg1LCA1ICovXG4gIFJlcXVlc3RIZWFkZXJGaWVsZHNUb29MYXJnZSA9IDQzMSxcbiAgLyoqIFJGQyA3NzI1LCAzICovXG4gIFVuYXZhaWxhYmxlRm9yTGVnYWxSZWFzb25zID0gNDUxLFxuXG4gIC8qKiBSRkMgNzIzMSwgNi42LjEgKi9cbiAgSW50ZXJuYWxTZXJ2ZXJFcnJvciA9IDUwMCxcbiAgLyoqIFJGQyA3MjMxLCA2LjYuMiAqL1xuICBOb3RJbXBsZW1lbnRlZCA9IDUwMSxcbiAgLyoqIFJGQyA3MjMxLCA2LjYuMyAqL1xuICBCYWRHYXRld2F5ID0gNTAyLFxuICAvKiogUkZDIDcyMzEsIDYuNi40ICovXG4gIFNlcnZpY2VVbmF2YWlsYWJsZSA9IDUwMyxcbiAgLyoqIFJGQyA3MjMxLCA2LjYuNSAqL1xuICBHYXRld2F5VGltZW91dCA9IDUwNCxcbiAgLyoqIFJGQyA3MjMxLCA2LjYuNiAqL1xuICBIVFRQVmVyc2lvbk5vdFN1cHBvcnRlZCA9IDUwNSxcbiAgLyoqIFJGQyAyMjk1LCA4LjEgKi9cbiAgVmFyaWFudEFsc29OZWdvdGlhdGVzID0gNTA2LFxuICAvKiogUkZDIDQ5MTgsIDExLjUgKi9cbiAgSW5zdWZmaWNpZW50U3RvcmFnZSA9IDUwNyxcbiAgLyoqIFJGQyA1ODQyLCA3LjIgKi9cbiAgTG9vcERldGVjdGVkID0gNTA4LFxuICAvKiogUkZDIDI3NzQsIDcgKi9cbiAgTm90RXh0ZW5kZWQgPSA1MTAsXG4gIC8qKiBSRkMgNjU4NSwgNiAqL1xuICBOZXR3b3JrQXV0aGVudGljYXRpb25SZXF1aXJlZCA9IDUxMSxcbn1cblxuLyoqIEEgcmVjb3JkIG9mIGFsbCB0aGUgc3RhdHVzIGNvZGVzIHRleHQuICovXG5leHBvcnQgY29uc3QgU1RBVFVTX1RFWFQ6IFJlYWRvbmx5PFJlY29yZDxTdGF0dXMsIHN0cmluZz4+ID0ge1xuICBbU3RhdHVzLkFjY2VwdGVkXTogXCJBY2NlcHRlZFwiLFxuICBbU3RhdHVzLkFscmVhZHlSZXBvcnRlZF06IFwiQWxyZWFkeSBSZXBvcnRlZFwiLFxuICBbU3RhdHVzLkJhZEdhdGV3YXldOiBcIkJhZCBHYXRld2F5XCIsXG4gIFtTdGF0dXMuQmFkUmVxdWVzdF06IFwiQmFkIFJlcXVlc3RcIixcbiAgW1N0YXR1cy5Db25mbGljdF06IFwiQ29uZmxpY3RcIixcbiAgW1N0YXR1cy5Db250aW51ZV06IFwiQ29udGludWVcIixcbiAgW1N0YXR1cy5DcmVhdGVkXTogXCJDcmVhdGVkXCIsXG4gIFtTdGF0dXMuRWFybHlIaW50c106IFwiRWFybHkgSGludHNcIixcbiAgW1N0YXR1cy5FeHBlY3RhdGlvbkZhaWxlZF06IFwiRXhwZWN0YXRpb24gRmFpbGVkXCIsXG4gIFtTdGF0dXMuRmFpbGVkRGVwZW5kZW5jeV06IFwiRmFpbGVkIERlcGVuZGVuY3lcIixcbiAgW1N0YXR1cy5Gb3JiaWRkZW5dOiBcIkZvcmJpZGRlblwiLFxuICBbU3RhdHVzLkZvdW5kXTogXCJGb3VuZFwiLFxuICBbU3RhdHVzLkdhdGV3YXlUaW1lb3V0XTogXCJHYXRld2F5IFRpbWVvdXRcIixcbiAgW1N0YXR1cy5Hb25lXTogXCJHb25lXCIsXG4gIFtTdGF0dXMuSFRUUFZlcnNpb25Ob3RTdXBwb3J0ZWRdOiBcIkhUVFAgVmVyc2lvbiBOb3QgU3VwcG9ydGVkXCIsXG4gIFtTdGF0dXMuSU1Vc2VkXTogXCJJTSBVc2VkXCIsXG4gIFtTdGF0dXMuSW5zdWZmaWNpZW50U3RvcmFnZV06IFwiSW5zdWZmaWNpZW50IFN0b3JhZ2VcIixcbiAgW1N0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yXTogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIixcbiAgW1N0YXR1cy5MZW5ndGhSZXF1aXJlZF06IFwiTGVuZ3RoIFJlcXVpcmVkXCIsXG4gIFtTdGF0dXMuTG9ja2VkXTogXCJMb2NrZWRcIixcbiAgW1N0YXR1cy5Mb29wRGV0ZWN0ZWRdOiBcIkxvb3AgRGV0ZWN0ZWRcIixcbiAgW1N0YXR1cy5NZXRob2ROb3RBbGxvd2VkXTogXCJNZXRob2QgTm90IEFsbG93ZWRcIixcbiAgW1N0YXR1cy5NaXNkaXJlY3RlZFJlcXVlc3RdOiBcIk1pc2RpcmVjdGVkIFJlcXVlc3RcIixcbiAgW1N0YXR1cy5Nb3ZlZFBlcm1hbmVudGx5XTogXCJNb3ZlZCBQZXJtYW5lbnRseVwiLFxuICBbU3RhdHVzLk11bHRpU3RhdHVzXTogXCJNdWx0aSBTdGF0dXNcIixcbiAgW1N0YXR1cy5NdWx0aXBsZUNob2ljZXNdOiBcIk11bHRpcGxlIENob2ljZXNcIixcbiAgW1N0YXR1cy5OZXR3b3JrQXV0aGVudGljYXRpb25SZXF1aXJlZF06IFwiTmV0d29yayBBdXRoZW50aWNhdGlvbiBSZXF1aXJlZFwiLFxuICBbU3RhdHVzLk5vQ29udGVudF06IFwiTm8gQ29udGVudFwiLFxuICBbU3RhdHVzLk5vbkF1dGhvcml0YXRpdmVJbmZvXTogXCJOb24gQXV0aG9yaXRhdGl2ZSBJbmZvXCIsXG4gIFtTdGF0dXMuTm90QWNjZXB0YWJsZV06IFwiTm90IEFjY2VwdGFibGVcIixcbiAgW1N0YXR1cy5Ob3RFeHRlbmRlZF06IFwiTm90IEV4dGVuZGVkXCIsXG4gIFtTdGF0dXMuTm90Rm91bmRdOiBcIk5vdCBGb3VuZFwiLFxuICBbU3RhdHVzLk5vdEltcGxlbWVudGVkXTogXCJOb3QgSW1wbGVtZW50ZWRcIixcbiAgW1N0YXR1cy5Ob3RNb2RpZmllZF06IFwiTm90IE1vZGlmaWVkXCIsXG4gIFtTdGF0dXMuT0tdOiBcIk9LXCIsXG4gIFtTdGF0dXMuUGFydGlhbENvbnRlbnRdOiBcIlBhcnRpYWwgQ29udGVudFwiLFxuICBbU3RhdHVzLlBheW1lbnRSZXF1aXJlZF06IFwiUGF5bWVudCBSZXF1aXJlZFwiLFxuICBbU3RhdHVzLlBlcm1hbmVudFJlZGlyZWN0XTogXCJQZXJtYW5lbnQgUmVkaXJlY3RcIixcbiAgW1N0YXR1cy5QcmVjb25kaXRpb25GYWlsZWRdOiBcIlByZWNvbmRpdGlvbiBGYWlsZWRcIixcbiAgW1N0YXR1cy5QcmVjb25kaXRpb25SZXF1aXJlZF06IFwiUHJlY29uZGl0aW9uIFJlcXVpcmVkXCIsXG4gIFtTdGF0dXMuUHJvY2Vzc2luZ106IFwiUHJvY2Vzc2luZ1wiLFxuICBbU3RhdHVzLlByb3h5QXV0aFJlcXVpcmVkXTogXCJQcm94eSBBdXRoIFJlcXVpcmVkXCIsXG4gIFtTdGF0dXMuUmVxdWVzdEVudGl0eVRvb0xhcmdlXTogXCJSZXF1ZXN0IEVudGl0eSBUb28gTGFyZ2VcIixcbiAgW1N0YXR1cy5SZXF1ZXN0SGVhZGVyRmllbGRzVG9vTGFyZ2VdOiBcIlJlcXVlc3QgSGVhZGVyIEZpZWxkcyBUb28gTGFyZ2VcIixcbiAgW1N0YXR1cy5SZXF1ZXN0VGltZW91dF06IFwiUmVxdWVzdCBUaW1lb3V0XCIsXG4gIFtTdGF0dXMuUmVxdWVzdFVSSVRvb0xvbmddOiBcIlJlcXVlc3QgVVJJIFRvbyBMb25nXCIsXG4gIFtTdGF0dXMuUmVxdWVzdGVkUmFuZ2VOb3RTYXRpc2ZpYWJsZV06IFwiUmVxdWVzdGVkIFJhbmdlIE5vdCBTYXRpc2ZpYWJsZVwiLFxuICBbU3RhdHVzLlJlc2V0Q29udGVudF06IFwiUmVzZXQgQ29udGVudFwiLFxuICBbU3RhdHVzLlNlZU90aGVyXTogXCJTZWUgT3RoZXJcIixcbiAgW1N0YXR1cy5TZXJ2aWNlVW5hdmFpbGFibGVdOiBcIlNlcnZpY2UgVW5hdmFpbGFibGVcIixcbiAgW1N0YXR1cy5Td2l0Y2hpbmdQcm90b2NvbHNdOiBcIlN3aXRjaGluZyBQcm90b2NvbHNcIixcbiAgW1N0YXR1cy5UZWFwb3RdOiBcIkknbSBhIHRlYXBvdFwiLFxuICBbU3RhdHVzLlRlbXBvcmFyeVJlZGlyZWN0XTogXCJUZW1wb3JhcnkgUmVkaXJlY3RcIixcbiAgW1N0YXR1cy5Ub29FYXJseV06IFwiVG9vIEVhcmx5XCIsXG4gIFtTdGF0dXMuVG9vTWFueVJlcXVlc3RzXTogXCJUb28gTWFueSBSZXF1ZXN0c1wiLFxuICBbU3RhdHVzLlVuYXV0aG9yaXplZF06IFwiVW5hdXRob3JpemVkXCIsXG4gIFtTdGF0dXMuVW5hdmFpbGFibGVGb3JMZWdhbFJlYXNvbnNdOiBcIlVuYXZhaWxhYmxlIEZvciBMZWdhbCBSZWFzb25zXCIsXG4gIFtTdGF0dXMuVW5wcm9jZXNzYWJsZUVudGl0eV06IFwiVW5wcm9jZXNzYWJsZSBFbnRpdHlcIixcbiAgW1N0YXR1cy5VbnN1cHBvcnRlZE1lZGlhVHlwZV06IFwiVW5zdXBwb3J0ZWQgTWVkaWEgVHlwZVwiLFxuICBbU3RhdHVzLlVwZ3JhZGVSZXF1aXJlZF06IFwiVXBncmFkZSBSZXF1aXJlZFwiLFxuICBbU3RhdHVzLlVzZVByb3h5XTogXCJVc2UgUHJveHlcIixcbiAgW1N0YXR1cy5WYXJpYW50QWxzb05lZ290aWF0ZXNdOiBcIlZhcmlhbnQgQWxzbyBOZWdvdGlhdGVzXCIsXG59O1xuXG4vKiogQW4gSFRUUCBzdGF0dXMgdGhhdCBpcyBhIGluZm9ybWF0aW9uYWwgKDFYWCkuICovXG5leHBvcnQgdHlwZSBJbmZvcm1hdGlvbmFsU3RhdHVzID1cbiAgfCBTdGF0dXMuQ29udGludWVcbiAgfCBTdGF0dXMuU3dpdGNoaW5nUHJvdG9jb2xzXG4gIHwgU3RhdHVzLlByb2Nlc3NpbmdcbiAgfCBTdGF0dXMuRWFybHlIaW50cztcblxuLyoqIEFuIEhUVFAgc3RhdHVzIHRoYXQgaXMgYSBzdWNjZXNzICgyWFgpLiAqL1xuZXhwb3J0IHR5cGUgU3VjY2Vzc2Z1bFN0YXR1cyA9XG4gIHwgU3RhdHVzLk9LXG4gIHwgU3RhdHVzLkNyZWF0ZWRcbiAgfCBTdGF0dXMuQWNjZXB0ZWRcbiAgfCBTdGF0dXMuTm9uQXV0aG9yaXRhdGl2ZUluZm9cbiAgfCBTdGF0dXMuTm9Db250ZW50XG4gIHwgU3RhdHVzLlJlc2V0Q29udGVudFxuICB8IFN0YXR1cy5QYXJ0aWFsQ29udGVudFxuICB8IFN0YXR1cy5NdWx0aVN0YXR1c1xuICB8IFN0YXR1cy5BbHJlYWR5UmVwb3J0ZWRcbiAgfCBTdGF0dXMuSU1Vc2VkO1xuXG4vKiogQW4gSFRUUCBzdGF0dXMgdGhhdCBpcyBhIHJlZGlyZWN0ICgzWFgpLiAqL1xuZXhwb3J0IHR5cGUgUmVkaXJlY3RTdGF0dXMgPVxuICB8IFN0YXR1cy5NdWx0aXBsZUNob2ljZXMgLy8gMzAwXG4gIHwgU3RhdHVzLk1vdmVkUGVybWFuZW50bHkgLy8gMzAxXG4gIHwgU3RhdHVzLkZvdW5kIC8vIDMwMlxuICB8IFN0YXR1cy5TZWVPdGhlciAvLyAzMDNcbiAgfCBTdGF0dXMuVXNlUHJveHkgLy8gMzA1IC0gREVQUkVDQVRFRFxuICB8IFN0YXR1cy5UZW1wb3JhcnlSZWRpcmVjdCAvLyAzMDdcbiAgfCBTdGF0dXMuUGVybWFuZW50UmVkaXJlY3Q7IC8vIDMwOFxuXG4vKiogQW4gSFRUUCBzdGF0dXMgdGhhdCBpcyBhIGNsaWVudCBlcnJvciAoNFhYKS4gKi9cbmV4cG9ydCB0eXBlIENsaWVudEVycm9yU3RhdHVzID1cbiAgfCBTdGF0dXMuQmFkUmVxdWVzdFxuICB8IFN0YXR1cy5VbmF1dGhvcml6ZWRcbiAgfCBTdGF0dXMuUGF5bWVudFJlcXVpcmVkXG4gIHwgU3RhdHVzLkZvcmJpZGRlblxuICB8IFN0YXR1cy5Ob3RGb3VuZFxuICB8IFN0YXR1cy5NZXRob2ROb3RBbGxvd2VkXG4gIHwgU3RhdHVzLk5vdEFjY2VwdGFibGVcbiAgfCBTdGF0dXMuUHJveHlBdXRoUmVxdWlyZWRcbiAgfCBTdGF0dXMuUmVxdWVzdFRpbWVvdXRcbiAgfCBTdGF0dXMuQ29uZmxpY3RcbiAgfCBTdGF0dXMuR29uZVxuICB8IFN0YXR1cy5MZW5ndGhSZXF1aXJlZFxuICB8IFN0YXR1cy5QcmVjb25kaXRpb25GYWlsZWRcbiAgfCBTdGF0dXMuUmVxdWVzdEVudGl0eVRvb0xhcmdlXG4gIHwgU3RhdHVzLlJlcXVlc3RVUklUb29Mb25nXG4gIHwgU3RhdHVzLlVuc3VwcG9ydGVkTWVkaWFUeXBlXG4gIHwgU3RhdHVzLlJlcXVlc3RlZFJhbmdlTm90U2F0aXNmaWFibGVcbiAgfCBTdGF0dXMuRXhwZWN0YXRpb25GYWlsZWRcbiAgfCBTdGF0dXMuVGVhcG90XG4gIHwgU3RhdHVzLk1pc2RpcmVjdGVkUmVxdWVzdFxuICB8IFN0YXR1cy5VbnByb2Nlc3NhYmxlRW50aXR5XG4gIHwgU3RhdHVzLkxvY2tlZFxuICB8IFN0YXR1cy5GYWlsZWREZXBlbmRlbmN5XG4gIHwgU3RhdHVzLlVwZ3JhZGVSZXF1aXJlZFxuICB8IFN0YXR1cy5QcmVjb25kaXRpb25SZXF1aXJlZFxuICB8IFN0YXR1cy5Ub29NYW55UmVxdWVzdHNcbiAgfCBTdGF0dXMuUmVxdWVzdEhlYWRlckZpZWxkc1Rvb0xhcmdlXG4gIHwgU3RhdHVzLlVuYXZhaWxhYmxlRm9yTGVnYWxSZWFzb25zO1xuXG4vKiogQW4gSFRUUCBzdGF0dXMgdGhhdCBpcyBhIHNlcnZlciBlcnJvciAoNVhYKS4gKi9cbmV4cG9ydCB0eXBlIFNlcnZlckVycm9yU3RhdHVzID1cbiAgfCBTdGF0dXMuSW50ZXJuYWxTZXJ2ZXJFcnJvclxuICB8IFN0YXR1cy5Ob3RJbXBsZW1lbnRlZFxuICB8IFN0YXR1cy5CYWRHYXRld2F5XG4gIHwgU3RhdHVzLlNlcnZpY2VVbmF2YWlsYWJsZVxuICB8IFN0YXR1cy5HYXRld2F5VGltZW91dFxuICB8IFN0YXR1cy5IVFRQVmVyc2lvbk5vdFN1cHBvcnRlZFxuICB8IFN0YXR1cy5WYXJpYW50QWxzb05lZ290aWF0ZXNcbiAgfCBTdGF0dXMuSW5zdWZmaWNpZW50U3RvcmFnZVxuICB8IFN0YXR1cy5Mb29wRGV0ZWN0ZWRcbiAgfCBTdGF0dXMuTm90RXh0ZW5kZWRcbiAgfCBTdGF0dXMuTmV0d29ya0F1dGhlbnRpY2F0aW9uUmVxdWlyZWQ7XG5cbi8qKiBBbiBIVFRQIHN0YXR1cyB0aGF0IGlzIGFuIGVycm9yICg0WFggYW5kIDVYWCkuICovXG5leHBvcnQgdHlwZSBFcnJvclN0YXR1cyA9IENsaWVudEVycm9yU3RhdHVzIHwgU2VydmVyRXJyb3JTdGF0dXM7XG5cbi8qKiBBIHR5cGUgZ3VhcmQgdGhhdCBkZXRlcm1pbmVzIGlmIHRoZSBzdGF0dXMgY29kZSBpcyBpbmZvcm1hdGlvbmFsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzSW5mb3JtYXRpb25hbFN0YXR1cyhcbiAgc3RhdHVzOiBTdGF0dXMsXG4pOiBzdGF0dXMgaXMgSW5mb3JtYXRpb25hbFN0YXR1cyB7XG4gIHJldHVybiBzdGF0dXMgPj0gMTAwICYmIHN0YXR1cyA8IDIwMDtcbn1cblxuLyoqIEEgdHlwZSBndWFyZCB0aGF0IGRldGVybWluZXMgaWYgdGhlIHN0YXR1cyBjb2RlIGlzIHN1Y2Nlc3NmdWwuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTdWNjZXNzZnVsU3RhdHVzKHN0YXR1czogU3RhdHVzKTogc3RhdHVzIGlzIFN1Y2Nlc3NmdWxTdGF0dXMge1xuICByZXR1cm4gc3RhdHVzID49IDIwMCAmJiBzdGF0dXMgPCAzMDA7XG59XG5cbi8qKiBBIHR5cGUgZ3VhcmQgdGhhdCBkZXRlcm1pbmVzIGlmIHRoZSBzdGF0dXMgY29kZSBpcyBhIHJlZGlyZWN0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzUmVkaXJlY3RTdGF0dXMoc3RhdHVzOiBTdGF0dXMpOiBzdGF0dXMgaXMgUmVkaXJlY3RTdGF0dXMge1xuICByZXR1cm4gc3RhdHVzID49IDMwMCAmJiBzdGF0dXMgPCA0MDA7XG59XG5cbi8qKiBBIHR5cGUgZ3VhcmQgdGhhdCBkZXRlcm1pbmVzIGlmIHRoZSBzdGF0dXMgY29kZSBpcyBhIGNsaWVudCBlcnJvci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NsaWVudEVycm9yU3RhdHVzKFxuICBzdGF0dXM6IFN0YXR1cyxcbik6IHN0YXR1cyBpcyBDbGllbnRFcnJvclN0YXR1cyB7XG4gIHJldHVybiBzdGF0dXMgPj0gNDAwICYmIHN0YXR1cyA8IDUwMDtcbn1cblxuLyoqIEEgdHlwZSBndWFyZCB0aGF0IGRldGVybWluZXMgaWYgdGhlIHN0YXR1cyBjb2RlIGlzIGEgc2VydmVyIGVycm9yLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2VydmVyRXJyb3JTdGF0dXMoXG4gIHN0YXR1czogU3RhdHVzLFxuKTogc3RhdHVzIGlzIFNlcnZlckVycm9yU3RhdHVzIHtcbiAgcmV0dXJuIHN0YXR1cyA+PSA1MDAgJiYgc3RhdHVzIDwgNjAwO1xufVxuXG4vKiogQSB0eXBlIGd1YXJkIHRoYXQgZGV0ZXJtaW5lcyBpZiB0aGUgc3RhdHVzIGNvZGUgaXMgYW4gZXJyb3IuICovXG5leHBvcnQgZnVuY3Rpb24gaXNFcnJvclN0YXR1cyhzdGF0dXM6IFN0YXR1cyk6IHN0YXR1cyBpcyBFcnJvclN0YXR1cyB7XG4gIHJldHVybiBzdGF0dXMgPj0gNDAwICYmIHN0YXR1cyA8IDYwMDtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoi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
// denoCacheMetadata=62928080238537279,3701966749238226454