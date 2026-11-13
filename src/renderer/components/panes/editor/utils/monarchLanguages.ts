/**
 * Monarch tokenizers for languages Monaco doesn't ship: Zig, TOML, Makefiles
 * and diffs. `configureMonaco` registers them, and `detectLanguage` maps files
 * to their IDs.
 *
 * Token names reuse the scopes that Monaco's built-in `vs` and `vs-dark`
 * themes color, since those are the only themes the editor uses.
 */

import type { languages } from "monaco-editor";

export interface MonarchLanguage {
  id: string;
  tokenizer: languages.IMonarchLanguage;
  configuration?: languages.LanguageConfiguration;
}

const zig: MonarchLanguage = {
  id: "zig",
  tokenizer: {
    keywords: [
      "addrspace",
      "align",
      "allowzero",
      "and",
      "anyframe",
      "anytype",
      "asm",
      "async",
      "await",
      "break",
      "callconv",
      "catch",
      "comptime",
      "const",
      "continue",
      "defer",
      "else",
      "enum",
      "errdefer",
      "error",
      "export",
      "extern",
      "false",
      "fn",
      "for",
      "if",
      "inline",
      "linksection",
      "noalias",
      "noinline",
      "nosuspend",
      "null",
      "opaque",
      "or",
      "orelse",
      "packed",
      "pub",
      "resume",
      "return",
      "struct",
      "suspend",
      "switch",
      "test",
      "threadlocal",
      "true",
      "try",
      "undefined",
      "union",
      "unreachable",
      "usingnamespace",
      "var",
      "volatile",
      "while",
    ],
    types: [
      "anyerror",
      "anyopaque",
      "bool",
      "c_char",
      "c_int",
      "c_long",
      "c_longdouble",
      "c_longlong",
      "c_short",
      "c_uint",
      "c_ulong",
      "c_ulonglong",
      "c_ushort",
      "comptime_float",
      "comptime_int",
      "f16",
      "f32",
      "f64",
      "f80",
      "f128",
      "isize",
      "noreturn",
      "type",
      "usize",
      "void",
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\\\\.*$/, "string"],
        [/"(?:[^"\\]|\\.)*"?/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
        [/@[A-Za-z_]\w*/, "variable.predefined"],
        [/[iu]\d+(?!\w)/, "type"],
        [
          /[A-Za-z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@types": "type",
              "@default": "identifier",
            },
          },
        ],
        [/0x[\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?\d+)?/, "number.hex"],
        [/0o[0-7_]+|0b[01_]+/, "number"],
        [/\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/, "number"],
        [/[{}()[\]]/, "@brackets"],
        [/[;,.:]/, "delimiter"],
      ],
    },
  },
  configuration: {
    comments: { lineComment: "//" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
  },
};

const toml: MonarchLanguage = {
  id: "toml",
  tokenizer: {
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/^\s*\[\[?[^\][,=#]*\]\]?/, "type"],
        [/[\w.-]+(?=\s*=)/, "key"],
        [/"(?:[^"\\]|\\.)*"(?=\s*=)/, "key"],
        [/"""/, "string", "@basicMultiline"],
        [/'''/, "string", "@literalMultiline"],
        [/"(?:[^"\\]|\\.)*"?/, "string"],
        [/'[^']*'?/, "string"],
        [
          /\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:[Zz]|[+-]\d{2}:\d{2})?/,
          "number",
        ],
        [/\d{2}:\d{2}:\d{2}(?:\.\d+)?/, "number"],
        [/0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+/, "number"],
        [/[+-]?(?:inf|nan)(?!\w)/, "number"],
        [/[+-]?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/, "number"],
        [/(?:true|false)(?!\w)/, "keyword"],
        [/[{}[\]]/, "@brackets"],
        [/[=,.]/, "delimiter"],
      ],
      basicMultiline: [
        [/"""/, "string", "@pop"],
        [/[^"\\]+/, "string"],
        [/\\./, "string"],
        [/["\\]/, "string"],
      ],
      literalMultiline: [
        [/'''/, "string", "@pop"],
        [/[^']+/, "string"],
        [/'/, "string"],
      ],
    },
  },
  configuration: {
    comments: { lineComment: "#" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
    ],
  },
};

const makefile: MonarchLanguage = {
  id: "makefile",
  tokenizer: {
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [
          /^ *-?(?:include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|vpath)(?!\S)/,
          "keyword",
        ],
        // Targets: everything before a single or double colon that isn't `:=`
        [/^[^\s:#=]+(?:[ \t]+[^\s:#=]+)*(?=[ \t]*::?(?!=))/, "type"],
        [/^ *[\w.-]+(?=[ \t]*(?:::=|[:+?!]?=))/, "variable"],
        [/\$[({]/, "variable", "@reference"],
        [/\$[@<^+?*%|$]|\$\w/, "variable"],
        [/"(?:[^"\\]|\\.)*"?|'[^']*'?/, "string"],
      ],
      reference: [
        [/[)}]/, "variable", "@pop"],
        [/\$[({]/, "variable", "@push"],
        [/[^$)}]+/, "variable"],
        [/\$/, "variable"],
      ],
    },
  },
  configuration: {
    comments: { lineComment: "#" },
  },
};

// The built-in themes have no inserted/deleted scopes, so diff lines borrow
// two that read green and red in both `vs` and `vs-dark`.
const diff: MonarchLanguage = {
  id: "diff",
  tokenizer: {
    tokenizer: {
      root: [
        [/^(?:---|\+\+\+) .*$/, "keyword"],
        [
          /^(?:diff|index|similarity|dissimilarity|rename|copy|new|deleted|old)(?!\w).*$/,
          "keyword",
        ],
        [/^@@.*$/, "type"],
        [/^[+>].*$/, "number"],
        [/^[-<].*$/, "invalid"],
      ],
    },
  },
};

export const MONARCH_LANGUAGES: readonly MonarchLanguage[] = [
  zig,
  toml,
  makefile,
  diff,
];
