// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
/** Provides functions for dealing with and matching ETags, including
 * {@linkcode calculate} to calculate an etag for a given entity,
 * {@linkcode ifMatch} for validating if an ETag matches against a `If-Match`
 * header and {@linkcode ifNoneMatch} for validating an Etag against an
 * `If-None-Match` header.
 *
 * See further information on the `ETag` header on
 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag).
 *
 * @module
 */ import { encode as base64Encode } from "../encoding/base64.ts";
const encoder = new TextEncoder();
const DEFAULT_ALGORITHM = "SHA-256";
function isFileInfo(value) {
  return Boolean(value && typeof value === "object" && "mtime" in value && "size" in value);
}
async function calcEntity(entity, { algorithm = DEFAULT_ALGORITHM }) {
  // a short circuit for zero length entities
  if (entity.length === 0) {
    return `0-47DEQpj8HBSa+/TImW+5JCeuQeR`;
  }
  if (typeof entity === "string") {
    entity = encoder.encode(entity);
  }
  const hash = base64Encode(await crypto.subtle.digest(algorithm, entity)).substring(0, 27);
  return `${entity.length.toString(16)}-${hash}`;
}
async function calcFileInfo(fileInfo, { algorithm = DEFAULT_ALGORITHM }) {
  if (fileInfo.mtime) {
    const hash = base64Encode(await crypto.subtle.digest(algorithm, encoder.encode(fileInfo.mtime.toJSON()))).substring(0, 27);
    return `${fileInfo.size.toString(16)}-${hash}`;
  }
}
/** Calculate an ETag for an entity. When the entity is a specific set of data
 * it will be fingerprinted as a "strong" tag, otherwise if it is just file
 * information, it will be calculated as a weak tag.
 *
 * ```ts
 * import { calculate } from "https://deno.land/std@$STD_VERSION/http/etag.ts";
 * import { assert } from "https://deno.land/std@$STD_VERSION/assert/assert.ts"
 *
 * const body = "hello deno!";
 *
 * const etag = await calculate(body);
 * assert(etag);
 *
 * const res = new Response(body, { headers: { etag } });
 * ```
 */ export async function calculate(entity, options = {}) {
  const weak = options.weak ?? isFileInfo(entity);
  const tag = await (isFileInfo(entity) ? calcFileInfo(entity, options) : calcEntity(entity, options));
  return tag ? weak ? `W/"${tag}"` : `"${tag}"` : undefined;
}
/** A helper function that takes the value from the `If-Match` header and a
 * calculated etag for the target. By using strong comparison, return `true` if
 * the values match, otherwise `false`.
 *
 * See MDN's [`If-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)
 * article for more information on how to use this function.
 *
 * ```ts
 * import {
 *   calculate,
 *   ifMatch,
 * } from "https://deno.land/std@$STD_VERSION/http/etag.ts";
 * import { assert } from "https://deno.land/std@$STD_VERSION/assert/assert.ts"
 *
 * const body = "hello deno!";
 *
 * Deno.serve(async (req) => {
 *   const ifMatchValue = req.headers.get("if-match");
 *   const etag = await calculate(body);
 *   assert(etag);
 *   if (!ifMatchValue || ifMatch(ifMatchValue, etag)) {
 *     return new Response(body, { status: 200, headers: { etag } });
 *   } else {
 *     return new Response(null, { status: 412, statusText: "Precondition Failed"});
 *   }
 * });
 * ```
 */ export function ifMatch(value, etag) {
  // Weak tags cannot be matched and return false.
  if (!value || !etag || etag.startsWith("W/")) {
    return false;
  }
  if (value.trim() === "*") {
    return true;
  }
  const tags = value.split(/\s*,\s*/);
  return tags.includes(etag);
}
/** A helper function that takes the value from the `If-None-Match` header and
 * a calculated etag for the target entity and returns `false` if the etag for
 * the entity matches the supplied value, otherwise `true`.
 *
 * See MDN's [`If-None-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
 * article for more information on how to use this function.
 *
 * ```ts
 * import {
 *   calculate,
 *   ifNoneMatch,
 * } from "https://deno.land/std@$STD_VERSION/http/etag.ts";
 * import { assert } from "https://deno.land/std@$STD_VERSION/assert/assert.ts"
 *
 * const body = "hello deno!";
 *
 * Deno.serve(async (req) => {
 *   const ifNoneMatchValue = req.headers.get("if-none-match");
 *   const etag = await calculate(body);
 *   assert(etag);
 *   if (!ifNoneMatch(ifNoneMatchValue, etag)) {
 *     return new Response(null, { status: 304, headers: { etag } });
 *   } else {
 *     return new Response(body, { status: 200, headers: { etag } });
 *   }
 * });
 * ```
 */ export function ifNoneMatch(value, etag) {
  if (!value || !etag) {
    return true;
  }
  if (value.trim() === "*") {
    return false;
  }
  etag = etag.startsWith("W/") ? etag.slice(2) : etag;
  const tags = value.split(/\s*,\s*/).map((tag)=>tag.startsWith("W/") ? tag.slice(2) : tag);
  return !tags.includes(etag);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL2h0dHAvZXRhZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIzIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vKiogUHJvdmlkZXMgZnVuY3Rpb25zIGZvciBkZWFsaW5nIHdpdGggYW5kIG1hdGNoaW5nIEVUYWdzLCBpbmNsdWRpbmdcbiAqIHtAbGlua2NvZGUgY2FsY3VsYXRlfSB0byBjYWxjdWxhdGUgYW4gZXRhZyBmb3IgYSBnaXZlbiBlbnRpdHksXG4gKiB7QGxpbmtjb2RlIGlmTWF0Y2h9IGZvciB2YWxpZGF0aW5nIGlmIGFuIEVUYWcgbWF0Y2hlcyBhZ2FpbnN0IGEgYElmLU1hdGNoYFxuICogaGVhZGVyIGFuZCB7QGxpbmtjb2RlIGlmTm9uZU1hdGNofSBmb3IgdmFsaWRhdGluZyBhbiBFdGFnIGFnYWluc3QgYW5cbiAqIGBJZi1Ob25lLU1hdGNoYCBoZWFkZXIuXG4gKlxuICogU2VlIGZ1cnRoZXIgaW5mb3JtYXRpb24gb24gdGhlIGBFVGFnYCBoZWFkZXIgb25cbiAqIFtNRE5dKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0hUVFAvSGVhZGVycy9FVGFnKS5cbiAqXG4gKiBAbW9kdWxlXG4gKi9cblxuaW1wb3J0IHsgZW5jb2RlIGFzIGJhc2U2NEVuY29kZSB9IGZyb20gXCIuLi9lbmNvZGluZy9iYXNlNjQudHNcIjtcblxuLyoqIEp1c3QgdGhlIHBhcnQgb2YgYERlbm8uRmlsZUluZm9gIHRoYXQgaXMgcmVxdWlyZWQgdG8gY2FsY3VsYXRlIGFuIGBFVGFnYCxcbiAqIHNvIHBhcnRpYWwgb3IgdXNlciBnZW5lcmF0ZWQgZmlsZSBpbmZvcm1hdGlvbiBjYW4gYmUgcGFzc2VkLiAqL1xuZXhwb3J0IGludGVyZmFjZSBGaWxlSW5mbyB7XG4gIG10aW1lOiBEYXRlIHwgbnVsbDtcbiAgc2l6ZTogbnVtYmVyO1xufVxuXG50eXBlIEVudGl0eSA9IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBGaWxlSW5mbztcblxuY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXG5jb25zdCBERUZBVUxUX0FMR09SSVRITTogQWxnb3JpdGhtSWRlbnRpZmllciA9IFwiU0hBLTI1NlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVUYWdPcHRpb25zIHtcbiAgLyoqIEEgZGlnZXN0IGFsZ29yaXRobSB0byB1c2UgdG8gY2FsY3VsYXRlIHRoZSBldGFnLiBEZWZhdWx0cyB0b1xuICAgKiBgXCJGTlYzMkFcImAuICovXG4gIGFsZ29yaXRobT86IEFsZ29yaXRobUlkZW50aWZpZXI7XG5cbiAgLyoqIE92ZXJyaWRlIHRoZSBkZWZhdWx0IGJlaGF2aW9yIG9mIGNhbGN1bGF0aW5nIHRoZSBgRVRhZ2AsIGVpdGhlciBmb3JjaW5nXG4gICAqIGEgdGFnIHRvIGJlIGxhYmVsbGVkIHdlYWsgb3Igbm90LiAqL1xuICB3ZWFrPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gaXNGaWxlSW5mbyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIEZpbGVJbmZvIHtcbiAgcmV0dXJuIEJvb2xlYW4oXG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIFwibXRpbWVcIiBpbiB2YWx1ZSAmJiBcInNpemVcIiBpbiB2YWx1ZSxcbiAgKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FsY0VudGl0eShcbiAgZW50aXR5OiBzdHJpbmcgfCBVaW50OEFycmF5LFxuICB7IGFsZ29yaXRobSA9IERFRkFVTFRfQUxHT1JJVEhNIH06IEVUYWdPcHRpb25zLFxuKSB7XG4gIC8vIGEgc2hvcnQgY2lyY3VpdCBmb3IgemVybyBsZW5ndGggZW50aXRpZXNcbiAgaWYgKGVudGl0eS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gYDAtNDdERVFwajhIQlNhKy9USW1XKzVKQ2V1UWVSYDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgZW50aXR5ID09PSBcInN0cmluZ1wiKSB7XG4gICAgZW50aXR5ID0gZW5jb2Rlci5lbmNvZGUoZW50aXR5KTtcbiAgfVxuXG4gIGNvbnN0IGhhc2ggPSBiYXNlNjRFbmNvZGUoYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoYWxnb3JpdGhtLCBlbnRpdHkpKVxuICAgIC5zdWJzdHJpbmcoMCwgMjcpO1xuXG4gIHJldHVybiBgJHtlbnRpdHkubGVuZ3RoLnRvU3RyaW5nKDE2KX0tJHtoYXNofWA7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGNGaWxlSW5mbyhcbiAgZmlsZUluZm86IEZpbGVJbmZvLFxuICB7IGFsZ29yaXRobSA9IERFRkFVTFRfQUxHT1JJVEhNIH06IEVUYWdPcHRpb25zLFxuKSB7XG4gIGlmIChmaWxlSW5mby5tdGltZSkge1xuICAgIGNvbnN0IGhhc2ggPSBiYXNlNjRFbmNvZGUoXG4gICAgICBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcbiAgICAgICAgYWxnb3JpdGhtLFxuICAgICAgICBlbmNvZGVyLmVuY29kZShmaWxlSW5mby5tdGltZS50b0pTT04oKSksXG4gICAgICApLFxuICAgICkuc3Vic3RyaW5nKDAsIDI3KTtcbiAgICByZXR1cm4gYCR7ZmlsZUluZm8uc2l6ZS50b1N0cmluZygxNil9LSR7aGFzaH1gO1xuICB9XG59XG5cbi8qKiBDYWxjdWxhdGUgYW4gRVRhZyBmb3IgYW4gZW50aXR5LiBXaGVuIHRoZSBlbnRpdHkgaXMgYSBzcGVjaWZpYyBzZXQgb2YgZGF0YVxuICogaXQgd2lsbCBiZSBmaW5nZXJwcmludGVkIGFzIGEgXCJzdHJvbmdcIiB0YWcsIG90aGVyd2lzZSBpZiBpdCBpcyBqdXN0IGZpbGVcbiAqIGluZm9ybWF0aW9uLCBpdCB3aWxsIGJlIGNhbGN1bGF0ZWQgYXMgYSB3ZWFrIHRhZy5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgY2FsY3VsYXRlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9ldGFnLnRzXCI7XG4gKiBpbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9hc3NlcnQvYXNzZXJ0LnRzXCJcbiAqXG4gKiBjb25zdCBib2R5ID0gXCJoZWxsbyBkZW5vIVwiO1xuICpcbiAqIGNvbnN0IGV0YWcgPSBhd2FpdCBjYWxjdWxhdGUoYm9keSk7XG4gKiBhc3NlcnQoZXRhZyk7XG4gKlxuICogY29uc3QgcmVzID0gbmV3IFJlc3BvbnNlKGJvZHksIHsgaGVhZGVyczogeyBldGFnIH0gfSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNhbGN1bGF0ZShcbiAgZW50aXR5OiBFbnRpdHksXG4gIG9wdGlvbnM6IEVUYWdPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBjb25zdCB3ZWFrID0gb3B0aW9ucy53ZWFrID8/IGlzRmlsZUluZm8oZW50aXR5KTtcbiAgY29uc3QgdGFnID1cbiAgICBhd2FpdCAoaXNGaWxlSW5mbyhlbnRpdHkpXG4gICAgICA/IGNhbGNGaWxlSW5mbyhlbnRpdHksIG9wdGlvbnMpXG4gICAgICA6IGNhbGNFbnRpdHkoZW50aXR5LCBvcHRpb25zKSk7XG5cbiAgcmV0dXJuIHRhZyA/IHdlYWsgPyBgVy9cIiR7dGFnfVwiYCA6IGBcIiR7dGFnfVwiYCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEEgaGVscGVyIGZ1bmN0aW9uIHRoYXQgdGFrZXMgdGhlIHZhbHVlIGZyb20gdGhlIGBJZi1NYXRjaGAgaGVhZGVyIGFuZCBhXG4gKiBjYWxjdWxhdGVkIGV0YWcgZm9yIHRoZSB0YXJnZXQuIEJ5IHVzaW5nIHN0cm9uZyBjb21wYXJpc29uLCByZXR1cm4gYHRydWVgIGlmXG4gKiB0aGUgdmFsdWVzIG1hdGNoLCBvdGhlcndpc2UgYGZhbHNlYC5cbiAqXG4gKiBTZWUgTUROJ3MgW2BJZi1NYXRjaGBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0hUVFAvSGVhZGVycy9JZi1NYXRjaClcbiAqIGFydGljbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSB0aGlzIGZ1bmN0aW9uLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQge1xuICogICBjYWxjdWxhdGUsXG4gKiAgIGlmTWF0Y2gsXG4gKiB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvZXRhZy50c1wiO1xuICogaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vYXNzZXJ0L2Fzc2VydC50c1wiXG4gKlxuICogY29uc3QgYm9keSA9IFwiaGVsbG8gZGVubyFcIjtcbiAqXG4gKiBEZW5vLnNlcnZlKGFzeW5jIChyZXEpID0+IHtcbiAqICAgY29uc3QgaWZNYXRjaFZhbHVlID0gcmVxLmhlYWRlcnMuZ2V0KFwiaWYtbWF0Y2hcIik7XG4gKiAgIGNvbnN0IGV0YWcgPSBhd2FpdCBjYWxjdWxhdGUoYm9keSk7XG4gKiAgIGFzc2VydChldGFnKTtcbiAqICAgaWYgKCFpZk1hdGNoVmFsdWUgfHwgaWZNYXRjaChpZk1hdGNoVmFsdWUsIGV0YWcpKSB7XG4gKiAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwLCBoZWFkZXJzOiB7IGV0YWcgfSB9KTtcbiAqICAgfSBlbHNlIHtcbiAqICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHsgc3RhdHVzOiA0MTIsIHN0YXR1c1RleHQ6IFwiUHJlY29uZGl0aW9uIEZhaWxlZFwifSk7XG4gKiAgIH1cbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZk1hdGNoKFxuICB2YWx1ZTogc3RyaW5nIHwgbnVsbCxcbiAgZXRhZzogc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogYm9vbGVhbiB7XG4gIC8vIFdlYWsgdGFncyBjYW5ub3QgYmUgbWF0Y2hlZCBhbmQgcmV0dXJuIGZhbHNlLlxuICBpZiAoIXZhbHVlIHx8ICFldGFnIHx8IGV0YWcuc3RhcnRzV2l0aChcIlcvXCIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh2YWx1ZS50cmltKCkgPT09IFwiKlwiKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgY29uc3QgdGFncyA9IHZhbHVlLnNwbGl0KC9cXHMqLFxccyovKTtcbiAgcmV0dXJuIHRhZ3MuaW5jbHVkZXMoZXRhZyk7XG59XG5cbi8qKiBBIGhlbHBlciBmdW5jdGlvbiB0aGF0IHRha2VzIHRoZSB2YWx1ZSBmcm9tIHRoZSBgSWYtTm9uZS1NYXRjaGAgaGVhZGVyIGFuZFxuICogYSBjYWxjdWxhdGVkIGV0YWcgZm9yIHRoZSB0YXJnZXQgZW50aXR5IGFuZCByZXR1cm5zIGBmYWxzZWAgaWYgdGhlIGV0YWcgZm9yXG4gKiB0aGUgZW50aXR5IG1hdGNoZXMgdGhlIHN1cHBsaWVkIHZhbHVlLCBvdGhlcndpc2UgYHRydWVgLlxuICpcbiAqIFNlZSBNRE4ncyBbYElmLU5vbmUtTWF0Y2hgXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9IVFRQL0hlYWRlcnMvSWYtTm9uZS1NYXRjaClcbiAqIGFydGljbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSB0aGlzIGZ1bmN0aW9uLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQge1xuICogICBjYWxjdWxhdGUsXG4gKiAgIGlmTm9uZU1hdGNoLFxuICogfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2V0YWcudHNcIjtcbiAqIGltcG9ydCB7IGFzc2VydCB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2Fzc2VydC9hc3NlcnQudHNcIlxuICpcbiAqIGNvbnN0IGJvZHkgPSBcImhlbGxvIGRlbm8hXCI7XG4gKlxuICogRGVuby5zZXJ2ZShhc3luYyAocmVxKSA9PiB7XG4gKiAgIGNvbnN0IGlmTm9uZU1hdGNoVmFsdWUgPSByZXEuaGVhZGVycy5nZXQoXCJpZi1ub25lLW1hdGNoXCIpO1xuICogICBjb25zdCBldGFnID0gYXdhaXQgY2FsY3VsYXRlKGJvZHkpO1xuICogICBhc3NlcnQoZXRhZyk7XG4gKiAgIGlmICghaWZOb25lTWF0Y2goaWZOb25lTWF0Y2hWYWx1ZSwgZXRhZykpIHtcbiAqICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHsgc3RhdHVzOiAzMDQsIGhlYWRlcnM6IHsgZXRhZyB9IH0pO1xuICogICB9IGVsc2Uge1xuICogICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IDIwMCwgaGVhZGVyczogeyBldGFnIH0gfSk7XG4gKiAgIH1cbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZk5vbmVNYXRjaChcbiAgdmFsdWU6IHN0cmluZyB8IG51bGwsXG4gIGV0YWc6IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IGJvb2xlYW4ge1xuICBpZiAoIXZhbHVlIHx8ICFldGFnKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlLnRyaW0oKSA9PT0gXCIqXCIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgZXRhZyA9IGV0YWcuc3RhcnRzV2l0aChcIlcvXCIpID8gZXRhZy5zbGljZSgyKSA6IGV0YWc7XG4gIGNvbnN0IHRhZ3MgPSB2YWx1ZS5zcGxpdCgvXFxzKixcXHMqLykubWFwKCh0YWcpID0+XG4gICAgdGFnLnN0YXJ0c1dpdGgoXCJXL1wiKSA/IHRhZy5zbGljZSgyKSA6IHRhZ1xuICApO1xuICByZXR1cm4gIXRhZ3MuaW5jbHVkZXMoZXRhZyk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBRTFFOzs7Ozs7Ozs7O0NBVUMsR0FFRCxTQUFTLFVBQVUsWUFBWSxRQUFRLHdCQUF3QjtBQVcvRCxNQUFNLFVBQVUsSUFBSTtBQUVwQixNQUFNLG9C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
// denoCacheMetadata=11052574354737311634,12876076403767413687