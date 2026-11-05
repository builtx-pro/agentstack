import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{baseURL:'http://127.0.0.1:4310',headless:true,launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:undefined},webServer:{command:'npm run dev',url:'http://127.0.0.1:4310',reuseExistingServer:false,timeout:30000},reporter:'list',workers:1});
