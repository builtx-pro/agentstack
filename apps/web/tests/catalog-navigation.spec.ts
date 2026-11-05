import {test,expect} from '@playwright/test';
import {setupReviewApi} from './fixtures/review-api.fixture';

test('card and viewer tags are keyboard accessible and open all matching variants',async({page})=>{
 const {objects}=await setupReviewApi(page);
 const original=objects.find((o:any)=>o.kind==='screen');
 original.tags=['recovery'];
 objects.push({...structuredClone(original),id:'other-variant',key:'other-variant',title:'Other variant recovery',data:{...original.data,variant:'another',palette:'day'}});
 await page.goto('/projects/project-one/screens?mode=grid&variant=lumen&palette=light');
 const card=page.getByRole('article').filter({has:page.getByText(original.title,{exact:true})});
 const tag=card.getByRole('button',{name:'recovery',exact:true});
 await tag.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/tag=recovery/);await expect(page).toHaveURL(/variant=__all/);
 await expect(page.getByRole('article').filter({has:page.getByText('Other variant recovery',{exact:true})})).toBeVisible();
 await card.getByRole('button',{name:'Review',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'recovery',exact:true}).focus();await page.keyboard.press('Space');
 await expect(dialog).toBeHidden();await expect(page).toHaveURL(/tag=recovery/);
 await page.getByRole('button',{name:'Clear tag filter'}).click();await expect(page).toHaveURL(/tag=&/);
});

test('source order, ungrouped screens and expandable alternate states remain discoverable',async({page})=>{
 const {objects}=await setupReviewApi(page);
 const screens=objects.filter((o:any)=>o.kind==='screen');
 const first=objects.find((o:any)=>o.kind==='flow');first.title='First source flow';first.data={...first.data,order:0,screenIds:[screens[0].id],stateIds:[screens[1].id]};
 objects.push({...structuredClone(first),id:'earlier-api-id',key:'F99',title:'Second source flow',data:{order:1,screenIds:[screens[0].id],stateIds:[]}});
 objects.reverse();
 await page.goto('/projects/project-one/screens?mode=flows');
 const headings=page.getByRole('heading',{level:3});await expect(headings.nth(0)).toHaveText('First source flow');await expect(headings.nth(1)).toHaveText('Second source flow');
 await expect(page.getByText(/^Screens without a flow/)).toBeVisible();
 const states=page.getByRole('button',{name:/Alternate states, errors & edge cases/});await expect(states).toHaveAttribute('aria-expanded','false');
 await page.getByRole('switch',{name:'Expand all alternate states'}).check();await expect(states).toHaveAttribute('aria-expanded','true');
 await page.getByRole('switch',{name:'Expand all alternate states'}).uncheck();await expect(states).toHaveAttribute('aria-expanded','false');
});

test('Russian catalog labels retain author content and tag navigation',async({page},testInfo)=>{
 await page.addInitScript(()=>localStorage.setItem('agentstack.locale','ru'));
 const {objects}=await setupReviewApi(page,false,'ru');const screen=objects.find((o:any)=>o.kind==='screen');
 await page.goto('/projects/project-one/screens?mode=grid');
 await expect(page.getByRole('textbox',{name:'Поиск экранов'})).toBeVisible();
 const card=page.getByRole('article').filter({has:page.getByText(screen.title,{exact:true})});
 await card.getByRole('button',{name:'Recovery',exact:true}).click();
 await expect(page.getByText('Тег: Recovery',{exact:true})).toBeVisible();
 await card.getByRole('button',{name:'Обсудить',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('tab',{name:'Версии и история'})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('russian-catalog-viewer.png'),fullPage:false});
});

test('tag navigation clears committed and pending search text',async({page})=>{
 const {objects}=await setupReviewApi(page);const screen=objects.find((o:any)=>o.kind==='screen');
 await page.goto('/projects/project-one/screens?mode=grid');
 const input=page.getByRole('textbox',{name:'Search screens'});await input.fill('recovery');await expect(page).toHaveURL(/q=recovery/);
 const tag=page.getByRole('article').filter({has:page.getByText(screen.title,{exact:true})}).getByRole('button',{name:'Recovery',exact:true});await tag.click();await expect(input).toHaveValue('');
 await input.fill('pending search');await tag.click();await expect(input).toHaveValue('');await page.waitForTimeout(400);expect(new URL(page.url()).searchParams.get('q')).toBe('');
});
