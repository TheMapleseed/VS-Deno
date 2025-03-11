// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/**
 * Command line arguments parser based on
 * [minimist](https://github.com/minimistjs/minimist).
 *
 * This module is browser compatible.
 *
 * @example
 * ```ts
 * import { parse } from "https://deno.land/std@$STD_VERSION/flags/mod.ts";
 *
 * console.dir(parse(Deno.args));
 * ```
 *
 * ```sh
 * $ deno run https://deno.land/std/examples/flags.ts -a beep -b boop
 * { _: [], a: 'beep', b: 'boop' }
 * ```
 *
 * ```sh
 * $ deno run https://deno.land/std/examples/flags.ts -x 3 -y 4 -n5 -abc --beep=boop foo bar baz
 * { _: [ 'foo', 'bar', 'baz' ],
 *   x: 3,
 *   y: 4,
 *   n: 5,
 *   a: true,
 *   b: true,
 *   c: true,
 *   beep: 'boop' }
 * ```
 *
 * @module
 */ import { assert } from "../assert/assert.ts";
const { hasOwn } = Object;
function get(obj, key) {
  if (hasOwn(obj, key)) {
    return obj[key];
  }
}
function getForce(obj, key) {
  const v = get(obj, key);
  assert(v !== undefined);
  return v;
}
function isNumber(x) {
  if (typeof x === "number") return true;
  if (/^0x[0-9a-f]+$/i.test(String(x))) return true;
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(String(x));
}
function hasKey(obj, keys) {
  let o = obj;
  keys.slice(0, -1).forEach((key)=>{
    o = get(o, key) ?? {};
  });
  const key = keys[keys.length - 1];
  return hasOwn(o, key);
}
/** Take a set of command line arguments, optionally with a set of options, and
 * return an object representing the flags found in the passed arguments.
 *
 * By default, any arguments starting with `-` or `--` are considered boolean
 * flags. If the argument name is followed by an equal sign (`=`) it is
 * considered a key-value pair. Any arguments which could not be parsed are
 * available in the `_` property of the returned object.
 *
 * By default, the flags module tries to determine the type of all arguments
 * automatically and the return type of the `parse` method will have an index
 * signature with `any` as value (`{ [x: string]: any }`).
 *
 * If the `string`, `boolean` or `collect` option is set, the return value of
 * the `parse` method will be fully typed and the index signature of the return
 * type will change to `{ [x: string]: unknown }`.
 *
 * Any arguments after `'--'` will not be parsed and will end up in `parsedArgs._`.
 *
 * Numeric-looking arguments will be returned as numbers unless `options.string`
 * or `options.boolean` is set for that argument name.
 *
 * @example
 * ```ts
 * import { parse } from "https://deno.land/std@$STD_VERSION/flags/mod.ts";
 * const parsedArgs = parse(Deno.args);
 * ```
 *
 * @example
 * ```ts
 * import { parse } from "https://deno.land/std@$STD_VERSION/flags/mod.ts";
 * const parsedArgs = parse(["--foo", "--bar=baz", "./quux.txt"]);
 * // parsedArgs: { foo: true, bar: "baz", _: ["./quux.txt"] }
 * ```
 */ export function parse(args, { "--": doubleDash = false, alias = {}, boolean = false, default: defaults = {}, stopEarly = false, string = [], collect = [], negatable = [], unknown = (i)=>i } = {}) {
  const aliases = {};
  const flags = {
    bools: {},
    strings: {},
    unknownFn: unknown,
    allBools: false,
    collect: {},
    negatable: {}
  };
  if (alias !== undefined) {
    for(const key in alias){
      const val = getForce(alias, key);
      if (typeof val === "string") {
        aliases[key] = [
          val
        ];
      } else {
        aliases[key] = val;
      }
      for (const alias of getForce(aliases, key)){
        aliases[alias] = [
          key
        ].concat(aliases[key].filter((y)=>alias !== y));
      }
    }
  }
  if (boolean !== undefined) {
    if (typeof boolean === "boolean") {
      flags.allBools = !!boolean;
    } else {
      const booleanArgs = typeof boolean === "string" ? [
        boolean
      ] : boolean;
      for (const key of booleanArgs.filter(Boolean)){
        flags.bools[key] = true;
        const alias = get(aliases, key);
        if (alias) {
          for (const al of alias){
            flags.bools[al] = true;
          }
        }
      }
    }
  }
  if (string !== undefined) {
    const stringArgs = typeof string === "string" ? [
      string
    ] : string;
    for (const key of stringArgs.filter(Boolean)){
      flags.strings[key] = true;
      const alias = get(aliases, key);
      if (alias) {
        for (const al of alias){
          flags.strings[al] = true;
        }
      }
    }
  }
  if (collect !== undefined) {
    const collectArgs = typeof collect === "string" ? [
      collect
    ] : collect;
    for (const key of collectArgs.filter(Boolean)){
      flags.collect[key] = true;
      const alias = get(aliases, key);
      if (alias) {
        for (const al of alias){
          flags.collect[al] = true;
        }
      }
    }
  }
  if (negatable !== undefined) {
    const negatableArgs = typeof negatable === "string" ? [
      negatable
    ] : negatable;
    for (const key of negatableArgs.filter(Boolean)){
      flags.negatable[key] = true;
      const alias = get(aliases, key);
      if (alias) {
        for (const al of alias){
          flags.negatable[al] = true;
        }
      }
    }
  }
  const argv = {
    _: []
  };
  function argDefined(key, arg) {
    return flags.allBools && /^--[^=]+$/.test(arg) || get(flags.bools, key) || !!get(flags.strings, key) || !!get(aliases, key);
  }
  function setKey(obj, name, value, collect = true) {
    let o = obj;
    const keys = name.split(".");
    keys.slice(0, -1).forEach(function(key) {
      if (get(o, key) === undefined) {
        o[key] = {};
      }
      o = get(o, key);
    });
    const key = keys[keys.length - 1];
    const collectable = collect && !!get(flags.collect, name);
    if (!collectable) {
      o[key] = value;
    } else if (get(o, key) === undefined) {
      o[key] = [
        value
      ];
    } else if (Array.isArray(get(o, key))) {
      o[key].push(value);
    } else {
      o[key] = [
        get(o, key),
        value
      ];
    }
  }
  function setArg(key, val, arg = undefined, collect) {
    if (arg && flags.unknownFn && !argDefined(key, arg)) {
      if (flags.unknownFn(arg, key, val) === false) return;
    }
    const value = !get(flags.strings, key) && isNumber(val) ? Number(val) : val;
    setKey(argv, key, value, collect);
    const alias = get(aliases, key);
    if (alias) {
      for (const x of alias){
        setKey(argv, x, value, collect);
      }
    }
  }
  function aliasIsBoolean(key) {
    return getForce(aliases, key).some((x)=>typeof get(flags.bools, x) === "boolean");
  }
  let notFlags = [];
  // all args after "--" are not parsed
  if (args.includes("--")) {
    notFlags = args.slice(args.indexOf("--") + 1);
    args = args.slice(0, args.indexOf("--"));
  }
  for(let i = 0; i < args.length; i++){
    const arg = args[i];
    if (/^--.+=/.test(arg)) {
      const m = arg.match(/^--([^=]+)=(.*)$/s);
      assert(m !== null);
      const [, key, value] = m;
      if (flags.bools[key]) {
        const booleanValue = value !== "false";
        setArg(key, booleanValue, arg);
      } else {
        setArg(key, value, arg);
      }
    } else if (/^--no-.+/.test(arg) && get(flags.negatable, arg.replace(/^--no-/, ""))) {
      const m = arg.match(/^--no-(.+)/);
      assert(m !== null);
      setArg(m[1], false, arg, false);
    } else if (/^--.+/.test(arg)) {
      const m = arg.match(/^--(.+)/);
      assert(m !== null);
      const [, key] = m;
      const next = args[i + 1];
      if (next !== undefined && !/^-/.test(next) && !get(flags.bools, key) && !flags.allBools && (get(aliases, key) ? !aliasIsBoolean(key) : true)) {
        setArg(key, next, arg);
        i++;
      } else if (/^(true|false)$/.test(next)) {
        setArg(key, next === "true", arg);
        i++;
      } else {
        setArg(key, get(flags.strings, key) ? "" : true, arg);
      }
    } else if (/^-[^-]+/.test(arg)) {
      const letters = arg.slice(1, -1).split("");
      let broken = false;
      for(let j = 0; j < letters.length; j++){
        const next = arg.slice(j + 2);
        if (next === "-") {
          setArg(letters[j], next, arg);
          continue;
        }
        if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
          setArg(letters[j], next.split(/=(.+)/)[1], arg);
          broken = true;
          break;
        }
        if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
          setArg(letters[j], next, arg);
          broken = true;
          break;
        }
        if (letters[j + 1] && letters[j + 1].match(/\W/)) {
          setArg(letters[j], arg.slice(j + 2), arg);
          broken = true;
          break;
        } else {
          setArg(letters[j], get(flags.strings, letters[j]) ? "" : true, arg);
        }
      }
      const [key] = arg.slice(-1);
      if (!broken && key !== "-") {
        if (args[i + 1] && !/^(-|--)[^-]/.test(args[i + 1]) && !get(flags.bools, key) && (get(aliases, key) ? !aliasIsBoolean(key) : true)) {
          setArg(key, args[i + 1], arg);
          i++;
        } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
          setArg(key, args[i + 1] === "true", arg);
          i++;
        } else {
          setArg(key, get(flags.strings, key) ? "" : true, arg);
        }
      }
    } else {
      if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
        argv._.push(flags.strings["_"] ?? !isNumber(arg) ? arg : Number(arg));
      }
      if (stopEarly) {
        argv._.push(...args.slice(i + 1));
        break;
      }
    }
  }
  for (const [key, value] of Object.entries(defaults)){
    if (!hasKey(argv, key.split("."))) {
      setKey(argv, key, value, false);
      if (aliases[key]) {
        for (const x of aliases[key]){
          setKey(argv, x, value, false);
        }
      }
    }
  }
  for (const key of Object.keys(flags.bools)){
    if (!hasKey(argv, key.split("."))) {
      const value = get(flags.collect, key) ? [] : false;
      setKey(argv, key, value, false);
    }
  }
  for (const key of Object.keys(flags.strings)){
    if (!hasKey(argv, key.split(".")) && get(flags.collect, key)) {
      setKey(argv, key, [], false);
    }
  }
  if (doubleDash) {
    argv["--"] = [];
    for (const key of notFlags){
      argv["--"].push(key);
    }
  } else {
    for (const key of notFlags){
      argv._.push(key);
    }
  }
  return argv;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjIwNC4wL2ZsYWdzL21vZC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIzIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG4vKipcbiAqIENvbW1hbmQgbGluZSBhcmd1bWVudHMgcGFyc2VyIGJhc2VkIG9uXG4gKiBbbWluaW1pc3RdKGh0dHBzOi8vZ2l0aHViLmNvbS9taW5pbWlzdGpzL21pbmltaXN0KS5cbiAqXG4gKiBUaGlzIG1vZHVsZSBpcyBicm93c2VyIGNvbXBhdGlibGUuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBwYXJzZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2ZsYWdzL21vZC50c1wiO1xuICpcbiAqIGNvbnNvbGUuZGlyKHBhcnNlKERlbm8uYXJncykpO1xuICogYGBgXG4gKlxuICogYGBgc2hcbiAqICQgZGVubyBydW4gaHR0cHM6Ly9kZW5vLmxhbmQvc3RkL2V4YW1wbGVzL2ZsYWdzLnRzIC1hIGJlZXAgLWIgYm9vcFxuICogeyBfOiBbXSwgYTogJ2JlZXAnLCBiOiAnYm9vcCcgfVxuICogYGBgXG4gKlxuICogYGBgc2hcbiAqICQgZGVubyBydW4gaHR0cHM6Ly9kZW5vLmxhbmQvc3RkL2V4YW1wbGVzL2ZsYWdzLnRzIC14IDMgLXkgNCAtbjUgLWFiYyAtLWJlZXA9Ym9vcCBmb28gYmFyIGJhelxuICogeyBfOiBbICdmb28nLCAnYmFyJywgJ2JheicgXSxcbiAqICAgeDogMyxcbiAqICAgeTogNCxcbiAqICAgbjogNSxcbiAqICAgYTogdHJ1ZSxcbiAqICAgYjogdHJ1ZSxcbiAqICAgYzogdHJ1ZSxcbiAqICAgYmVlcDogJ2Jvb3AnIH1cbiAqIGBgYFxuICpcbiAqIEBtb2R1bGVcbiAqL1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL2Fzc2VydC9hc3NlcnQudHNcIjtcblxuLyoqIENvbWJpbmVzIHJlY3Vyc2l2ZWx5IGFsbCBpbnRlcnNlY3Rpb24gdHlwZXMgYW5kIHJldHVybnMgYSBuZXcgc2luZ2xlIHR5cGUuICovXG50eXBlIElkPFRSZWNvcmQ+ID0gVFJlY29yZCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gID8gVFJlY29yZCBleHRlbmRzIGluZmVyIEluZmVycmVkUmVjb3JkXG4gICAgPyB7IFtLZXkgaW4ga2V5b2YgSW5mZXJyZWRSZWNvcmRdOiBJZDxJbmZlcnJlZFJlY29yZFtLZXldPiB9XG4gIDogbmV2ZXJcbiAgOiBUUmVjb3JkO1xuXG4vKiogQ29udmVydHMgYSB1bmlvbiB0eXBlIGBBIHwgQiB8IENgIGludG8gYW4gaW50ZXJzZWN0aW9uIHR5cGUgYEEgJiBCICYgQ2AuICovXG50eXBlIFVuaW9uVG9JbnRlcnNlY3Rpb248VFZhbHVlPiA9XG4gIChUVmFsdWUgZXh0ZW5kcyB1bmtub3duID8gKGFyZ3M6IFRWYWx1ZSkgPT4gdW5rbm93biA6IG5ldmVyKSBleHRlbmRzXG4gICAgKGFyZ3M6IGluZmVyIFIpID0+IHVua25vd24gPyBSIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPyBSIDogbmV2ZXJcbiAgICA6IG5ldmVyO1xuXG50eXBlIEJvb2xlYW5UeXBlID0gYm9vbGVhbiB8IHN0cmluZyB8IHVuZGVmaW5lZDtcbnR5cGUgU3RyaW5nVHlwZSA9IHN0cmluZyB8IHVuZGVmaW5lZDtcbnR5cGUgQXJnVHlwZSA9IFN0cmluZ1R5cGUgfCBCb29sZWFuVHlwZTtcblxudHlwZSBDb2xsZWN0YWJsZSA9IHN0cmluZyB8IHVuZGVmaW5lZDtcbnR5cGUgTmVnYXRhYmxlID0gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG50eXBlIFVzZVR5cGVzPFxuICBUQm9vbGVhbnMgZXh0ZW5kcyBCb29sZWFuVHlwZSxcbiAgVFN0cmluZ3MgZXh0ZW5kcyBTdHJpbmdUeXBlLFxuICBUQ29sbGVjdGFibGUgZXh0ZW5kcyBDb2xsZWN0YWJsZSxcbj4gPSB1bmRlZmluZWQgZXh0ZW5kcyAoXG4gICYgKGZhbHNlIGV4dGVuZHMgVEJvb2xlYW5zID8gdW5kZWZpbmVkIDogVEJvb2xlYW5zKVxuICAmIFRDb2xsZWN0YWJsZVxuICAmIFRTdHJpbmdzXG4pID8gZmFsc2VcbiAgOiB0cnVlO1xuXG4vKipcbiAqIENyZWF0ZXMgYSByZWNvcmQgd2l0aCBhbGwgYXZhaWxhYmxlIGZsYWdzIHdpdGggdGhlIGNvcnJlc3BvbmRpbmcgdHlwZSBhbmRcbiAqIGRlZmF1bHQgdHlwZS5cbiAqL1xudHlwZSBWYWx1ZXM8XG4gIFRCb29sZWFucyBleHRlbmRzIEJvb2xlYW5UeXBlLFxuICBUU3RyaW5ncyBleHRlbmRzIFN0cmluZ1R5cGUsXG4gIFRDb2xsZWN0YWJsZSBleHRlbmRzIENvbGxlY3RhYmxlLFxuICBUTmVnYXRhYmxlIGV4dGVuZHMgTmVnYXRhYmxlLFxuICBURGVmYXVsdCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuICBUQWxpYXNlcyBleHRlbmRzIEFsaWFzZXMgfCB1bmRlZmluZWQsXG4+ID0gVXNlVHlwZXM8VEJvb2xlYW5zLCBUU3RyaW5ncywgVENvbGxlY3RhYmxlPiBleHRlbmRzIHRydWUgP1xuICAgICYgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICAmIEFkZEFsaWFzZXM8XG4gICAgICBTcHJlYWREZWZhdWx0czxcbiAgICAgICAgJiBDb2xsZWN0VmFsdWVzPFRTdHJpbmdzLCBzdHJpbmcsIFRDb2xsZWN0YWJsZSwgVE5lZ2F0YWJsZT5cbiAgICAgICAgJiBSZWN1cnNpdmVSZXF1aXJlZDxDb2xsZWN0VmFsdWVzPFRCb29sZWFucywgYm9vbGVhbiwgVENvbGxlY3RhYmxlPj5cbiAgICAgICAgJiBDb2xsZWN0VW5rbm93blZhbHVlczxcbiAgICAgICAgICBUQm9vbGVhbnMsXG4gICAgICAgICAgVFN0cmluZ3MsXG4gICAgICAgICAgVENvbGxlY3RhYmxlLFxuICAgICAgICAgIFROZWdhdGFibGVcbiAgICAgICAgPixcbiAgICAgICAgRGVkb3RSZWNvcmQ8VERlZmF1bHQ+XG4gICAgICA+LFxuICAgICAgVEFsaWFzZXNcbiAgICA+XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIDogUmVjb3JkPHN0cmluZywgYW55PjtcblxudHlwZSBBbGlhc2VzPFRBcmdOYW1lcyA9IHN0cmluZywgVEFsaWFzTmFtZXMgZXh0ZW5kcyBzdHJpbmcgPSBzdHJpbmc+ID0gUGFydGlhbDxcbiAgUmVjb3JkPEV4dHJhY3Q8VEFyZ05hbWVzLCBzdHJpbmc+LCBUQWxpYXNOYW1lcyB8IFJlYWRvbmx5QXJyYXk8VEFsaWFzTmFtZXM+PlxuPjtcblxudHlwZSBBZGRBbGlhc2VzPFxuICBUQXJncyxcbiAgVEFsaWFzZXMgZXh0ZW5kcyBBbGlhc2VzIHwgdW5kZWZpbmVkLFxuPiA9IHtcbiAgW1RBcmdOYW1lIGluIGtleW9mIFRBcmdzIGFzIEFsaWFzTmFtZXM8VEFyZ05hbWUsIFRBbGlhc2VzPl06IFRBcmdzW1RBcmdOYW1lXTtcbn07XG5cbnR5cGUgQWxpYXNOYW1lczxcbiAgVEFyZ05hbWUsXG4gIFRBbGlhc2VzIGV4dGVuZHMgQWxpYXNlcyB8IHVuZGVmaW5lZCxcbj4gPSBUQXJnTmFtZSBleHRlbmRzIGtleW9mIFRBbGlhc2VzXG4gID8gc3RyaW5nIGV4dGVuZHMgVEFsaWFzZXNbVEFyZ05hbWVdID8gVEFyZ05hbWVcbiAgOiBUQWxpYXNlc1tUQXJnTmFtZV0gZXh0ZW5kcyBzdHJpbmcgPyBUQXJnTmFtZSB8IFRBbGlhc2VzW1RBcmdOYW1lXVxuICA6IFRBbGlhc2VzW1RBcmdOYW1lXSBleHRlbmRzIEFycmF5PHN0cmluZz5cbiAgICA/IFRBcmdOYW1lIHwgVEFsaWFzZXNbVEFyZ05hbWVdW251bWJlcl1cbiAgOiBUQXJnTmFtZVxuICA6IFRBcmdOYW1lO1xuXG4vKipcbiAqIFNwcmVhZHMgYWxsIGRlZmF1bHQgdmFsdWVzIG9mIFJlY29yZCBgVERlZmF1bHRzYCBpbnRvIFJlY29yZCBgVEFyZ3NgXG4gKiBhbmQgbWFrZXMgZGVmYXVsdCB2YWx1ZXMgcmVxdWlyZWQuXG4gKlxuICogKipFeGFtcGxlOioqXG4gKiBgU3ByZWFkVmFsdWVzPHsgZm9vPzogYm9vbGVhbiwgYmFyPzogbnVtYmVyIH0sIHsgZm9vOiBudW1iZXIgfT5gXG4gKlxuICogKipSZXN1bHQ6KiogYHsgZm9vOiBib29sZWFuIHwgbnVtYmVyLCBiYXI/OiBudW1iZXIgfWBcbiAqL1xudHlwZSBTcHJlYWREZWZhdWx0czxUQXJncywgVERlZmF1bHRzPiA9IFREZWZhdWx0cyBleHRlbmRzIHVuZGVmaW5lZCA/IFRBcmdzXG4gIDogVEFyZ3MgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA/XG4gICAgICAmIE9taXQ8VEFyZ3MsIGtleW9mIFREZWZhdWx0cz5cbiAgICAgICYge1xuICAgICAgICBbRGVmYXVsdCBpbiBrZXlvZiBURGVmYXVsdHNdOiBEZWZhdWx0IGV4dGVuZHMga2V5b2YgVEFyZ3NcbiAgICAgICAgICA/IChUQXJnc1tEZWZhdWx0XSAmIFREZWZhdWx0c1tEZWZhdWx0XSB8IFREZWZhdWx0c1tEZWZhdWx0XSkgZXh0ZW5kc1xuICAgICAgICAgICAgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICAgICAgICAgID8gTm9uTnVsbGFibGU8U3ByZWFkRGVmYXVsdHM8VEFyZ3NbRGVmYXVsdF0sIFREZWZhdWx0c1tEZWZhdWx0XT4+XG4gICAgICAgICAgOiBURGVmYXVsdHNbRGVmYXVsdF0gfCBOb25OdWxsYWJsZTxUQXJnc1tEZWZhdWx0XT5cbiAgICAgICAgICA6IHVua25vd247XG4gICAgICB9XG4gIDogbmV2ZXI7XG5cbi8qKlxuICogRGVmaW5lcyB0aGUgUmVjb3JkIGZvciB0aGUgYGRlZmF1bHRgIG9wdGlvbiB0byBhZGRcbiAqIGF1dG8tc3VnZ2VzdGlvbiBzdXBwb3J0IGZvciBJREUncy5cbiAqL1xudHlwZSBEZWZhdWx0czxUQm9vbGVhbnMgZXh0ZW5kcyBCb29sZWFuVHlwZSwgVFN0cmluZ3MgZXh0ZW5kcyBTdHJpbmdUeXBlPiA9IElkPFxuICBVbmlvblRvSW50ZXJzZWN0aW9uPFxuICAgICYgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICAvLyBEZWRvdHRlZCBhdXRvIHN1Z2dlc3Rpb25zOiB7IGZvbzogeyBiYXI6IHVua25vd24gfSB9XG4gICAgJiBNYXBUeXBlczxUU3RyaW5ncywgdW5rbm93bj5cbiAgICAmIE1hcFR5cGVzPFRCb29sZWFucywgdW5rbm93bj5cbiAgICAvLyBGbGF0IGF1dG8gc3VnZ2VzdGlvbnM6IHsgXCJmb28uYmFyXCI6IHVua25vd24gfVxuICAgICYgTWFwRGVmYXVsdHM8VEJvb2xlYW5zPlxuICAgICYgTWFwRGVmYXVsdHM8VFN0cmluZ3M+XG4gID5cbj47XG5cbnR5cGUgTWFwRGVmYXVsdHM8VEFyZ05hbWVzIGV4dGVuZHMgQXJnVHlwZT4gPSBQYXJ0aWFsPFxuICBSZWNvcmQ8VEFyZ05hbWVzIGV4dGVuZHMgc3RyaW5nID8gVEFyZ05hbWVzIDogc3RyaW5nLCB1bmtub3duPlxuPjtcblxudHlwZSBSZWN1cnNpdmVSZXF1aXJlZDxUUmVjb3JkPiA9IFRSZWNvcmQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA/IHtcbiAgICBbS2V5IGluIGtleW9mIFRSZWNvcmRdLT86IFJlY3Vyc2l2ZVJlcXVpcmVkPFRSZWNvcmRbS2V5XT47XG4gIH1cbiAgOiBUUmVjb3JkO1xuXG4vKiogU2FtZSBhcyBgTWFwVHlwZXNgIGJ1dCBhbHNvIHN1cHBvcnRzIGNvbGxlY3RhYmxlIG9wdGlvbnMuICovXG50eXBlIENvbGxlY3RWYWx1ZXM8XG4gIFRBcmdOYW1lcyBleHRlbmRzIEFyZ1R5cGUsXG4gIFRUeXBlLFxuICBUQ29sbGVjdGFibGUgZXh0ZW5kcyBDb2xsZWN0YWJsZSxcbiAgVE5lZ2F0YWJsZSBleHRlbmRzIE5lZ2F0YWJsZSA9IHVuZGVmaW5lZCxcbj4gPSBVbmlvblRvSW50ZXJzZWN0aW9uPFxuICBFeHRyYWN0PFRBcmdOYW1lcywgVENvbGxlY3RhYmxlPiBleHRlbmRzIHN0cmluZyA/XG4gICAgICAmIChFeGNsdWRlPFRBcmdOYW1lcywgVENvbGxlY3RhYmxlPiBleHRlbmRzIG5ldmVyID8gUmVjb3JkPG5ldmVyLCBuZXZlcj5cbiAgICAgICAgOiBNYXBUeXBlczxFeGNsdWRlPFRBcmdOYW1lcywgVENvbGxlY3RhYmxlPiwgVFR5cGUsIFROZWdhdGFibGU+KVxuICAgICAgJiAoRXh0cmFjdDxUQXJnTmFtZXMsIFRDb2xsZWN0YWJsZT4gZXh0ZW5kcyBuZXZlciA/IFJlY29yZDxuZXZlciwgbmV2ZXI+XG4gICAgICAgIDogUmVjdXJzaXZlUmVxdWlyZWQ8XG4gICAgICAgICAgTWFwVHlwZXM8RXh0cmFjdDxUQXJnTmFtZXMsIFRDb2xsZWN0YWJsZT4sIEFycmF5PFRUeXBlPiwgVE5lZ2F0YWJsZT5cbiAgICAgICAgPilcbiAgICA6IE1hcFR5cGVzPFRBcmdOYW1lcywgVFR5cGUsIFROZWdhdGFibGU+XG4+O1xuXG4vKiogU2FtZSBhcyBgUmVjb3JkYCBidXQgYWxzbyBzdXBwb3J0cyBkb3R0ZWQgYW5kIG5lZ2F0YWJsZSBvcHRpb25zLiAqL1xudHlwZSBNYXBUeXBlczxcbiAgVEFyZ05hbWVzIGV4dGVuZHMgQXJnVHlwZSxcbiAgVFR5cGUsXG4gIFROZWdhdGFibGUgZXh0ZW5kcyBOZWdhdGFibGUgPSB1bmRlZmluZWQsXG4+ID0gdW5kZWZpbmVkIGV4dGVuZHMgVEFyZ05hbWVzID8gUmVjb3JkPG5ldmVyLCBuZXZlcj5cbiAgOiBUQXJnTmFtZXMgZXh0ZW5kcyBgJHtpbmZlciBOYW1lfS4ke2luZmVyIFJlc3R9YCA/IHtcbiAgICAgIFtLZXkgaW4gTmFtZV0/OiBNYXBUeXBlczxcbiAgICAgICAgUmVzdCxcbiAgICAgICAgVFR5cGUsXG4gICAgICAgIFROZWdhdGFibGUgZXh0ZW5kcyBgJHtOYW1lfS4ke2luZmVyIE5lZ2F0ZX1gID8gTmVnYXRlIDogdW5kZWZpbmVkXG4gICAgICA+O1xuICAgIH1cbiAgOiBUQXJnTmFtZXMgZXh0ZW5kcyBzdHJpbmcgPyBQYXJ0aWFsPFxuICAgICAgUmVjb3JkPFRBcmdOYW1lcywgVE5lZ2F0YWJsZSBleHRlbmRzIFRBcmdOYW1lcyA/IFRUeXBlIHwgZmFsc2UgOiBUVHlwZT5cbiAgICA+XG4gIDogUmVjb3JkPG5ldmVyLCBuZXZlcj47XG5cbnR5cGUgQ29sbGVjdFVua25vd25WYWx1ZXM8XG4gIFRCb29sZWFucyBleHRlbmRzIEJvb2xlYW5UeXBlLFxuICBUU3RyaW5ncyBleHRlbmRzIFN0cmluZ1R5cGUsXG4gIFRDb2xsZWN0YWJsZSBleHRlbmRzIENvbGxlY3RhYmxlLFxuICBUTmVnYXRhYmxlIGV4dGVuZHMgTmVnYXRhYmxlLFxuPiA9IFVuaW9uVG9JbnRlcnNlY3Rpb248XG4gIFRDb2xsZWN0YWJsZSBleHRlbmRzIFRCb29sZWFucyAmIFRTdHJpbmdzID8gUmVjb3JkPG5ldmVyLCBuZXZlcj5cbiAgICA6IERlZG90UmVjb3JkPFxuICAgICAgLy8gVW5rbm93biBjb2xsZWN0YWJsZSAmIG5vbi1uZWdhdGFibGUgYXJncy5cbiAgICAgICYgUmVjb3JkPFxuICAgICAgICBFeGNsdWRlPFxuICAgICAgICAgIEV4dHJhY3Q8RXhjbHVkZTxUQ29sbGVjdGFibGUsIFROZWdhdGFibGU+LCBzdHJpbmc+LFxuICAgICAgICAgIEV4dHJhY3Q8VFN0cmluZ3MgfCBUQm9vbGVhbnMsIHN0cmluZz5cbiAgICAgICAgPixcbiAgICAgICAgQXJyYXk8dW5rbm93bj5cbiAgICAgID5cbiAgICAgIC8vIFVua25vd24gY29sbGVjdGFibGUgJiBuZWdhdGFibGUgYXJncy5cbiAgICAgICYgUmVjb3JkPFxuICAgICAgICBFeGNsdWRlPFxuICAgICAgICAgIEV4dHJhY3Q8RXh0cmFjdDxUQ29sbGVjdGFibGUsIFROZWdhdGFibGU+LCBzdHJpbmc+LFxuICAgICAgICAgIEV4dHJhY3Q8VFN0cmluZ3MgfCBUQm9vbGVhbnMsIHN0cmluZz5cbiAgICAgICAgPixcbiAgICAgICAgQXJyYXk8dW5rbm93bj4gfCBmYWxzZVxuICAgICAgPlxuICAgID5cbj47XG5cbi8qKiBDb252ZXJ0cyBgeyBcImZvby5iYXIuYmF6XCI6IHVua25vd24gfWAgaW50byBgeyBmb286IHsgYmFyOiB7IGJhejogdW5rbm93biB9IH0gfWAuICovXG50eXBlIERlZG90UmVjb3JkPFRSZWNvcmQ+ID0gUmVjb3JkPHN0cmluZywgdW5rbm93bj4gZXh0ZW5kcyBUUmVjb3JkID8gVFJlY29yZFxuICA6IFRSZWNvcmQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA/IFVuaW9uVG9JbnRlcnNlY3Rpb248XG4gICAgICBWYWx1ZU9mPFxuICAgICAgICB7XG4gICAgICAgICAgW0tleSBpbiBrZXlvZiBUUmVjb3JkXTogS2V5IGV4dGVuZHMgc3RyaW5nID8gRGVkb3Q8S2V5LCBUUmVjb3JkW0tleV0+XG4gICAgICAgICAgICA6IG5ldmVyO1xuICAgICAgICB9XG4gICAgICA+XG4gICAgPlxuICA6IFRSZWNvcmQ7XG5cbnR5cGUgRGVkb3Q8VEtleSBleHRlbmRzIHN0cmluZywgVFZhbHVlPiA9IFRLZXkgZXh0ZW5kc1xuICBgJHtpbmZlciBOYW1lfS4ke2luZmVyIFJlc3R9YCA/IHsgW0tleSBpbiBOYW1lXTogRGVkb3Q8UmVzdCwgVFZhbHVlPiB9XG4gIDogeyBbS2V5IGluIFRLZXldOiBUVmFsdWUgfTtcblxudHlwZSBWYWx1ZU9mPFRWYWx1ZT4gPSBUVmFsdWVba2V5b2YgVFZhbHVlXTtcblxuLyoqIFRoZSB2YWx1ZSByZXR1cm5lZCBmcm9tIGBwYXJzZWAuICovXG5leHBvcnQgdHlwZSBBcmdzPFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBUQXJncyBleHRlbmRzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gUmVjb3JkPHN0cmluZywgYW55PixcbiAgVERvdWJsZURhc2ggZXh0ZW5kcyBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuPiA9IElkPFxuICAmIFRBcmdzXG4gICYge1xuICAgIC8qKiBDb250YWlucyBhbGwgdGhlIGFyZ3VtZW50cyB0aGF0IGRpZG4ndCBoYXZlIGFuIG9wdGlvbiBhc3NvY2lhdGVkIHdpdGhcbiAgICAgKiB0aGVtLiAqL1xuICAgIF86IEFycmF5PHN0cmluZyB8IG51bWJlcj47XG4gIH1cbiAgJiAoYm9vbGVhbiBleHRlbmRzIFREb3VibGVEYXNoID8gRG91YmxlRGFzaFxuICAgIDogdHJ1ZSBleHRlbmRzIFREb3VibGVEYXNoID8gUmVxdWlyZWQ8RG91YmxlRGFzaD5cbiAgICA6IFJlY29yZDxuZXZlciwgbmV2ZXI+KVxuPjtcblxudHlwZSBEb3VibGVEYXNoID0ge1xuICAvKiogQ29udGFpbnMgYWxsIHRoZSBhcmd1bWVudHMgdGhhdCBhcHBlYXIgYWZ0ZXIgdGhlIGRvdWJsZSBkYXNoOiBcIi0tXCIuICovXG4gIFwiLS1cIj86IEFycmF5PHN0cmluZz47XG59O1xuXG4vKiogVGhlIG9wdGlvbnMgZm9yIHRoZSBgcGFyc2VgIGNhbGwuICovXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlT3B0aW9uczxcbiAgVEJvb2xlYW5zIGV4dGVuZHMgQm9vbGVhblR5cGUgPSBCb29sZWFuVHlwZSxcbiAgVFN0cmluZ3MgZXh0ZW5kcyBTdHJpbmdUeXBlID0gU3RyaW5nVHlwZSxcbiAgVENvbGxlY3RhYmxlIGV4dGVuZHMgQ29sbGVjdGFibGUgPSBDb2xsZWN0YWJsZSxcbiAgVE5lZ2F0YWJsZSBleHRlbmRzIE5lZ2F0YWJsZSA9IE5lZ2F0YWJsZSxcbiAgVERlZmF1bHQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCA9XG4gICAgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICAgIHwgdW5kZWZpbmVkLFxuICBUQWxpYXNlcyBleHRlbmRzIEFsaWFzZXMgfCB1bmRlZmluZWQgPSBBbGlhc2VzIHwgdW5kZWZpbmVkLFxuICBURG91YmxlRGFzaCBleHRlbmRzIGJvb2xlYW4gfCB1bmRlZmluZWQgPSBib29sZWFuIHwgdW5kZWZpbmVkLFxuPiB7XG4gIC8qKlxuICAgKiBXaGVuIGB0cnVlYCwgcG9wdWxhdGUgdGhlIHJlc3VsdCBgX2Agd2l0aCBldmVyeXRoaW5nIGJlZm9yZSB0aGUgYC0tYCBhbmRcbiAgICogdGhlIHJlc3VsdCBgWyctLSddYCB3aXRoIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGAtLWAuXG4gICAqXG4gICAqIEBkZWZhdWx0IHtmYWxzZX1cbiAgICpcbiAgICogIEBleGFtcGxlXG4gICAqIGBgYHRzXG4gICAqIC8vICQgZGVubyBydW4gZXhhbXBsZS50cyAtLSBhIGFyZzFcbiAgICogaW1wb3J0IHsgcGFyc2UgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9mbGFncy9tb2QudHNcIjtcbiAgICogY29uc29sZS5kaXIocGFyc2UoRGVuby5hcmdzLCB7IFwiLS1cIjogZmFsc2UgfSkpO1xuICAgKiAvLyBvdXRwdXQ6IHsgXzogWyBcImFcIiwgXCJhcmcxXCIgXSB9XG4gICAqIGNvbnNvbGUuZGlyKHBhcnNlKERlbm8uYXJncywgeyBcIi0tXCI6IHRydWUgfSkpO1xuICAgKiAvLyBvdXRwdXQ6IHsgXzogW10sIC0tOiBbIFwiYVwiLCBcImFyZzFcIiBdIH1cbiAgICogYGBgXG4gICAqL1xuICBcIi0tXCI/OiBURG91YmxlRGFzaDtcblxuICAvKipcbiAgICogQW4gb2JqZWN0IG1hcHBpbmcgc3RyaW5nIG5hbWVzIHRvIHN0cmluZ3Mgb3IgYXJyYXlzIG9mIHN0cmluZyBhcmd1bWVudFxuICAgKiBuYW1lcyB0byB1c2UgYXMgYWxpYXNlcy5cbiAgICovXG4gIGFsaWFzPzogVEFsaWFzZXM7XG5cbiAgLyoqXG4gICAqIEEgYm9vbGVhbiwgc3RyaW5nIG9yIGFycmF5IG9mIHN0cmluZ3MgdG8gYWx3YXlzIHRyZWF0IGFzIGJvb2xlYW5zLiBJZlxuICAgKiBgdHJ1ZWAgd2lsbCB0cmVhdCBhbGwgZG91YmxlIGh5cGhlbmF0ZWQgYXJndW1lbnRzIHdpdGhvdXQgZXF1YWwgc2lnbnMgYXNcbiAgICogYGJvb2xlYW5gIChlLmcuIGFmZmVjdHMgYC0tZm9vYCwgbm90IGAtZmAgb3IgYC0tZm9vPWJhcmApLlxuICAgKiAgQWxsIGBib29sZWFuYCBhcmd1bWVudHMgd2lsbCBiZSBzZXQgdG8gYGZhbHNlYCBieSBkZWZhdWx0LlxuICAgKi9cbiAgYm9vbGVhbj86IFRCb29sZWFucyB8IFJlYWRvbmx5QXJyYXk8RXh0cmFjdDxUQm9vbGVhbnMsIHN0cmluZz4+O1xuXG4gIC8qKiBBbiBvYmplY3QgbWFwcGluZyBzdHJpbmcgYXJndW1lbnQgbmFtZXMgdG8gZGVmYXVsdCB2YWx1ZXMuICovXG4gIGRlZmF1bHQ/OiBURGVmYXVsdCAmIERlZmF1bHRzPFRCb29sZWFucywgVFN0cmluZ3M+O1xuXG4gIC8qKlxuICAgKiBXaGVuIGB0cnVlYCwgcG9wdWxhdGUgdGhlIHJlc3VsdCBgX2Agd2l0aCBldmVyeXRoaW5nIGFmdGVyIHRoZSBmaXJzdFxuICAgKiBub24tb3B0aW9uLlxuICAgKi9cbiAgc3RvcEVhcmx5PzogYm9vbGVhbjtcblxuICAvKiogQSBzdHJpbmcgb3IgYXJyYXkgb2Ygc3RyaW5ncyBhcmd1bWVudCBuYW1lcyB0byBhbHdheXMgdHJlYXQgYXMgc3RyaW5ncy4gKi9cbiAgc3RyaW5nPzogVFN0cmluZ3MgfCBSZWFkb25seUFycmF5PEV4dHJhY3Q8VFN0cmluZ3MsIHN0cmluZz4+O1xuXG4gIC8qKlxuICAgKiBBIHN0cmluZyBvciBhcnJheSBvZiBzdHJpbmdzIGFyZ3VtZW50IG5hbWVzIHRvIGFsd2F5cyB0cmVhdCBhcyBhcnJheXMuXG4gICAqIENvbGxlY3RhYmxlIG9wdGlvbnMgY2FuIGJlIHVzZWQgbXVsdGlwbGUgdGltZXMuIEFsbCB2YWx1ZXMgd2lsbCBiZVxuICAgKiBjb2xsZWN0ZWQgaW50byBvbmUgYXJyYXkuIElmIGEgbm9uLWNvbGxlY3RhYmxlIG9wdGlvbiBpcyB1c2VkIG11bHRpcGxlXG4gICAqIHRpbWVzLCB0aGUgbGFzdCB2YWx1ZSBpcyB1c2VkLlxuICAgKiBBbGwgQ29sbGVjdGFibGUgYXJndW1lbnRzIHdpbGwgYmUgc2V0IHRvIGBbXWAgYnkgZGVmYXVsdC5cbiAgICovXG4gIGNvbGxlY3Q/OiBUQ29sbGVjdGFibGUgfCBSZWFkb25seUFycmF5PEV4dHJhY3Q8VENvbGxlY3RhYmxlLCBzdHJpbmc+PjtcblxuICAvKipcbiAgICogQSBzdHJpbmcgb3IgYXJyYXkgb2Ygc3RyaW5ncyBhcmd1bWVudCBuYW1lcyB3aGljaCBjYW4gYmUgbmVnYXRlZFxuICAgKiBieSBwcmVmaXhpbmcgdGhlbSB3aXRoIGAtLW5vLWAsIGxpa2UgYC0tbm8tY29uZmlnYC5cbiAgICovXG4gIG5lZ2F0YWJsZT86IFROZWdhdGFibGUgfCBSZWFkb25seUFycmF5PEV4dHJhY3Q8VE5lZ2F0YWJsZSwgc3RyaW5nPj47XG5cbiAgLyoqXG4gICAqIEEgZnVuY3Rpb24gd2hpY2ggaXMgaW52b2tlZCB3aXRoIGEgY29tbWFuZCBsaW5lIHBhcmFtZXRlciBub3QgZGVmaW5lZCBpblxuICAgKiB0aGUgYG9wdGlvbnNgIGNvbmZpZ3VyYXRpb24gb2JqZWN0LiBJZiB0aGUgZnVuY3Rpb24gcmV0dXJucyBgZmFsc2VgLCB0aGVcbiAgICogdW5rbm93biBvcHRpb24gaXMgbm90IGFkZGVkIHRvIGBwYXJzZWRBcmdzYC5cbiAgICovXG4gIHVua25vd24/OiAoYXJnOiBzdHJpbmcsIGtleT86IHN0cmluZywgdmFsdWU/OiB1bmtub3duKSA9PiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgRmxhZ3Mge1xuICBib29sczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gIHN0cmluZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuICBjb2xsZWN0OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgbmVnYXRhYmxlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgdW5rbm93bkZuOiAoYXJnOiBzdHJpbmcsIGtleT86IHN0cmluZywgdmFsdWU/OiB1bmtub3duKSA9PiB1bmtub3duO1xuICBhbGxCb29sczogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIE5lc3RlZE1hcHBpbmcge1xuICBba2V5OiBzdHJpbmddOiBOZXN0ZWRNYXBwaW5nIHwgdW5rbm93bjtcbn1cblxuY29uc3QgeyBoYXNPd24gfSA9IE9iamVjdDtcblxuZnVuY3Rpb24gZ2V0PFRWYWx1ZT4oXG4gIG9iajogUmVjb3JkPHN0cmluZywgVFZhbHVlPixcbiAga2V5OiBzdHJpbmcsXG4pOiBUVmFsdWUgfCB1bmRlZmluZWQge1xuICBpZiAoaGFzT3duKG9iaiwga2V5KSkge1xuICAgIHJldHVybiBvYmpba2V5XTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRGb3JjZTxUVmFsdWU+KG9iajogUmVjb3JkPHN0cmluZywgVFZhbHVlPiwga2V5OiBzdHJpbmcpOiBUVmFsdWUge1xuICBjb25zdCB2ID0gZ2V0KG9iaiwga2V5KTtcbiAgYXNzZXJ0KHYgIT09IHVuZGVmaW5lZCk7XG4gIHJldHVybiB2O1xufVxuXG5mdW5jdGlvbiBpc051bWJlcih4OiB1bmtub3duKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgeCA9PT0gXCJudW1iZXJcIikgcmV0dXJuIHRydWU7XG4gIGlmICgvXjB4WzAtOWEtZl0rJC9pLnRlc3QoU3RyaW5nKHgpKSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiAvXlstK10/KD86XFxkKyg/OlxcLlxcZCopP3xcXC5cXGQrKShlWy0rXT9cXGQrKT8kLy50ZXN0KFN0cmluZyh4KSk7XG59XG5cbmZ1bmN0aW9uIGhhc0tleShvYmo6IE5lc3RlZE1hcHBpbmcsIGtleXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gIGxldCBvID0gb2JqO1xuICBrZXlzLnNsaWNlKDAsIC0xKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBvID0gKGdldChvLCBrZXkpID8/IHt9KSBhcyBOZXN0ZWRNYXBwaW5nO1xuICB9KTtcblxuICBjb25zdCBrZXkgPSBrZXlzW2tleXMubGVuZ3RoIC0gMV07XG4gIHJldHVybiBoYXNPd24obywga2V5KTtcbn1cblxuLyoqIFRha2UgYSBzZXQgb2YgY29tbWFuZCBsaW5lIGFyZ3VtZW50cywgb3B0aW9uYWxseSB3aXRoIGEgc2V0IG9mIG9wdGlvbnMsIGFuZFxuICogcmV0dXJuIGFuIG9iamVjdCByZXByZXNlbnRpbmcgdGhlIGZsYWdzIGZvdW5kIGluIHRoZSBwYXNzZWQgYXJndW1lbnRzLlxuICpcbiAqIEJ5IGRlZmF1bHQsIGFueSBhcmd1bWVudHMgc3RhcnRpbmcgd2l0aCBgLWAgb3IgYC0tYCBhcmUgY29uc2lkZXJlZCBib29sZWFuXG4gKiBmbGFncy4gSWYgdGhlIGFyZ3VtZW50IG5hbWUgaXMgZm9sbG93ZWQgYnkgYW4gZXF1YWwgc2lnbiAoYD1gKSBpdCBpc1xuICogY29uc2lkZXJlZCBhIGtleS12YWx1ZSBwYWlyLiBBbnkgYXJndW1lbnRzIHdoaWNoIGNvdWxkIG5vdCBiZSBwYXJzZWQgYXJlXG4gKiBhdmFpbGFibGUgaW4gdGhlIGBfYCBwcm9wZXJ0eSBvZiB0aGUgcmV0dXJuZWQgb2JqZWN0LlxuICpcbiAqIEJ5IGRlZmF1bHQsIHRoZSBmbGFncyBtb2R1bGUgdHJpZXMgdG8gZGV0ZXJtaW5lIHRoZSB0eXBlIG9mIGFsbCBhcmd1bWVudHNcbiAqIGF1dG9tYXRpY2FsbHkgYW5kIHRoZSByZXR1cm4gdHlwZSBvZiB0aGUgYHBhcnNlYCBtZXRob2Qgd2lsbCBoYXZlIGFuIGluZGV4XG4gKiBzaWduYXR1cmUgd2l0aCBgYW55YCBhcyB2YWx1ZSAoYHsgW3g6IHN0cmluZ106IGFueSB9YCkuXG4gKlxuICogSWYgdGhlIGBzdHJpbmdgLCBgYm9vbGVhbmAgb3IgYGNvbGxlY3RgIG9wdGlvbiBpcyBzZXQsIHRoZSByZXR1cm4gdmFsdWUgb2ZcbiAqIHRoZSBgcGFyc2VgIG1ldGhvZCB3aWxsIGJlIGZ1bGx5IHR5cGVkIGFuZCB0aGUgaW5kZXggc2lnbmF0dXJlIG9mIHRoZSByZXR1cm5cbiAqIHR5cGUgd2lsbCBjaGFuZ2UgdG8gYHsgW3g6IHN0cmluZ106IHVua25vd24gfWAuXG4gKlxuICogQW55IGFyZ3VtZW50cyBhZnRlciBgJy0tJ2Agd2lsbCBub3QgYmUgcGFyc2VkIGFuZCB3aWxsIGVuZCB1cCBpbiBgcGFyc2VkQXJncy5fYC5cbiAqXG4gKiBOdW1lcmljLWxvb2tpbmcgYXJndW1lbnRzIHdpbGwgYmUgcmV0dXJuZWQgYXMgbnVtYmVycyB1bmxlc3MgYG9wdGlvbnMuc3RyaW5nYFxuICogb3IgYG9wdGlvbnMuYm9vbGVhbmAgaXMgc2V0IGZvciB0aGF0IGFyZ3VtZW50IG5hbWUuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBwYXJzZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2ZsYWdzL21vZC50c1wiO1xuICogY29uc3QgcGFyc2VkQXJncyA9IHBhcnNlKERlbm8uYXJncyk7XG4gKiBgYGBcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHNcbiAqIGltcG9ydCB7IHBhcnNlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vZmxhZ3MvbW9kLnRzXCI7XG4gKiBjb25zdCBwYXJzZWRBcmdzID0gcGFyc2UoW1wiLS1mb29cIiwgXCItLWJhcj1iYXpcIiwgXCIuL3F1dXgudHh0XCJdKTtcbiAqIC8vIHBhcnNlZEFyZ3M6IHsgZm9vOiB0cnVlLCBiYXI6IFwiYmF6XCIsIF86IFtcIi4vcXV1eC50eHRcIl0gfVxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZTxcbiAgVEFyZ3MgZXh0ZW5kcyBWYWx1ZXM8XG4gICAgVEJvb2xlYW5zLFxuICAgIFRTdHJpbmdzLFxuICAgIFRDb2xsZWN0YWJsZSxcbiAgICBUTmVnYXRhYmxlLFxuICAgIFREZWZhdWx0cyxcbiAgICBUQWxpYXNlc1xuICA+LFxuICBURG91YmxlRGFzaCBleHRlbmRzIGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG4gIFRCb29sZWFucyBleHRlbmRzIEJvb2xlYW5UeXBlID0gdW5kZWZpbmVkLFxuICBUU3RyaW5ncyBleHRlbmRzIFN0cmluZ1R5cGUgPSB1bmRlZmluZWQsXG4gIFRDb2xsZWN0YWJsZSBleHRlbmRzIENvbGxlY3RhYmxlID0gdW5kZWZpbmVkLFxuICBUTmVnYXRhYmxlIGV4dGVuZHMgTmVnYXRhYmxlID0gdW5kZWZpbmVkLFxuICBURGVmYXVsdHMgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcbiAgVEFsaWFzZXMgZXh0ZW5kcyBBbGlhc2VzPFRBbGlhc0FyZ05hbWVzLCBUQWxpYXNOYW1lcz4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG4gIFRBbGlhc0FyZ05hbWVzIGV4dGVuZHMgc3RyaW5nID0gc3RyaW5nLFxuICBUQWxpYXNOYW1lcyBleHRlbmRzIHN0cmluZyA9IHN0cmluZyxcbj4oXG4gIGFyZ3M6IHN0cmluZ1tdLFxuICB7XG4gICAgXCItLVwiOiBkb3VibGVEYXNoID0gZmFsc2UsXG4gICAgYWxpYXMgPSB7fSBhcyBOb25OdWxsYWJsZTxUQWxpYXNlcz4sXG4gICAgYm9vbGVhbiA9IGZhbHNlLFxuICAgIGRlZmF1bHQ6IGRlZmF1bHRzID0ge30gYXMgVERlZmF1bHRzICYgRGVmYXVsdHM8VEJvb2xlYW5zLCBUU3RyaW5ncz4sXG4gICAgc3RvcEVhcmx5ID0gZmFsc2UsXG4gICAgc3RyaW5nID0gW10sXG4gICAgY29sbGVjdCA9IFtdLFxuICAgIG5lZ2F0YWJsZSA9IFtdLFxuICAgIHVua25vd24gPSAoaTogc3RyaW5nKTogdW5rbm93biA9PiBpLFxuICB9OiBQYXJzZU9wdGlvbnM8XG4gICAgVEJvb2xlYW5zLFxuICAgIFRTdHJpbmdzLFxuICAgIFRDb2xsZWN0YWJsZSxcbiAgICBUTmVnYXRhYmxlLFxuICAgIFREZWZhdWx0cyxcbiAgICBUQWxpYXNlcyxcbiAgICBURG91YmxlRGFzaFxuICA+ID0ge30sXG4pOiBBcmdzPFRBcmdzLCBURG91YmxlRGFzaD4ge1xuICBjb25zdCBhbGlhc2VzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gPSB7fTtcbiAgY29uc3QgZmxhZ3M6IEZsYWdzID0ge1xuICAgIGJvb2xzOiB7fSxcbiAgICBzdHJpbmdzOiB7fSxcbiAgICB1bmtub3duRm46IHVua25vd24sXG4gICAgYWxsQm9vbHM6IGZhbHNlLFxuICAgIGNvbGxlY3Q6IHt9LFxuICAgIG5lZ2F0YWJsZToge30sXG4gIH07XG5cbiAgaWYgKGFsaWFzICE9PSB1bmRlZmluZWQpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBhbGlhcykge1xuICAgICAgY29uc3QgdmFsID0gZ2V0Rm9yY2UoYWxpYXMsIGtleSk7XG4gICAgICBpZiAodHlwZW9mIHZhbCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBhbGlhc2VzW2tleV0gPSBbdmFsXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFsaWFzZXNba2V5XSA9IHZhbCBhcyBBcnJheTxzdHJpbmc+O1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBhbGlhcyBvZiBnZXRGb3JjZShhbGlhc2VzLCBrZXkpKSB7XG4gICAgICAgIGFsaWFzZXNbYWxpYXNdID0gW2tleV0uY29uY2F0KGFsaWFzZXNba2V5XS5maWx0ZXIoKHkpID0+IGFsaWFzICE9PSB5KSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGJvb2xlYW4gIT09IHVuZGVmaW5lZCkge1xuICAgIGlmICh0eXBlb2YgYm9vbGVhbiA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgIGZsYWdzLmFsbEJvb2xzID0gISFib29sZWFuO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBib29sZWFuQXJnczogUmVhZG9ubHlBcnJheTxzdHJpbmc+ID0gdHlwZW9mIGJvb2xlYW4gPT09IFwic3RyaW5nXCJcbiAgICAgICAgPyBbYm9vbGVhbl1cbiAgICAgICAgOiBib29sZWFuO1xuXG4gICAgICBmb3IgKGNvbnN0IGtleSBvZiBib29sZWFuQXJncy5maWx0ZXIoQm9vbGVhbikpIHtcbiAgICAgICAgZmxhZ3MuYm9vbHNba2V5XSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gZ2V0KGFsaWFzZXMsIGtleSk7XG4gICAgICAgIGlmIChhbGlhcykge1xuICAgICAgICAgIGZvciAoY29uc3QgYWwgb2YgYWxpYXMpIHtcbiAgICAgICAgICAgIGZsYWdzLmJvb2xzW2FsXSA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0cmluZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3Qgc3RyaW5nQXJnczogUmVhZG9ubHlBcnJheTxzdHJpbmc+ID0gdHlwZW9mIHN0cmluZyA9PT0gXCJzdHJpbmdcIlxuICAgICAgPyBbc3RyaW5nXVxuICAgICAgOiBzdHJpbmc7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBzdHJpbmdBcmdzLmZpbHRlcihCb29sZWFuKSkge1xuICAgICAgZmxhZ3Muc3RyaW5nc1trZXldID0gdHJ1ZTtcbiAgICAgIGNvbnN0IGFsaWFzID0gZ2V0KGFsaWFzZXMsIGtleSk7XG4gICAgICBpZiAoYWxpYXMpIHtcbiAgICAgICAgZm9yIChjb25zdCBhbCBvZiBhbGlhcykge1xuICAgICAgICAgIGZsYWdzLnN0cmluZ3NbYWxdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChjb2xsZWN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBjb2xsZWN0QXJnczogUmVhZG9ubHlBcnJheTxzdHJpbmc+ID0gdHlwZW9mIGNvbGxlY3QgPT09IFwic3RyaW5nXCJcbiAgICAgID8gW2NvbGxlY3RdXG4gICAgICA6IGNvbGxlY3Q7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBjb2xsZWN0QXJncy5maWx0ZXIoQm9vbGVhbikpIHtcbiAgICAgIGZsYWdzLmNvbGxlY3Rba2V5XSA9IHRydWU7XG4gICAgICBjb25zdCBhbGlhcyA9IGdldChhbGlhc2VzLCBrZXkpO1xuICAgICAgaWYgKGFsaWFzKSB7XG4gICAgICAgIGZvciAoY29uc3QgYWwgb2YgYWxpYXMpIHtcbiAgICAgICAgICBmbGFncy5jb2xsZWN0W2FsXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAobmVnYXRhYmxlICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuZWdhdGFibGVBcmdzOiBSZWFkb25seUFycmF5PHN0cmluZz4gPSB0eXBlb2YgbmVnYXRhYmxlID09PSBcInN0cmluZ1wiXG4gICAgICA/IFtuZWdhdGFibGVdXG4gICAgICA6IG5lZ2F0YWJsZTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIG5lZ2F0YWJsZUFyZ3MuZmlsdGVyKEJvb2xlYW4pKSB7XG4gICAgICBmbGFncy5uZWdhdGFibGVba2V5XSA9IHRydWU7XG4gICAgICBjb25zdCBhbGlhcyA9IGdldChhbGlhc2VzLCBrZXkpO1xuICAgICAgaWYgKGFsaWFzKSB7XG4gICAgICAgIGZvciAoY29uc3QgYWwgb2YgYWxpYXMpIHtcbiAgICAgICAgICBmbGFncy5uZWdhdGFibGVbYWxdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFyZ3Y6IEFyZ3MgPSB7IF86IFtdIH07XG5cbiAgZnVuY3Rpb24gYXJnRGVmaW5lZChrZXk6IHN0cmluZywgYXJnOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gKFxuICAgICAgKGZsYWdzLmFsbEJvb2xzICYmIC9eLS1bXj1dKyQvLnRlc3QoYXJnKSkgfHxcbiAgICAgIGdldChmbGFncy5ib29scywga2V5KSB8fFxuICAgICAgISFnZXQoZmxhZ3Muc3RyaW5ncywga2V5KSB8fFxuICAgICAgISFnZXQoYWxpYXNlcywga2V5KVxuICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRLZXkoXG4gICAgb2JqOiBOZXN0ZWRNYXBwaW5nLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICB2YWx1ZTogdW5rbm93bixcbiAgICBjb2xsZWN0ID0gdHJ1ZSxcbiAgKSB7XG4gICAgbGV0IG8gPSBvYmo7XG4gICAgY29uc3Qga2V5cyA9IG5hbWUuc3BsaXQoXCIuXCIpO1xuICAgIGtleXMuc2xpY2UoMCwgLTEpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgaWYgKGdldChvLCBrZXkpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgb1trZXldID0ge307XG4gICAgICB9XG4gICAgICBvID0gZ2V0KG8sIGtleSkgYXMgTmVzdGVkTWFwcGluZztcbiAgICB9KTtcblxuICAgIGNvbnN0IGtleSA9IGtleXNba2V5cy5sZW5ndGggLSAxXTtcbiAgICBjb25zdCBjb2xsZWN0YWJsZSA9IGNvbGxlY3QgJiYgISFnZXQoZmxhZ3MuY29sbGVjdCwgbmFtZSk7XG5cbiAgICBpZiAoIWNvbGxlY3RhYmxlKSB7XG4gICAgICBvW2tleV0gPSB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKGdldChvLCBrZXkpID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG9ba2V5XSA9IFt2YWx1ZV07XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGdldChvLCBrZXkpKSkge1xuICAgICAgKG9ba2V5XSBhcyB1bmtub3duW10pLnB1c2godmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvW2tleV0gPSBbZ2V0KG8sIGtleSksIHZhbHVlXTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRBcmcoXG4gICAga2V5OiBzdHJpbmcsXG4gICAgdmFsOiB1bmtub3duLFxuICAgIGFyZzogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuICAgIGNvbGxlY3Q/OiBib29sZWFuLFxuICApIHtcbiAgICBpZiAoYXJnICYmIGZsYWdzLnVua25vd25GbiAmJiAhYXJnRGVmaW5lZChrZXksIGFyZykpIHtcbiAgICAgIGlmIChmbGFncy51bmtub3duRm4oYXJnLCBrZXksIHZhbCkgPT09IGZhbHNlKSByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdmFsdWUgPSAhZ2V0KGZsYWdzLnN0cmluZ3MsIGtleSkgJiYgaXNOdW1iZXIodmFsKSA/IE51bWJlcih2YWwpIDogdmFsO1xuICAgIHNldEtleShhcmd2LCBrZXksIHZhbHVlLCBjb2xsZWN0KTtcblxuICAgIGNvbnN0IGFsaWFzID0gZ2V0KGFsaWFzZXMsIGtleSk7XG4gICAgaWYgKGFsaWFzKSB7XG4gICAgICBmb3IgKGNvbnN0IHggb2YgYWxpYXMpIHtcbiAgICAgICAgc2V0S2V5KGFyZ3YsIHgsIHZhbHVlLCBjb2xsZWN0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhbGlhc0lzQm9vbGVhbihrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBnZXRGb3JjZShhbGlhc2VzLCBrZXkpLnNvbWUoXG4gICAgICAoeCkgPT4gdHlwZW9mIGdldChmbGFncy5ib29scywgeCkgPT09IFwiYm9vbGVhblwiLFxuICAgICk7XG4gIH1cblxuICBsZXQgbm90RmxhZ3M6IHN0cmluZ1tdID0gW107XG5cbiAgLy8gYWxsIGFyZ3MgYWZ0ZXIgXCItLVwiIGFyZSBub3QgcGFyc2VkXG4gIGlmIChhcmdzLmluY2x1ZGVzKFwiLS1cIikpIHtcbiAgICBub3RGbGFncyA9IGFyZ3Muc2xpY2UoYXJncy5pbmRleE9mKFwiLS1cIikgKyAxKTtcbiAgICBhcmdzID0gYXJncy5zbGljZSgwLCBhcmdzLmluZGV4T2YoXCItLVwiKSk7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBhcmcgPSBhcmdzW2ldO1xuXG4gICAgaWYgKC9eLS0uKz0vLnRlc3QoYXJnKSkge1xuICAgICAgY29uc3QgbSA9IGFyZy5tYXRjaCgvXi0tKFtePV0rKT0oLiopJC9zKTtcbiAgICAgIGFzc2VydChtICE9PSBudWxsKTtcbiAgICAgIGNvbnN0IFssIGtleSwgdmFsdWVdID0gbTtcblxuICAgICAgaWYgKGZsYWdzLmJvb2xzW2tleV0pIHtcbiAgICAgICAgY29uc3QgYm9vbGVhblZhbHVlID0gdmFsdWUgIT09IFwiZmFsc2VcIjtcbiAgICAgICAgc2V0QXJnKGtleSwgYm9vbGVhblZhbHVlLCBhcmcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0QXJnKGtleSwgdmFsdWUsIGFyZyk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIC9eLS1uby0uKy8udGVzdChhcmcpICYmIGdldChmbGFncy5uZWdhdGFibGUsIGFyZy5yZXBsYWNlKC9eLS1uby0vLCBcIlwiKSlcbiAgICApIHtcbiAgICAgIGNvbnN0IG0gPSBhcmcubWF0Y2goL14tLW5vLSguKykvKTtcbiAgICAgIGFzc2VydChtICE9PSBudWxsKTtcbiAgICAgIHNldEFyZyhtWzFdLCBmYWxzZSwgYXJnLCBmYWxzZSk7XG4gICAgfSBlbHNlIGlmICgvXi0tLisvLnRlc3QoYXJnKSkge1xuICAgICAgY29uc3QgbSA9IGFyZy5tYXRjaCgvXi0tKC4rKS8pO1xuICAgICAgYXNzZXJ0KG0gIT09IG51bGwpO1xuICAgICAgY29uc3QgWywga2V5XSA9IG07XG4gICAgICBjb25zdCBuZXh0ID0gYXJnc1tpICsgMV07XG4gICAgICBpZiAoXG4gICAgICAgIG5leHQgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAhL14tLy50ZXN0KG5leHQpICYmXG4gICAgICAgICFnZXQoZmxhZ3MuYm9vbHMsIGtleSkgJiZcbiAgICAgICAgIWZsYWdzLmFsbEJvb2xzICYmXG4gICAgICAgIChnZXQoYWxpYXNlcywga2V5KSA/ICFhbGlhc0lzQm9vbGVhbihrZXkpIDogdHJ1ZSlcbiAgICAgICkge1xuICAgICAgICBzZXRBcmcoa2V5LCBuZXh0LCBhcmcpO1xuICAgICAgICBpKys7XG4gICAgICB9IGVsc2UgaWYgKC9eKHRydWV8ZmFsc2UpJC8udGVzdChuZXh0KSkge1xuICAgICAgICBzZXRBcmcoa2V5LCBuZXh0ID09PSBcInRydWVcIiwgYXJnKTtcbiAgICAgICAgaSsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0QXJnKGtleSwgZ2V0KGZsYWdzLnN0cmluZ3MsIGtleSkgPyBcIlwiIDogdHJ1ZSwgYXJnKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKC9eLVteLV0rLy50ZXN0KGFyZykpIHtcbiAgICAgIGNvbnN0IGxldHRlcnMgPSBhcmcuc2xpY2UoMSwgLTEpLnNwbGl0KFwiXCIpO1xuXG4gICAgICBsZXQgYnJva2VuID0gZmFsc2U7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGxldHRlcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgY29uc3QgbmV4dCA9IGFyZy5zbGljZShqICsgMik7XG5cbiAgICAgICAgaWYgKG5leHQgPT09IFwiLVwiKSB7XG4gICAgICAgICAgc2V0QXJnKGxldHRlcnNbal0sIG5leHQsIGFyZyk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoL1tBLVphLXpdLy50ZXN0KGxldHRlcnNbal0pICYmIC89Ly50ZXN0KG5leHQpKSB7XG4gICAgICAgICAgc2V0QXJnKGxldHRlcnNbal0sIG5leHQuc3BsaXQoLz0oLispLylbMV0sIGFyZyk7XG4gICAgICAgICAgYnJva2VuID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAvW0EtWmEtel0vLnRlc3QobGV0dGVyc1tqXSkgJiZcbiAgICAgICAgICAvLT9cXGQrKFxcLlxcZCopPyhlLT9cXGQrKT8kLy50ZXN0KG5leHQpXG4gICAgICAgICkge1xuICAgICAgICAgIHNldEFyZyhsZXR0ZXJzW2pdLCBuZXh0LCBhcmcpO1xuICAgICAgICAgIGJyb2tlbiA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGV0dGVyc1tqICsgMV0gJiYgbGV0dGVyc1tqICsgMV0ubWF0Y2goL1xcVy8pKSB7XG4gICAgICAgICAgc2V0QXJnKGxldHRlcnNbal0sIGFyZy5zbGljZShqICsgMiksIGFyZyk7XG4gICAgICAgICAgYnJva2VuID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzZXRBcmcobGV0dGVyc1tqXSwgZ2V0KGZsYWdzLnN0cmluZ3MsIGxldHRlcnNbal0pID8gXCJcIiA6IHRydWUsIGFyZyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgW2tleV0gPSBhcmcuc2xpY2UoLTEpO1xuICAgICAgaWYgKCFicm9rZW4gJiYga2V5ICE9PSBcIi1cIikge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgYXJnc1tpICsgMV0gJiZcbiAgICAgICAgICAhL14oLXwtLSlbXi1dLy50ZXN0KGFyZ3NbaSArIDFdKSAmJlxuICAgICAgICAgICFnZXQoZmxhZ3MuYm9vbHMsIGtleSkgJiZcbiAgICAgICAgICAoZ2V0KGFsaWFzZXMsIGtleSkgPyAhYWxpYXNJc0Jvb2xlYW4oa2V5KSA6IHRydWUpXG4gICAgICAgICkge1xuICAgICAgICAgIHNldEFyZyhrZXksIGFyZ3NbaSArIDFdLCBhcmcpO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfSBlbHNlIGlmIChhcmdzW2kgKyAxXSAmJiAvXih0cnVlfGZhbHNlKSQvLnRlc3QoYXJnc1tpICsgMV0pKSB7XG4gICAgICAgICAgc2V0QXJnKGtleSwgYXJnc1tpICsgMV0gPT09IFwidHJ1ZVwiLCBhcmcpO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzZXRBcmcoa2V5LCBnZXQoZmxhZ3Muc3RyaW5ncywga2V5KSA/IFwiXCIgOiB0cnVlLCBhcmcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghZmxhZ3MudW5rbm93bkZuIHx8IGZsYWdzLnVua25vd25GbihhcmcpICE9PSBmYWxzZSkge1xuICAgICAgICBhcmd2Ll8ucHVzaChmbGFncy5zdHJpbmdzW1wiX1wiXSA/PyAhaXNOdW1iZXIoYXJnKSA/IGFyZyA6IE51bWJlcihhcmcpKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdG9wRWFybHkpIHtcbiAgICAgICAgYXJndi5fLnB1c2goLi4uYXJncy5zbGljZShpICsgMSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkZWZhdWx0cykpIHtcbiAgICBpZiAoIWhhc0tleShhcmd2LCBrZXkuc3BsaXQoXCIuXCIpKSkge1xuICAgICAgc2V0S2V5KGFyZ3YsIGtleSwgdmFsdWUsIGZhbHNlKTtcblxuICAgICAgaWYgKGFsaWFzZXNba2V5XSkge1xuICAgICAgICBmb3IgKGNvbnN0IHggb2YgYWxpYXNlc1trZXldKSB7XG4gICAgICAgICAgc2V0S2V5KGFyZ3YsIHgsIHZhbHVlLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmbGFncy5ib29scykpIHtcbiAgICBpZiAoIWhhc0tleShhcmd2LCBrZXkuc3BsaXQoXCIuXCIpKSkge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZXQoZmxhZ3MuY29sbGVjdCwga2V5KSA/IFtdIDogZmFsc2U7XG4gICAgICBzZXRLZXkoXG4gICAgICAgIGFyZ3YsXG4gICAgICAgIGtleSxcbiAgICAgICAgdmFsdWUsXG4gICAgICAgIGZhbHNlLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmbGFncy5zdHJpbmdzKSkge1xuICAgIGlmICghaGFzS2V5KGFyZ3YsIGtleS5zcGxpdChcIi5cIikpICYmIGdldChmbGFncy5jb2xsZWN0LCBrZXkpKSB7XG4gICAgICBzZXRLZXkoXG4gICAgICAgIGFyZ3YsXG4gICAgICAgIGtleSxcbiAgICAgICAgW10sXG4gICAgICAgIGZhbHNlLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoZG91YmxlRGFzaCkge1xuICAgIGFyZ3ZbXCItLVwiXSA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG5vdEZsYWdzKSB7XG4gICAgICBhcmd2W1wiLS1cIl0ucHVzaChrZXkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBub3RGbGFncykge1xuICAgICAgYXJndi5fLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYXJndiBhcyBBcmdzPFRBcmdzLCBURG91YmxlRGFzaD47XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHFDQUFxQztBQUVyQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQStCQyxHQUNELFNBQVMsTUFBTSxRQUFRLHNCQUFzQjtBQXNVN0MsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHO0FBRW5CLFNBQVMsSUFDUCxHQUEyQixFQUMzQixHQUFXO0VBRVgsSUFBSSxPQUFPLEtBQUssTUFBTTtJQUNwQixPQUFPLEdBQUcsQ0FBQyxJQUFJO0VBQ2pCO0FBQ0Y7QUFFQSxTQUFTLFNBQWlCLEdBQTJCLEVBQUUsR0FBVztFQUNoRSxNQUFNLElBQUksSUFBSSxLQUFLO0VBQ25CLE9BQU8sTUFBTTtFQUNiLE9BQU87QUFDVDtBQUVBLFNBQVMsU0FBUyxDQUFVO0VBQzFCLElBQUksT0FBTyxNQUFNLFVBQVUsT0FBTztFQUNsQyxJQUFJLGlCQUFpQixJQUFJLENBQUMsT0FBTyxLQUFLLE9BQU87RUFDN0MsT0FBTyw2Q0FBNkMsSUFBSSxDQUFDLE9BQU87QUFDbEU7QUFFQSxTQUFTLE9BQU8sR0FBa0IsRUFBRSxJQUFjO0VBQ2hELElBQUksSUFBSTtFQUNSLEtBQUssS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0lBQ3pCLElBQUssSUFBSSxHQUFHLFFBQVEsQ0FBQztFQUN2QjtFQUVBLE1BQU0sTUFBTSxJQUFJLENBQUMsS0FBSyxNQUFNLEdBQUcsRUFBRTtFQUNqQyxPQUFPLE9BQU8sR0FBRztB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
// denoCacheMetadata=7438250629868628648,14941459925965517594