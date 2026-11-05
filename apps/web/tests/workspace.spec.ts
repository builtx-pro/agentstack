import {test,expect} from '@playwright/test';
import {setupReviewApi} from './fixtures/review-api.fixture';
test('review exact screen, submit a note and complete human acceptance',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const fixture=await setupReviewApi(page);await page.goto('/projects/project-one/screens');await expect(page.getByRole('heading',{name:'Screen library'})).toBeVisible();await expect(page.getByRole('button',{name:'Review Choose a recovery method'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('screens-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Review Choose a recovery method'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Leave a note').fill('Clarify which device the recovery action refers to.');await page.getByRole('button',{name:'Add comment',exact:true}).click();await expect(page.getByText('Clarify which device the recovery action refers to.',{exact:true})).toBeVisible();expect(fixture.notes).toHaveLength(1);
 await page.getByRole('button',{name:'Claim',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('button',{name:'Submit result',exact:true}).click();await page.getByLabel('What changed?').fill('Clarified the device label.');await page.getByLabel('Check performed').fill('Recovery route and mobile layout');await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Ready for review',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Accept result'}).click();await page.getByLabel('Reason / review decision').fill('Verified the screen and its destination.');await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Resolved',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);await page.screenshot({path:testInfo.outputPath('review-desktop.png'),fullPage:false,animations:'disabled'});expect(errors).toEqual([]);
});
test('document edits preserve user input after version conflict',async({page})=>{const fixture=await setupReviewApi(page);await page.goto('/projects/project-one/documents?selected=project-brief');await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Markdown',{exact:true}).fill('# Updated brief\n\nNew acceptance criteria.');fixture.conflictNextPatch();await page.getByRole('button',{name:'Save new revision'}).click();await expect(page.getByText('This item changed. Reload before saving.')).toBeVisible();await expect(page.getByLabel('Markdown',{exact:true})).toHaveValue('# Updated brief\n\nNew acceptance criteria.');});
test('customer sees shared screens, can search and opens full mobile viewer',async({page},testInfo)=>{await page.setViewportSize({width:390,height:844});await setupReviewApi(page,true);await page.goto('/projects/project-one/screens');await page.getByLabel('Search screens').fill('recovery');await expect(page.getByRole('button',{name:'Review Choose a recovery method'})).toBeVisible();await expect(page.getByRole('button',{name:'Review Sign in'})).toBeVisible();await page.getByRole('button',{name:'Review Choose a recovery method'}).click();await expect(page.getByLabel('Leave a note')).toBeVisible();await expect(page.getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);await page.screenshot({path:testInfo.outputPath('review-mobile.png'),fullPage:false,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();});
test('dashboard and asset usage render from API values',async({page},testInfo)=>{await setupReviewApi(page);await page.goto('/projects/project-one/overview');await expect(page.getByText('33%')).toBeVisible();await expect(page.getByRole('heading',{name:'Delivery over time'})).toBeVisible();await page.screenshot({path:testInfo.outputPath('overview-desktop.png'),fullPage:true});await page.goto('/projects/project-one/assets?selected=account-shield');await expect(page.getByText('Used on 4 screens')).toBeVisible();await page.getByRole('button',{name:'Choose a recovery method',exact:true}).click();await expect(page.getByText('recovery-choice · v1')).toBeVisible();});

test('large catalog bounds rendered cards and keeps all loaded records searchable',async({page})=>{
 const fixture=await setupReviewApi(page);const source=fixture.objects.find((o:any)=>o.kind==='screen');
 fixture.objects.push(...Array.from({length:11000},(_,index)=>({...source,id:`large-${index}`,key:`large-${index}`,title:`Catalog screen ${index}`})));
 await page.goto('/projects/project-one/screens?mode=grid');
 await expect(page.locator('article')).toHaveCount(48);
 await page.getByRole('button',{name:'Load 48 more'}).click();await expect(page.locator('article')).toHaveCount(96);
 await page.getByLabel('Search screens').fill('Catalog screen 10999');await expect(page.locator('article')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Review Catalog screen 10999',exact:true})).toBeVisible();
});

test('unauthenticated project page does not prefetch protected data',async({page})=>{
 const protectedRequests:string[]=[];
 await page.route('**/api/v1/**',route=>{const pathname=new URL(route.request().url()).pathname;if(pathname!=='/api/v1/auth/me')protectedRequests.push(pathname);return route.fulfill({status:401,json:{error:{code:'unauthorized',message:'Sign in required'}}});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();expect(protectedRequests).toEqual([]);
});

test('single observation dashboard renders progress markers',async({page})=>{
 await setupReviewApi(page);
 await page.route('**/api/v1/projects/project-one/progress',route=>route.fulfill({json:{total:4,done:1,percent:25,byStatus:{done:1,blocked:1,ready:2},notes:{open:0,in_progress:0,ready_for_review:0,resolved:0},groups:[],timeline:[{date:new Date().toISOString().slice(0,10),total:4,done:1}]}}));
 await page.goto('/projects/project-one/overview');await expect(page.getByText('History starts today.',{exact:false})).toBeVisible();await expect(page.getByRole('img',{name:'Progress history.',exact:false}).locator('circle')).toHaveCount(2);await expect(page.getByText('Blocked',{exact:true})).toBeVisible();
});

test('membership removal and restoration send exact monotonic versions',async({page})=>{
 await setupReviewApi(page);const member={userId:'developer-two',name:'Project developer',email:'developer@example.test',role:'developer',version:3,revokedAt:null as string|null};const writes:{method:string;body:any}[]=[];
 await page.route('**/api/v1/users**',route=>route.fulfill({json:{items:[{id:member.userId,name:member.name,email:member.email}],nextCursor:null}}));
 await page.route('**/api/v1/projects/project-one/members**',route=>{const method=route.request().method();if(method!=='GET'){const body=route.request().postDataJSON();writes.push({method,body});if(body.expectedVersion!==member.version)return route.fulfill({status:409,json:{error:{code:'version_conflict',message:'Changed membership'}}});member.version++;member.revokedAt=method==='DELETE'?new Date().toISOString():null;return route.fulfill({json:member});}return route.fulfill({json:{items:[member],nextCursor:null}});});
 await page.route('**/api/v1/projects/project-one/invitations**',route=>route.fulfill({json:{items:[],nextCursor:null}}));
 await page.goto('/projects/project-one/settings');await page.getByRole('tab',{name:'People & access'}).click();await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(page.getByText('Revoked',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Existing user',exact:true}).click();await page.getByRole('option',{name:'Project developer · developer@example.test'}).click();await page.getByRole('button',{name:'Restore access',exact:true}).click();await expect(page.getByRole('button',{name:'Remove',exact:true})).toBeVisible();expect(writes.map(w=>w.body.expectedVersion)).toEqual([3,4]);
});

test('pending invitations can be revoked and current project context can be prepared',async({page})=>{
 await setupReviewApi(page);const invitation={id:'invite-one',email:'client@example.test',role:'customer',expiresAt:'2099-01-01T12:00:00Z',acceptedAt:null,revokedAt:null as string|null};
 await page.route('**/api/v1/projects/project-one/invitations**',route=>{if(route.request().method()==='DELETE'){invitation.revokedAt=new Date().toISOString();return route.fulfill({json:{ok:true}});}return route.fulfill({json:{items:[invitation],nextCursor:null}});});
 await page.route('**/api/v1/projects/project-one/context',route=>route.fulfill({json:{project:{name:'Lumen'},rules:[],documents:[],truncated:false}}));
 await page.goto('/projects/project-one/settings');await page.getByRole('button',{name:'Prepare project context'}).click();await expect(page.getByLabel('Project context snapshot')).toContainText('Lumen');await page.getByRole('tab',{name:'People & access'}).click();await page.getByRole('button',{name:'Revoke invitation'}).click();await expect(page.getByText('Revoked',{exact:true})).toBeVisible();
});
