/**
 * Tests for language detection utility.
 *
 * Ensures proper language mapping for:
 * - Common file extensions (.ts, .js, .json, etc.)
 * - Special filenames (.gitignore, Dockerfile, Makefile, etc.)
 * - Edge cases (no extension, unknown extensions, etc.)
 */

import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/components/panes/editor-v2/utils/languageDetection";

describe("languageDetection", () => {
  // ===========================================================================
  // Extension-Based Detection
  // ===========================================================================

  describe("extension-based detection", () => {
    describe("JavaScript/TypeScript", () => {
      it("should detect typescript for .ts files", () => {
        expect(detectLanguage("/path/to/file.ts")).toBe("typescript");
        expect(detectLanguage("file.ts")).toBe("typescript");
      });

      it("should detect typescript for .tsx files", () => {
        expect(detectLanguage("/path/to/Component.tsx")).toBe("typescript");
      });

      it("should detect javascript for .js files", () => {
        expect(detectLanguage("/path/to/file.js")).toBe("javascript");
      });

      it("should detect javascript for .jsx files", () => {
        expect(detectLanguage("/path/to/Component.jsx")).toBe("javascript");
      });

      it("should detect javascript for .mjs files", () => {
        expect(detectLanguage("/path/to/module.mjs")).toBe("javascript");
      });

      it("should detect javascript for .cjs files", () => {
        expect(detectLanguage("/path/to/config.cjs")).toBe("javascript");
      });
    });

    describe("Data formats", () => {
      it("should detect json for .json files", () => {
        expect(detectLanguage("/path/to/file.json")).toBe("json");
      });

      it("should detect jsonc for .jsonc files", () => {
        expect(detectLanguage("/path/to/tsconfig.jsonc")).toBe("jsonc");
      });

      it("should detect yaml for .yml files", () => {
        expect(detectLanguage("/path/to/config.yml")).toBe("yaml");
      });

      it("should detect yaml for .yaml files", () => {
        expect(detectLanguage("/path/to/config.yaml")).toBe("yaml");
      });

      it("should detect toml for .toml files", () => {
        expect(detectLanguage("/path/to/Cargo.toml")).toBe("toml");
      });

      it("should detect xml for .xml files", () => {
        expect(detectLanguage("/path/to/config.xml")).toBe("xml");
      });
    });

    describe("Web languages", () => {
      it("should detect css for .css files", () => {
        expect(detectLanguage("/path/to/styles.css")).toBe("css");
      });

      it("should detect scss for .scss files", () => {
        expect(detectLanguage("/path/to/styles.scss")).toBe("scss");
      });

      it("should detect scss for .sass files", () => {
        expect(detectLanguage("/path/to/styles.sass")).toBe("scss");
      });

      it("should detect less for .less files", () => {
        expect(detectLanguage("/path/to/styles.less")).toBe("less");
      });

      it("should detect html for .html files", () => {
        expect(detectLanguage("/path/to/index.html")).toBe("html");
      });

      it("should detect html for .htm files", () => {
        expect(detectLanguage("/path/to/index.htm")).toBe("html");
      });
    });

    describe("Markup languages", () => {
      it("should detect markdown for .md files", () => {
        expect(detectLanguage("/path/to/README.md")).toBe("markdown");
      });

      it("should detect markdown for .markdown files", () => {
        expect(detectLanguage("/path/to/doc.markdown")).toBe("markdown");
      });
    });

    describe("Shell scripts", () => {
      it("should detect shell for .sh files", () => {
        expect(detectLanguage("/path/to/script.sh")).toBe("shell");
      });

      it("should detect bash for .bash files", () => {
        expect(detectLanguage("/path/to/script.bash")).toBe("bash");
      });

      it("should detect shell for .zsh files", () => {
        expect(detectLanguage("/path/to/config.zsh")).toBe("shell");
      });

      it("should detect shell for .fish files", () => {
        expect(detectLanguage("/path/to/config.fish")).toBe("shell");
      });

      it("should detect powershell for .ps1 files", () => {
        expect(detectLanguage("/path/to/script.ps1")).toBe("powershell");
      });
    });

    describe("Programming languages", () => {
      it("should detect python for .py files", () => {
        expect(detectLanguage("/path/to/script.py")).toBe("python");
      });

      it("should detect rust for .rs files", () => {
        expect(detectLanguage("/path/to/main.rs")).toBe("rust");
      });

      it("should detect go for .go files", () => {
        expect(detectLanguage("/path/to/main.go")).toBe("go");
      });

      it("should detect java for .java files", () => {
        expect(detectLanguage("/path/to/Main.java")).toBe("java");
      });

      it("should detect c for .c files", () => {
        expect(detectLanguage("/path/to/main.c")).toBe("c");
      });

      it("should detect c for .h files", () => {
        expect(detectLanguage("/path/to/header.h")).toBe("c");
      });

      it("should detect cpp for .cpp files", () => {
        expect(detectLanguage("/path/to/main.cpp")).toBe("cpp");
      });

      it("should detect cpp for .hpp files", () => {
        expect(detectLanguage("/path/to/header.hpp")).toBe("cpp");
      });

      it("should detect csharp for .cs files", () => {
        expect(detectLanguage("/path/to/Program.cs")).toBe("csharp");
      });

      it("should detect php for .php files", () => {
        expect(detectLanguage("/path/to/index.php")).toBe("php");
      });

      it("should detect ruby for .rb files", () => {
        expect(detectLanguage("/path/to/app.rb")).toBe("ruby");
      });
    });

    describe("Database/Query languages", () => {
      it("should detect sql for .sql files", () => {
        expect(detectLanguage("/path/to/query.sql")).toBe("sql");
      });

      it("should detect graphql for .graphql files", () => {
        expect(detectLanguage("/path/to/schema.graphql")).toBe("graphql");
      });

      it("should detect graphql for .gql files", () => {
        expect(detectLanguage("/path/to/query.gql")).toBe("graphql");
      });
    });

    describe("Config formats", () => {
      it("should detect ini for .ini files", () => {
        expect(detectLanguage("/path/to/config.ini")).toBe("ini");
      });

      it("should detect ini for .cfg files", () => {
        expect(detectLanguage("/path/to/config.cfg")).toBe("ini");
      });

      it("should detect ini for .conf files", () => {
        expect(detectLanguage("/path/to/app.conf")).toBe("ini");
      });

      it("should detect ini for .config files", () => {
        expect(detectLanguage("/path/to/app.config")).toBe("ini");
      });

      it("should detect ini for .properties files", () => {
        expect(detectLanguage("/path/to/app.properties")).toBe("ini");
      });

      it("should detect ini for .env files", () => {
        expect(detectLanguage("/path/to/.env")).toBe("ini");
      });
    });

    describe("Other", () => {
      it("should detect plaintext for .txt files", () => {
        expect(detectLanguage("/path/to/notes.txt")).toBe("plaintext");
      });

      it("should detect dockerfile for .dockerfile files", () => {
        expect(detectLanguage("/path/to/app.dockerfile")).toBe("dockerfile");
      });

      it("should detect diff for .diff files", () => {
        expect(detectLanguage("/path/to/changes.diff")).toBe("diff");
      });

      it("should detect diff for .patch files", () => {
        expect(detectLanguage("/path/to/fix.patch")).toBe("diff");
      });
    });
  });

  // ===========================================================================
  // Filename-Based Detection (Special Files)
  // ===========================================================================

  describe("filename-based detection", () => {
    describe("Dockerfiles", () => {
      it("should detect dockerfile for Dockerfile (exact match)", () => {
        expect(detectLanguage("/path/to/Dockerfile")).toBe("dockerfile");
        expect(detectLanguage("Dockerfile")).toBe("dockerfile");
      });

      it("should detect dockerfile for dockerfile (lowercase)", () => {
        expect(detectLanguage("/path/to/dockerfile")).toBe("dockerfile");
      });

      it("should detect dockerfile for Dockerfile.dev", () => {
        expect(detectLanguage("/path/to/Dockerfile.dev")).toBe("dockerfile");
        expect(detectLanguage("Dockerfile.dev")).toBe("dockerfile");
      });

      it("should detect dockerfile for Dockerfile.prod", () => {
        expect(detectLanguage("/path/to/Dockerfile.prod")).toBe("dockerfile");
      });

      it("should detect dockerfile for Dockerfile.test", () => {
        expect(detectLanguage("/path/to/Dockerfile.test")).toBe("dockerfile");
      });
    });

    describe("Makefiles", () => {
      it("should detect makefile for Makefile (exact match)", () => {
        expect(detectLanguage("/path/to/Makefile")).toBe("makefile");
        expect(detectLanguage("Makefile")).toBe("makefile");
      });

      it("should detect makefile for makefile (lowercase)", () => {
        expect(detectLanguage("/path/to/makefile")).toBe("makefile");
      });

      it("should detect makefile for GNUmakefile", () => {
        expect(detectLanguage("/path/to/GNUmakefile")).toBe("makefile");
        expect(detectLanguage("gnumakefile")).toBe("makefile");
      });
    });

    describe("Git files", () => {
      it("should detect shell for .gitignore", () => {
        expect(detectLanguage("/path/to/.gitignore")).toBe("shell");
        expect(detectLanguage(".gitignore")).toBe("shell");
      });

      it("should detect ini for .gitattributes", () => {
        expect(detectLanguage("/path/to/.gitattributes")).toBe("ini");
      });

      it("should detect ini for .gitmodules", () => {
        expect(detectLanguage("/path/to/.gitmodules")).toBe("ini");
      });
    });

    describe("Ignore files", () => {
      it("should detect shell for .dockerignore", () => {
        expect(detectLanguage("/path/to/.dockerignore")).toBe("shell");
      });

      it("should detect shell for .prettierignore", () => {
        expect(detectLanguage("/path/to/.prettierignore")).toBe("shell");
      });

      it("should detect shell for .eslintignore", () => {
        expect(detectLanguage("/path/to/.eslintignore")).toBe("shell");
      });

      it("should detect shell for .npmignore", () => {
        expect(detectLanguage("/path/to/.npmignore")).toBe("shell");
      });
    });

    describe("Environment files", () => {
      it("should detect ini for .env", () => {
        expect(detectLanguage("/path/to/.env")).toBe("ini");
      });

      it("should detect ini for .env.local", () => {
        expect(detectLanguage("/path/to/.env.local")).toBe("ini");
      });

      it("should detect ini for .env.development", () => {
        expect(detectLanguage("/path/to/.env.development")).toBe("ini");
      });

      it("should detect ini for .env.production", () => {
        expect(detectLanguage("/path/to/.env.production")).toBe("ini");
      });

      it("should detect ini for .env.test", () => {
        expect(detectLanguage("/path/to/.env.test")).toBe("ini");
      });

      it("should detect ini for .env.example", () => {
        expect(detectLanguage("/path/to/.env.example")).toBe("ini");
      });
    });

    describe("NPM/Node config files", () => {
      it("should detect ini for .npmrc", () => {
        expect(detectLanguage("/path/to/.npmrc")).toBe("ini");
      });

      it("should detect plaintext for .nvmrc", () => {
        expect(detectLanguage("/path/to/.nvmrc")).toBe("plaintext");
      });

      it("should detect yaml for .yarnrc", () => {
        expect(detectLanguage("/path/to/.yarnrc")).toBe("yaml");
      });

      it("should detect plaintext for .node-version", () => {
        expect(detectLanguage("/path/to/.node-version")).toBe("plaintext");
      });
    });

    describe("Editor config files", () => {
      it("should detect ini for .editorconfig", () => {
        expect(detectLanguage("/path/to/.editorconfig")).toBe("ini");
      });

      it("should detect json for .prettierrc", () => {
        expect(detectLanguage("/path/to/.prettierrc")).toBe("json");
      });

      it("should detect json for .eslintrc", () => {
        expect(detectLanguage("/path/to/.eslintrc")).toBe("json");
      });
    });

    describe("Other config files", () => {
      it("should detect plaintext for .browserslistrc", () => {
        expect(detectLanguage("/path/to/.browserslistrc")).toBe("plaintext");
      });

      it("should detect plaintext for CNAME", () => {
        expect(detectLanguage("/path/to/CNAME")).toBe("plaintext");
        expect(detectLanguage("cname")).toBe("plaintext");
      });

      it("should detect plaintext for LICENSE", () => {
        expect(detectLanguage("/path/to/LICENSE")).toBe("plaintext");
        expect(detectLanguage("license")).toBe("plaintext");
      });

      it("should detect plaintext for AUTHORS", () => {
        expect(detectLanguage("/path/to/AUTHORS")).toBe("plaintext");
        expect(detectLanguage("authors")).toBe("plaintext");
      });

      it("should detect plaintext for CONTRIBUTORS", () => {
        expect(detectLanguage("/path/to/CONTRIBUTORS")).toBe("plaintext");
        expect(detectLanguage("contributors")).toBe("plaintext");
      });
    });

    describe("Docker Compose files", () => {
      it("should detect yaml for docker-compose.yml", () => {
        expect(detectLanguage("/path/to/docker-compose.yml")).toBe("yaml");
        expect(detectLanguage("docker-compose.yml")).toBe("yaml");
      });

      it("should detect yaml for docker-compose.yaml", () => {
        expect(detectLanguage("/path/to/docker-compose.yaml")).toBe("yaml");
      });

      it("should detect yaml for compose.yml", () => {
        expect(detectLanguage("/path/to/compose.yml")).toBe("yaml");
      });

      it("should detect yaml for compose.yaml", () => {
        expect(detectLanguage("/path/to/compose.yaml")).toBe("yaml");
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should default to plaintext for unknown extensions", () => {
      expect(detectLanguage("/path/to/file.xyz")).toBe("plaintext");
      expect(detectLanguage("file.unknown")).toBe("plaintext");
    });

    it("should default to plaintext for files without extensions", () => {
      expect(detectLanguage("/path/to/README")).toBe("plaintext");
      expect(detectLanguage("CHANGELOG")).toBe("plaintext");
    });

    it("should handle files with multiple dots correctly", () => {
      expect(detectLanguage("/path/to/config.test.ts")).toBe("typescript");
      expect(detectLanguage("app.config.js")).toBe("javascript");
    });

    it("should be case-insensitive for filenames", () => {
      expect(detectLanguage("/path/to/DOCKERFILE")).toBe("dockerfile");
      expect(detectLanguage("/path/to/MakeFile")).toBe("makefile");
      expect(detectLanguage("/path/to/.GITIGNORE")).toBe("shell");
    });

    it("should be case-insensitive for extensions", () => {
      expect(detectLanguage("/path/to/file.TS")).toBe("typescript");
      expect(detectLanguage("/path/to/file.JSON")).toBe("json");
    });

    it("should handle paths with no directory separators", () => {
      expect(detectLanguage("file.ts")).toBe("typescript");
      expect(detectLanguage(".gitignore")).toBe("shell");
      expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    });

    it("should handle absolute paths", () => {
      expect(detectLanguage("/absolute/path/to/file.ts")).toBe("typescript");
      expect(detectLanguage("/root/.gitignore")).toBe("shell");
    });

    it("should prioritize filename match over extension", () => {
      // .env has both a filename match (ini) and extension match (ini)
      // This tests that filename matching happens first
      expect(detectLanguage("/path/to/.env")).toBe("ini");

      // If we had a file like "myfile.env" it should still match by extension
      expect(detectLanguage("/path/to/myfile.env")).toBe("ini");
    });
  });
});
