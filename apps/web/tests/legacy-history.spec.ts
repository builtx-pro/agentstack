import {test,expect} from '@playwright/test';
import {setupReviewApi} from './fixtures/review-api.fixture';
const projectId='11111111-1111-4111-8111-111111111111';
const targetId='22222222-2222-4222-8222-222222222222';
const noteId='33333333-3333-4333-8333-333333333333';
async function legacyFixture(page:import('@playwright/test').Page,kind:'screen'|'asset'='screen'){
 const fixture=await setupReviewApi(page);fixture.project.id=projectId;for(const object of fixture.objects)object.projectId=projectId;
 const target=fixture.objects.find((object:any)=>object.kind===kind);target.id=targetId;target.data.variant='J';target.data.palette='';
 fixture.notes.push({id:noteId,projectId,targetId,targetVersion:1,body:'Saved comment on the exact target',authorName:'Client',visibility:'customer',status:'open',version:1,createdAt:'2026-11-05T12:00:00Z',updatedAt:'2026-11-05T12:00:00Z'});
 await page.route('**/objects/*/history',route=>route.fulfill({json:{items:[],nextCursor:null}}));
 return{fixture,target};
}
test('legacy screen bookmark survives login and focuses its exact comment',async({page})=>{
 const {target}=await legacyFixture(page);let loggedIn=false;const requests:string[]=[];
 await page.route('**/api/v1/auth/**',route=>{if(route.request().url().endsWith('/login'))loggedIn=true;return route.fulfill({status:loggedIn?200:401,json:loggedIn?{user:{id:'user-one',name:'Reviewer',email:'reviewer@example.test',isAdmin:true},csrfToken:'test'}:{error:{code:'unauthorized',message:'Sign in required'}}});});
 await page.route('**/api/v1/projects/*/legacy?*',route=>{requests.push(route.request().url());return route.fulfill({json:{targetId,noteId,section:'screens'}});});
 await page.goto(`/legacy?project=${projectId}#view=variant&v=J&p=&s=g16-confirm-login&note=8`);
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();expect(requests).toHaveLength(0);
 const returnTo=new URL(page.url()).searchParams.get('returnTo');expect(returnTo).toContain('g16-confirm-login%3AJ%3A');expect(returnTo).toContain('note=8');
 await page.getByLabel('Email').fill('reviewer@example.test');await page.getByRole('textbox',{name:/^Password/}).fill('not-a-real-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByText('Saved comment on the exact target',{exact:true})).toBeVisible();await expect(page.locator(`#note-${noteId}`)).toBeFocused();
 expect(new URL(requests[0]!).searchParams.get('key')).toBe('g16-confirm-login:J:');expect(new URL(requests[0]!).searchParams.get('note')).toBe('8');expect(page.url()).toContain(`selected=${target.id}`);expect(page.url()).toContain('#note=');
});
test('legacy asset bookmark resolves its stable key and opens asset viewer',async({page})=>{
 const {target}=await legacyFixture(page,'asset');let requestedKey='';
 await page.route('**/api/v1/projects/*/legacy?*',route=>{requestedKey=new URL(route.request().url()).searchParams.get('key')??'';return route.fulfill({json:{targetId,section:'assets'}});});
 await page.goto(`/legacy?project=${projectId}#asset=asset-stable-original`);await expect(page.getByRole('dialog')).toBeVisible();expect(page.url()).toContain(`/projects/${projectId}/assets`);expect(requestedKey).toBe('asset-stable-original');await expect(page.getByRole('dialog').getByText(target.title,{exact:true}).first()).toBeVisible();
});
test('missing or inaccessible bookmarked comment stays an error instead of opening another target',async({page})=>{
 await legacyFixture(page);await page.route('**/api/v1/projects/*/legacy?*',route=>route.fulfill({status:404,json:{error:{code:'not_found',message:'Saved review not found'}}}));
 await page.goto(`/legacy?project=${projectId}&kind=screen&key=g16%3AJ%3A&note=8`);await expect(page.getByRole('alert').filter({hasText:'Saved review not found'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);expect(new URL(page.url()).pathname).toBe('/legacy');
});
test('login cannot redirect to an external returnTo destination',async({page})=>{
 await setupReviewApi(page);await page.goto('/login?returnTo=https%3A%2F%2Foutside.example%2F');await expect(page).toHaveURL(/127\.0\.0\.1:4310\/($|projects)/);
});
test('history shows field changes and keeps revision-specific comments read only',async({page},testInfo)=>{
 const fixture=await setupReviewApi(page);const object=fixture.objects.find((item:any)=>item.key==='project-brief');const previous=structuredClone(object);object.version=2;object.title='Revised project brief';object.data.markdown='# Revised brief\n\nClarify recovery devices.';
 for(const [version,body] of [[1,'Original version feedback'],[2,'Current version feedback']] as const)fixture.notes.push({id:`revision-note-${version}`,projectId:'project-one',targetId:object.id,targetVersion:version,body,authorName:'Reviewer',visibility:'customer',status:'open',version:1,createdAt:'2026-11-05T12:00:00Z',updatedAt:'2026-11-05T12:00:00Z'});
 await page.route('**/objects/project-brief/history',route=>route.fulfill({json:{items:[{id:'revision-1',version:1,actorName:'Reviewer',source:'web',summary:'Original content',createdAt:previous.createdAt,snapshot:previous}],nextCursor:null}}));
 await page.goto('/projects/project-one/documents?selected=project-brief');await page.getByRole('tab',{name:'Versions & history'}).click();
 const panel=page.getByRole('tabpanel',{name:'Versions & history'});await expect(panel.getByRole('heading',{name:'What changed'})).toBeVisible();await expect(panel.getByText('markdown',{exact:true})).toBeVisible();
 const before=panel.getByRole('region',{name:'Comments on version 1'});const after=panel.getByRole('region',{name:'Comments on version 2'});
 await expect(before.getByText('Original version feedback')).toBeVisible();await expect(before.getByText('Current version feedback')).toHaveCount(0);await expect(after.getByText('Current version feedback')).toBeVisible();await expect(after.getByText('Original version feedback')).toHaveCount(0);await expect(before.getByRole('button')).toHaveCount(0);await expect(after.getByRole('button')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('revision-comparison.png'),animations:'disabled'});
});

test('three comments refresh discussion and card counts without downloading the catalog again',async({page})=>{
 await setupReviewApi(page);let catalogRequests=0;
 page.on('request',request=>{if(request.method()==='GET'&&new URL(request.url()).pathname.endsWith('/objects'))catalogRequests++;});
 await page.goto('/projects/project-one/screens?mode=grid');await page.getByRole('button',{name:'Review Choose a recovery method'}).click();
 for(let index=1;index<=3;index++){await page.getByLabel('Leave a note').fill(`Focused review ${index}`);await page.getByRole('button',{name:'Add comment',exact:true}).click();await expect(page.getByText(`Focused review ${index}`,{exact:true})).toBeVisible();await expect(page.getByLabel('Leave a note')).toHaveValue('');}
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('article').filter({has:page.getByRole('button',{name:'Review Choose a recovery method'})})).toContainText('3 notes');expect(catalogRequests).toBe(1);
});
