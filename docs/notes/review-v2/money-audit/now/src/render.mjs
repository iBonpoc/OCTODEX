import {createRequire} from 'module';
const require=createRequire('~/GoRix/design-2344/node_modules/');
const {chromium}=require('playwright');
import path from 'path';
const out=path.resolve(new URL('.',import.meta.url).pathname,'..');
const shots=[
 ['n01-money-invoices-dark','s=inv&theme=dark',390],['n01-money-invoices-light','s=inv&theme=light',390],
 ['n02-money-invoices-overdue-dark','s=inv&sel=over&theme=dark',390],['n02-money-invoices-overdue-light','s=inv&sel=over&theme=light',390],
 ['n03-money-estimates-dark','s=est&theme=dark',390],['n03-money-estimates-light','s=est&theme=light',390],
 ['n04-money-payments-dark','s=pay&theme=dark',390],['n04-money-payments-light','s=pay&theme=light',390],
 ['n05-money-plus-menu-invoices-dark','s=inv&menu=1&theme=dark',390],['n05-money-plus-menu-payments-dark','s=pay&menu=1&theme=dark',390],
 ['n05-money-plus-estimates-dark','s=est&tip=1&theme=dark',390],
 ['n06-money-invoices-1280-dark','s=inv&wide=1&theme=dark',1280],['n06-money-invoices-820-dark','s=inv&wide=1&theme=dark',820],
 /* списки смет для пакета «Смета» — тот же сегмент «Сметы» */
 ['../../estimate-audit/now/n01-list-swipe-dark','s=est&swipe=1&theme=dark',390],['../../estimate-audit/now/n01-list-swipe-light','s=est&swipe=1&theme=light',390],
 ['../../estimate-audit/now/n02-list-longpress-dark','s=est&press=1&theme=dark',390],
];
const b=await chromium.launch();
for(const [n,q,w] of shots){
  const p=await b.newPage({viewport:{width:w,height:w===390?844:(w===820?1000:800)},deviceScaleFactor:w===390?2:1});
  await p.goto('file://'+path.resolve(out,'src/money.html')+'#'+q.replace('wide=1','wide=1&w='+w));
  await p.reload(); await p.waitForTimeout(400);
  await p.screenshot({path:path.join(out,n+'.png'),fullPage:q.includes('s=est')&&!q.includes('press')&&!q.includes('tip')});
  await p.close();
}
await b.close();
