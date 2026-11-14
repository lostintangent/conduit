// Bun declares `import.meta.glob` in bun-types, which the app's tsconfig
// leaves out so renderer code can't see Bun's globals. Each composition root
// uses it to find the files features contribute, keyed by folder name.
interface ImportMeta {
  glob<Module>(
    pattern: string,
    options: { eager: true; import: "default" },
  ): Record<string, Module>;
}
