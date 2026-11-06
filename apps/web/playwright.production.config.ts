import {defineConfig} from '@playwright/test';
import base from './playwright.config';
/** Verify generated CSS as served to users, including Mantine's PostCSS transforms. */
export default defineConfig({
 ...base,
 testMatch:'themes.spec.ts',
 outputDir:'test-results/production',
 use:{...base.use,baseURL:'http://127.0.0.1:4312'},
 webServer:{command:'npx vite preview --host 127.0.0.1 --port 4312 --strictPort',url:'http://127.0.0.1:4312',reuseExistingServer:false,timeout:30000},
});
