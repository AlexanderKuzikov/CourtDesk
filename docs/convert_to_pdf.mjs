// Generate PDF from HTML using Puppeteer (installed in CourtDesk)
import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dirname, '..', 'docs');

async function htmlToPdf(htmlFile, pdfFile) {
  const html = readFileSync(resolve(DOCS, htmlFile), 'utf-8');
  
  const browser = await puppeteer.launch({
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: resolve(DOCS, pdfFile),
      format: 'A4',
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      printBackground: true,
      displayHeaderFooter: false,
    });

    const stats = (await import('fs')).statSync(resolve(DOCS, pdfFile));
    console.log(`[PDF] Created: ${pdfFile} (${(stats.size / 1024).toFixed(0)} KB)`);
  } finally {
    await browser.close();
  }
}

async function main() {
  await htmlToPdf('CRM-INTEGRATION.html', 'CRM-INTEGRATION.pdf');
  await htmlToPdf('WEBUI-FOR-LAWYER.html', 'WEBUI-FOR-LAWYER.pdf');
  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
