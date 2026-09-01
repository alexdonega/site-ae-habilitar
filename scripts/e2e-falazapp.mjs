// Teste E2E do fluxo real de usuário: abre a landing page em Chrome headless,
// digita nos campos (eventos reais de teclado) e clica em "GARANTIR MINHA VAGA".
// Uso: node scripts/e2e-falazapp.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

const BASE = process.argv[2] || 'http://localhost:5175';
const NOME = 'Usuario Teste E2E';
const PHONE_DIGITS = '65988887777';
const EMAIL = 'usuario.teste@exemplo.com';

const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'e2e-profile-' + Date.now()),
    args: ['--no-first-run', '--disable-gpu', '--window-size=1400,2200'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 2200 });

const consoleLogs = [];
page.on('console', m => consoleLogs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));
page.on('response', r => {
    const u = r.url();
    if (u.includes('/api/') || u.includes('supabase') || u.includes('novoenvio') || u.includes('script.google')) {
        consoleLogs.push(`[fetch] ${r.status()} ${r.request().method()} ${u.slice(0, 120)}`);
    }
});

await page.goto(BASE + '/', { waitUntil: 'networkidle2' });

// Digita como usuário (eventos de teclado reais → onChange do React roda)
await page.click('#full_name');
await page.type('#full_name', NOME, { delay: 30 });

await page.click('#phone');
await page.type('#phone', PHONE_DIGITS, { delay: 30 });

await page.click('#email');
await page.type('#email', EMAIL, { delay: 30 });

const valores = await page.evaluate(() => ({
    nome: document.querySelector('#full_name').value,
    whatsapp: document.querySelector('#phone').value,
    email: document.querySelector('#email').value,
    categoria: document.querySelector('#categoria').value,
}));
console.log('Valores no formulário:', JSON.stringify(valores));

// Clica no botão de envio
await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
]);

// Espera os envios em background (Supabase, FalazApp, Sheets, Novo Envio)
await new Promise(r => setTimeout(r, 5000));

console.log('URL final:', page.url());
console.log('--- Console da página ---');
for (const l of consoleLogs) console.log(l);

await browser.close();
