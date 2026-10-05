{
  "name": "@atrium-plugin/{{name}}",
  "version": "0.1.0",
  "private": true,
  "description": "Atrium plugin: {{title}}",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } },
  "files": ["dist", "src"],
  "scripts": { "build": "tsup", "dev": "tsup --watch", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@atrium/component-registry": "workspace:*",
    "@atrium/providers": "workspace:*",
    "@atrium/schema": "workspace:*",
    "zod": "^4.6.5"
  },
  "peerDependencies": { "react": "^19.3.0" },
  "devDependencies": {
    "@atrium/typescript-config": "workspace:*",
    "@types/react": "^19.3.0",
    "react": "^19.3.0",
    "tsup": "^8.5.1",
    "typescript": "5.9.3",
    "vitest": "^5.0.3"
  }
}
