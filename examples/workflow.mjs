import {chromium} from 'playwright';
import {PlaywrightAdapter,runPlan,saveBundle,verifyDownload} from '../dist/index.js';
import {startFixture} from '../dist/fixture.js';
import path from 'node:path';
const output=path.resolve(process.argv[2]??'browser-evidence');const fixture=await startFixture();let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSERASSERT_EXECUTABLE?{executablePath:process.env.BROWSERASSERT_EXECUTABLE}:{})});const page=await browser.newPage();await page.goto(fixture.url);
 // An automation/agent owns these actions; the verifier only observes their outcomes.
 await page.locator('#name').fill('Alice');await page.locator('#save').click();
 const plan={schemaVersion:1,id:'settings-persist',authenticated:{selector:'#identity',expected:'Signed in'},checks:[{id:'name-after-reload',selector:'#name',expected:'Alice',reload:true}]};
 const result=await runPlan(plan,new PlaywrightAdapter(page));await saveBundle(output,plan,result,{screenshotPage:page,redactSelectors:['#secret'],redactValues:['demo-secret']});
 await page.locator('#form button').click();const form=await runPlan({schemaVersion:1,id:'submission',checks:[{id:'receipt',selector:'#receipt',expected:'Submitted'}]},new PlaywrightAdapter(page));
 const pending=page.waitForEvent('download');await page.getByText('Download',{exact:true}).click();const download=await verifyDownload(await pending,{expectedFilename:'report.txt'});
 console.log(JSON.stringify({settings:result.verdict,form:form.verdict,download:download.verdict,bundle:output},null,2));if([result,form,download].some(r=>r.verdict!=='verified'))process.exitCode=1;
}finally{if(browser)await browser.close();await fixture.close();}
