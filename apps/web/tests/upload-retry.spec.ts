import {test,expect} from '@playwright/test';
import path from 'node:path';
import {setupReviewApi} from './fixtures/review-api.fixture';
async function openVerifiedImport(page:import('@playwright/test').Page){
 await setupReviewApi(page);
 await page.route('**/api/v1/projects/project-one/import',route=>route.fulfill({json:{created:16,updated:0,unchanged:0,dryRun:route.request().postDataJSON().dryRun}}));
 await page.goto('/projects/project-one/settings');await page.getByRole('tab',{name:'Import catalog'}).click();
 await page.getByLabel('Catalog folder').setInputFiles(process.env.AGENTSTACK_EXAMPLE_ROOT??path.resolve('../../examples/starter'));
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByText('Preview passed',{exact:true})).toBeVisible();
}
test('browser import waits on 429 then completes without restarting uploaded files',async({page})=>{
 await openVerifiedImport(page);let uploads=0;
 await page.route('**/api/v1/projects/project-one/files',route=>{uploads++;return uploads===1?route.fulfill({status:429,headers:{'Retry-After':'1'},json:{error:{code:'rate_limit',message:'Upload rate limit'}}}):route.fulfill({status:201,json:{id:`file-${uploads}`}});});
 await page.getByRole('button',{name:'Apply verified import'}).click();await expect(page.getByText('Waiting for upload limit',{exact:false})).toBeVisible();await expect(page.getByText('Import completed',{exact:true})).toBeVisible();expect(uploads).toBe(6);
});
test('browser import can cancel a rate-limit wait',async({page})=>{
 await openVerifiedImport(page);let uploads=0;
 await page.route('**/api/v1/projects/project-one/files',route=>{uploads++;return route.fulfill({status:429,headers:{'Retry-After':'60'},json:{error:{code:'rate_limit',message:'Upload rate limit'}}});});
 await page.getByRole('button',{name:'Apply verified import'}).click();await expect(page.getByText('Waiting for upload limit',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Cancel upload'}).click();await expect(page.getByText('Upload cancelled.',{exact:false})).toBeVisible();expect(uploads).toBe(1);
});
