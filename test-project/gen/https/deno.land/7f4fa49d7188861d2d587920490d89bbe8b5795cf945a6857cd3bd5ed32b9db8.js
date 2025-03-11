// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { normalizeString } from "../_common/normalize_string.ts";
import { assertPath } from "../_common/assert_path.ts";
import { isPosixPathSeparator } from "./_util.ts";
/**
 * Resolves path segments into a `path`
 * @param pathSegments to process to path
 */ export function resolve(...pathSegments) {
  let resolvedPath = "";
  let resolvedAbsolute = false;
  for(let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--){
    let path;
    if (i >= 0) path = pathSegments[i];
    else {
      // deno-lint-ignore no-explicit-any
      const { Deno } = globalThis;
      if (typeof Deno?.cwd !== "function") {
        throw new TypeError("Resolved a relative path without a CWD.");
      }
      path = Deno.cwd();
    }
    assertPath(path);
    // Skip empty entries
    if (path.length === 0) {
      continue;
    }
    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = isPosixPathSeparator(path.charCodeAt(0));
  }
  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when Deno.cwd() fails)
  // Normalize the path
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator);
  if (resolvedAbsolute) {
    if (resolvedPath.length > 0) return `/${resolvedPath}`;
    else return "/";
  } else if (resolvedPath.length > 0) return resolvedPath;
  else return ".";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL3BhdGgvcG9zaXgvcmVzb2x2ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIzIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG5pbXBvcnQgeyBub3JtYWxpemVTdHJpbmcgfSBmcm9tIFwiLi4vX2NvbW1vbi9ub3JtYWxpemVfc3RyaW5nLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnRQYXRoIH0gZnJvbSBcIi4uL19jb21tb24vYXNzZXJ0X3BhdGgudHNcIjtcbmltcG9ydCB7IGlzUG9zaXhQYXRoU2VwYXJhdG9yIH0gZnJvbSBcIi4vX3V0aWwudHNcIjtcblxuLyoqXG4gKiBSZXNvbHZlcyBwYXRoIHNlZ21lbnRzIGludG8gYSBgcGF0aGBcbiAqIEBwYXJhbSBwYXRoU2VnbWVudHMgdG8gcHJvY2VzcyB0byBwYXRoXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlKC4uLnBhdGhTZWdtZW50czogc3RyaW5nW10pOiBzdHJpbmcge1xuICBsZXQgcmVzb2x2ZWRQYXRoID0gXCJcIjtcbiAgbGV0IHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKGxldCBpID0gcGF0aFNlZ21lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIGxldCBwYXRoOiBzdHJpbmc7XG5cbiAgICBpZiAoaSA+PSAwKSBwYXRoID0gcGF0aFNlZ21lbnRzW2ldO1xuICAgIGVsc2Uge1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgIGNvbnN0IHsgRGVubyB9ID0gZ2xvYmFsVGhpcyBhcyBhbnk7XG4gICAgICBpZiAodHlwZW9mIERlbm8/LmN3ZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJSZXNvbHZlZCBhIHJlbGF0aXZlIHBhdGggd2l0aG91dCBhIENXRC5cIik7XG4gICAgICB9XG4gICAgICBwYXRoID0gRGVuby5jd2QoKTtcbiAgICB9XG5cbiAgICBhc3NlcnRQYXRoKHBhdGgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBlbnRyaWVzXG4gICAgaWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBgJHtwYXRofS8ke3Jlc29sdmVkUGF0aH1gO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBpc1Bvc2l4UGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMCkpO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gRGVuby5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplU3RyaW5nKFxuICAgIHJlc29sdmVkUGF0aCxcbiAgICAhcmVzb2x2ZWRBYnNvbHV0ZSxcbiAgICBcIi9cIixcbiAgICBpc1Bvc2l4UGF0aFNlcGFyYXRvcixcbiAgKTtcblxuICBpZiAocmVzb2x2ZWRBYnNvbHV0ZSkge1xuICAgIGlmIChyZXNvbHZlZFBhdGgubGVuZ3RoID4gMCkgcmV0dXJuIGAvJHtyZXNvbHZlZFBhdGh9YDtcbiAgICBlbHNlIHJldHVybiBcIi9cIjtcbiAgfSBlbHNlIGlmIChyZXNvbHZlZFBhdGgubGVuZ3RoID4gMCkgcmV0dXJuIHJlc29sdmVkUGF0aDtcbiAgZWxzZSByZXR1cm4gXCIuXCI7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHFDQUFxQztBQUVyQyxTQUFTLGVBQWUsUUFBUSxpQ0FBaUM7QUFDakUsU0FBUyxVQUFVLFFBQVEsNEJBQTRCO0FBQ3ZELFNBQVMsb0JBQW9CLFFBQVEsYUFBYTtBQUVsRDs7O0NBR0MsR0FDRCxPQUFPLFNBQVMsUUFBUSxHQUFHLFlBQXNCO0VBQy9DLElBQUksZUFBZTtFQUNuQixJQUFJLG1CQUFtQjtFQUV2QixJQUFLLElBQUksSUFBSSxhQUFhLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsa0JBQWtCLElBQUs7SUFDdkUsSUFBSTtJQUVKLElBQUksS0FBSyxHQUFHLE9BQU8sWUFBWSxDQUFDLEVBQUU7U0FDN0I7TUFDSCxtQ0FBbUM7TUFDbkMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHO01BQ2pCLElBQUksT0FBTyxNQUFNLFFBQVEsWUFBWTtRQUNuQyxNQUFNLElBQUksVUFBVTtNQUN0QjtNQUNBLE9BQU8sS0FBSyxHQUFHO0lBQ2pCO0lBRUEsV0FBVztJQUVYLHFCQUFxQjtJQUNyQixJQUFJLEtBQUssTUFBTSxLQUFLLEdBQUc7TUFDckI7SUFDRjtJQUVBLGVBQWUsR0FBRyxLQUFLLENBQUMsRUFBRSxjQUFjO0lBQ3hDLG1CQUFtQixxQkFBcUIsS0FBSyxVQUFVLENBQUM7RUFDMUQ7RUFFQSx5RUFBeUU7RUFDekUsd0VBQXdFO0VBRXhFLHFCQUFxQjtFQUNyQixlQUFlLGdCQUNiLGNBQ0EsQ0FBQyxrQkFDRCxLQUNBO0VBR0YsSUFBSSxrQkFBa0I7SUFDcEIsSUFBSSxhQUFhLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxDQUFDLEVBQUUsY0FBYztTQUNqRCxPQUFPO0VBQ2QsT0FBTyxJQUFJLGFBQWEsTUFBTSxHQUFHLEdBQUcsT0FBTztPQUN0QyxPQUFPO0FBQ2QifQ==
// denoCacheMetadata=13849443012896364198,4641179574472799013