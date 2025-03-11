// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { types } from "./_db.ts";
/**
 * @deprecated (will be removed in 0.209.0) Use `contentType` instead.
 *
 * Returns the media type associated with the file extension. Values are
 * normalized to lower case and matched irrespective of a leading `.`.
 *
 * When `extension` has no associated type, the function returns `undefined`.
 *
 * @example
 * ```ts
 * import { typeByExtension } from "https://deno.land/std@$STD_VERSION/media_types/type_by_extension.ts";
 *
 * typeByExtension("js"); // `application/json`
 * typeByExtension(".HTML"); // `text/html`
 * typeByExtension("foo"); // undefined
 * typeByExtension("file.json"); // undefined
 * ```
 */ export function typeByExtension(extension) {
  extension = extension.startsWith(".") ? extension.slice(1) : extension;
  // @ts-ignore workaround around denoland/dnt#148
  return types.get(extension.toLowerCase());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL21lZGlhX3R5cGVzL3R5cGVfYnlfZXh0ZW5zaW9uLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjMgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBUaGlzIG1vZHVsZSBpcyBicm93c2VyIGNvbXBhdGlibGUuXG5cbmltcG9ydCB7IHR5cGVzIH0gZnJvbSBcIi4vX2RiLnRzXCI7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgKHdpbGwgYmUgcmVtb3ZlZCBpbiAwLjIwOS4wKSBVc2UgYGNvbnRlbnRUeXBlYCBpbnN0ZWFkLlxuICpcbiAqIFJldHVybnMgdGhlIG1lZGlhIHR5cGUgYXNzb2NpYXRlZCB3aXRoIHRoZSBmaWxlIGV4dGVuc2lvbi4gVmFsdWVzIGFyZVxuICogbm9ybWFsaXplZCB0byBsb3dlciBjYXNlIGFuZCBtYXRjaGVkIGlycmVzcGVjdGl2ZSBvZiBhIGxlYWRpbmcgYC5gLlxuICpcbiAqIFdoZW4gYGV4dGVuc2lvbmAgaGFzIG5vIGFzc29jaWF0ZWQgdHlwZSwgdGhlIGZ1bmN0aW9uIHJldHVybnMgYHVuZGVmaW5lZGAuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyB0eXBlQnlFeHRlbnNpb24gfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9tZWRpYV90eXBlcy90eXBlX2J5X2V4dGVuc2lvbi50c1wiO1xuICpcbiAqIHR5cGVCeUV4dGVuc2lvbihcImpzXCIpOyAvLyBgYXBwbGljYXRpb24vanNvbmBcbiAqIHR5cGVCeUV4dGVuc2lvbihcIi5IVE1MXCIpOyAvLyBgdGV4dC9odG1sYFxuICogdHlwZUJ5RXh0ZW5zaW9uKFwiZm9vXCIpOyAvLyB1bmRlZmluZWRcbiAqIHR5cGVCeUV4dGVuc2lvbihcImZpbGUuanNvblwiKTsgLy8gdW5kZWZpbmVkXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHR5cGVCeUV4dGVuc2lvbihleHRlbnNpb246IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGV4dGVuc2lvbiA9IGV4dGVuc2lvbi5zdGFydHNXaXRoKFwiLlwiKSA/IGV4dGVuc2lvbi5zbGljZSgxKSA6IGV4dGVuc2lvbjtcbiAgLy8gQHRzLWlnbm9yZSB3b3JrYXJvdW5kIGFyb3VuZCBkZW5vbGFuZC9kbnQjMTQ4XG4gIHJldHVybiB0eXBlcy5nZXQoZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCkpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxQ0FBcUM7QUFFckMsU0FBUyxLQUFLLFFBQVEsV0FBVztBQUVqQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FpQkMsR0FDRCxPQUFPLFNBQVMsZ0JBQWdCLFNBQWlCO0VBQy9DLFlBQVksVUFBVSxVQUFVLENBQUMsT0FBTyxVQUFVLEtBQUssQ0FBQyxLQUFLO0VBQzdELGdEQUFnRDtFQUNoRCxPQUFPLE1BQU0sR0FBRyxDQUFDLFVBQVUsV0FBVztBQUN4QyJ9
// denoCacheMetadata=13545326270779038389,12656576560464072568