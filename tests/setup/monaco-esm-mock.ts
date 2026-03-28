/**
 * Mock for monaco-editor ESM submodules (CSS and language contributions)
 *
 * This provides empty exports for monaco-editor/esm/... imports that would
 * otherwise fail in the test environment.
 */

// Empty export - these modules are imported for side effects only
export default {};
