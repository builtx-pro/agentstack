import {test,expect,type Page} from '@playwright/test';
import {setupReviewApi} from './fixtures/review-api.fixture';

async function assertControls(page:Page) {
  const labels=['Search screens','Filter by tag','Filter by variant','Flow','Theme'];
  for(const label of labels){
    const bounds=await page.getByRole(label==='Search screens'?'textbox':'combobox',{name:label,exact:true}).boundingBox();
    expect(bounds,label).not.toBeNull();
    expect(bounds!.height,`${label} height`).toBe(42);
  }
  const layout=page.getByLabel('Catalog layout',{exact:true});
  expect((await layout.boundingBox())!.height).toBe(42);
  for(const label of ['Flows','Grid']) {
    const content=layout.getByText(label,{exact:true});
    const geometry=await content.evaluate(node=>{
      const icon=node.querySelector('svg')!.getBoundingClientRect();
      const text=Array.from(node.childNodes).find(child=>child.nodeType===Node.TEXT_NODE)!;
      const range=document.createRange();range.selectNodeContents(text);const bounds=range.getBoundingClientRect();
      return {iconTop:icon.top,iconBottom:icon.bottom,textTop:bounds.top,textBottom:bounds.bottom,nowrap:getComputedStyle(node).whiteSpace};
    });
    expect(Math.abs((geometry.iconTop+geometry.iconBottom)/2-(geometry.textTop+geometry.textBottom)/2)).toBeLessThan(3);
    expect(geometry.nowrap).toBe('nowrap');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}
for(const width of [390,768,1440])test(`catalog toolbar remains aligned at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1000});await setupReviewApi(page);
  await page.goto('/projects/project-one/screens?mode=flows');
  await expect(page.getByRole('heading',{name:'Screen library'})).toBeVisible();
  await assertControls(page);
  await page.screenshot({path:testInfo.outputPath(`toolbar-${width}-flows.png`),fullPage:false});
  await page.getByLabel('Catalog layout',{exact:true}).getByText('Grid',{exact:true}).click();
  await assertControls(page);
  await page.screenshot({path:testInfo.outputPath(`toolbar-${width}-grid.png`),fullPage:false});
  await page.getByLabel('Search screens').fill('recovery');
  await expect(page.getByRole('radio',{name:'Flows',exact:true})).toBeDisabled();
  await expect(page.getByRole('radio',{name:'Grid',exact:true})).toBeDisabled();
  await assertControls(page);
  await page.screenshot({path:testInfo.outputPath(`toolbar-${width}-search.png`),fullPage:false});
  if(width<=768){
    const search=(await page.getByLabel('Search screens').boundingBox())!;
    const tag=(await page.getByRole('combobox',{name:'Filter by tag',exact:true}).boundingBox())!;
    const variant=(await page.getByRole('combobox',{name:'Filter by variant',exact:true}).boundingBox())!;
    expect(tag.y).toBeGreaterThan(search.y+search.height);
    expect(tag.y).toBe(variant.y);
    expect(Math.abs(tag.width-variant.width)).toBeLessThan(1);
  }
});
