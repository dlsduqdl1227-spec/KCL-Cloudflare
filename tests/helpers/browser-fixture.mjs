import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Fresh browser and local-only transport: QA must never submit real competition data.
export async function createBrowserFixture(options = {}) {
  const modulePath = process.env.KCL_PLAYWRIGHT_MODULE;
  const {chromium} = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
  const root = path.resolve(fileURLToPath(new URL('../../public/', import.meta.url)));
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local.test').pathname);
    if (pathname.startsWith('/api/')) {
      if (options.apiHandler) {
        try {
          let body=''; for await (const chunk of req) body+=chunk;
          const response=await options.apiHandler(JSON.parse(body || '{}'));
          res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
        } catch (err) { res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,message:String(err)})); }
        return;
      }
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({success:true, competitions:[], configs:[], assignments:[], list:[]}));
      return;
    }
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({channel:process.env.KCL_BROWSER_CHANNEL || 'chrome', headless:true});
  return {
    origin, browser,
    async page(width = 390, height = 900) {
      const page = await browser.newPage({viewport:{width,height}});
      page.setDefaultTimeout(15000);
      page.qaErrors = [];
      page.qaMissing = [];
      page.on('pageerror', e => page.qaErrors.push(e.message));
      page.on('response', r => { if(r.status() >= 400 && r.url().startsWith(origin))page.qaMissing.push(r.url().replace(origin,'')); });
      page.on('dialog', d => d.accept().catch(() => {}));
      await page.route('**/*', r => r.request().url().startsWith(origin) || r.request().url().startsWith('data:') ? r.continue() : r.abort());
      return page;
    },
    async close() { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  };
}

export async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' &&
      (!el.checkVisibility || el.checkVisibility({visibilityProperty:true})) &&
      ![...el.ownerDocument.querySelectorAll('details:not([open])')].some(d=>d.contains(el) && !d.querySelector('summary')?.contains(el));
    const describe = el => el.id || el.tagName + '.' + String(el.className).split(' ')[0];
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],[onclick]')].filter(visible);
    return {
      title:document.title,
      description:document.querySelector('meta[name=description]')?.content || '',
      viewport:document.querySelector('meta[name=viewport]')?.content || '',
      duplicateIds:[...new Set(ids.filter((id,i) => ids.indexOf(id)!==i))],
      brokenImages:[...document.images].filter(e=>visible(e)&&e.getAttribute('src')&&e.complete&&!e.naturalWidth).map(describe),
      unnamed:controls.filter(e => !e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.labels?.length&&!(e.innerText||'').trim()&&!e.title).map(e=>({id:describe(e),placeholder:e.getAttribute('placeholder')})),
      mouseOnly:controls.filter(e => !['INPUT','SELECT','TEXTAREA','BUTTON','A','SUMMARY'].includes(e.tagName)&&e.tabIndex<0).map(describe),
      overflow:controls.filter(e => {const r=e.getBoundingClientRect();return r.left < -2 || r.right > innerWidth + 2;}).map(describe),
      pageOverflow:document.documentElement.scrollWidth>innerWidth+1
    };
  });
}
