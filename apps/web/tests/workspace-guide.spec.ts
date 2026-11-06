import {test,expect} from '@playwright/test';
import {setupReviewApi} from './fixtures/review-api.fixture';
for(const width of [390,1440])test(`illustrated workspace and guide remain usable at ${width}px`,async({page},testInfo)=>{
 await setupReviewApi(page,false,'ru');await page.setViewportSize({width,height:1000});await page.addInitScript(()=>localStorage.setItem('agentstack.locale','ru'));
 await page.goto('/projects/project-one/overview');await expect(page.getByRole('heading',{name:'Обзор проекта',exact:true})).toBeVisible();
 const images=page.locator('button img[src^="/illustrations/"]');await expect(images).toHaveCount(4);await expect.poll(async()=>images.evaluateAll(nodes=>nodes.every(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0))).toBe(true);
 await expect(page.getByRole('main')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`dashboard-${width}.png`),fullPage:false});
 await page.goto('/guide');await expect(page.getByRole('heading',{level:1,name:'От первого проекта до принятой правки'})).toBeVisible();
 await page.getByRole('button',{name:'Далее',exact:true}).click();await expect(page.getByRole('heading',{level:2,name:'2. Отсматривайте экраны и сценарии'})).toBeVisible();
 await page.getByRole('button',{name:'Открыть в проекте',exact:true}).click();await expect(page).toHaveURL(/\/screens/);
 await page.goto('/guide');await page.getByRole('button',{name:'Далее',exact:true}).click();await page.screenshot({path:testInfo.outputPath(`guide-${width}.png`),fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('customer guide explains restricted actions and never navigates to management settings',async({page})=>{
 await setupReviewApi(page,true);await page.goto('/guide');await page.getByRole('button',{name:'11. Set up access and your account',exact:true}).click();
 await expect(page.getByText('Your project team manages connections, tokens and invitations. Ask an administrator or developer.')).toBeVisible();
 await page.getByRole('button',{name:'Open in project',exact:true}).click();await expect(page).toHaveURL(/\/overview/);
});
test('onboarding checks reflect visible material presence with bounded requests',async({page})=>{
 await setupReviewApi(page);const requests:string[]=[];
 await page.route('**/objects?kind=*',async route=>{const url=new URL(route.request().url());requests.push(url.search);expect(url.searchParams.get('limit')).toBe('1');return route.fulfill({json:{items:url.searchParams.get('kind')==='screen'?[{id:'example-screen'}]:[],nextCursor:null}})});
 await page.goto('/guide');await expect(page.getByRole('checkbox',{name:'Screens added'})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Assets added'})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Documentation added'})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Feedback added'})).not.toBeChecked();expect(requests).toHaveLength(3);
});

test('first-run welcome persists dismissal and the guide stays available',async({page})=>{
 await setupReviewApi(page);let dismissed=false;let patches=0;
 await page.route('**/api/v1/account',async route=>{const request=route.request();if(request.method()==='PATCH'){const body=request.postDataJSON();expect(body.expectedVersion).toBe(1);expect(body.preferences).toEqual({onboardingCompleted:true});dismissed=true;patches++;}return route.fulfill({json:{user:{id:'user-one',name:'Demo reviewer',email:'reviewer@example.test',isAdmin:true},version:dismissed?2:1,preferences:{locale:'en',theme:'light',accent:'#7950f2',onboardingCompleted:dismissed},avatarUrl:null,mfaEnabled:false,recoveryCodesRemaining:0}});});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Build your first workspace, step by step'})).toBeVisible();await page.getByRole('button',{name:'I know my way around'}).click();await expect(page.getByRole('heading',{name:'Build your first workspace, step by step'})).toHaveCount(0);expect(patches).toBe(1);await page.reload();await expect(page.getByRole('heading',{name:'Build your first workspace, step by step'})).toHaveCount(0);await page.getByRole('link',{name:'Getting started',exact:true}).click();await expect(page).toHaveURL(/\/guide$/);
});

test('mobile dashboard keeps enlarged Russian action text inside the card',async({page})=>{
 await setupReviewApi(page,false,'ru');await page.setViewportSize({width:390,height:844});
 await page.goto('/projects/project-one/overview');const action=page.getByRole('button',{name:'Проверьте последние изменения',exact:true});await expect(action).toBeVisible();
 await page.addStyleTag({content:'section[aria-labelledby="project-pulse-title"] button { font-size: 20px; }'});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 const button=await action.boundingBox();const card=await page.locator('section[aria-labelledby="project-pulse-title"]').boundingBox();expect(button!.x+button!.width).toBeLessThanOrEqual(card!.x+card!.width-20);
 await action.click();await expect(page).toHaveURL(/\/reviews/);
});
