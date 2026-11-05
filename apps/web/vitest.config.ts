import { defineConfig } from 'vitest/config';
import { fileURLToPath,URL } from 'node:url';
export default defineConfig({resolve:{alias:Object.fromEntries(['app','pages','widgets','units','shared'].map(layer=>[`@${layer}`,fileURLToPath(new URL(`./src/${layer}`,import.meta.url))]))},test:{environment:'node',include:['src/**/*.test.ts']}});
