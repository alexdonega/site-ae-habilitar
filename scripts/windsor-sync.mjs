// =============================================================================
//  windsor-sync.mjs — CLI de sincronização Windsor.ai → Supabase
// =============================================================================
//  Uso (a partir da raiz do repo):
//    node scripts/windsor-sync.mjs --selftest
//        Valida o caminho de gravação no Supabase (não toca no Windsor).
//
//    node scripts/windsor-sync.mjs --days=7 [--dry-run]
//        Sincroniza os últimos N dias (default 3). --dry-run só busca e resume.
//
//    node scripts/windsor-sync.mjs --from=2026-08-01 --to=2026-08-31
//        Backfill de um período arbitrário (replace idempotente por período).
//
//  Requer no .env: WINDSOR_API_KEY, PUBLIC_SUPABASE_URL, service_role.
//  A chave nunca é impressa no output.
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- carrega .env (sem dependência de dotenv) --------------------------------
try {
    const env = readFileSync(join(repoRoot, '.env'), 'utf8');
    for (const line of env.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        const [, name, raw] = m;
        const value = raw.trim().replace(/^["']|["']$/g, '');
        if (!(name in process.env)) process.env[name] = value;
    }
} catch {
    console.error('Aviso: .env não encontrado — usando apenas variáveis de ambiente.');
}

const { syncMarketingPerformance, selftestSupabase } = await import(
    pathToFileURL(join(repoRoot, 'api', '_windsor.js')).href
);

function parseArgs(argv) {
    const opts = {};
    for (const arg of argv) {
        const m = arg.match(/^--([a-z-]+)(?:=(.*))?$/i);
        if (!m) continue;
        const [, name, value] = m;
        opts[name] = value === undefined ? true : value;
    }
    return opts;
}

const opts = parseArgs(process.argv.slice(2));

function printSummary(result) {
    const f = result.fetched;
    const w = result.written;
    console.log(`Janela: ${result.window.from} → ${result.window.to}`);
    console.log(
        `Buscado: ${f.rows} linhas · ${f.days} dias · ${f.campaigns} campanhas · ${f.ads} anúncios`
    );
    console.log(
        `Totais: spend=${f.spend} impressions=${f.impressions} clicks=${f.clicks}`
    );
    if (opts['dry-run']) {
        console.log('[dry-run] nada foi gravado no Supabase.');
    } else {
        console.log(
            `Gravado: +${w.inserted} inseridas (após limpar ${w.deleted} do período)`
        );
    }
}

try {
    if (opts.selftest) {
        console.log('Selftest Supabase (insert → read-back → delete)…');
        const r = await selftestSupabase();
        console.log('OK: caminho de gravação no Supabase funcionando.', r);
        process.exit(0);
    }

    const result = await syncMarketingPerformance({
        days: Number(opts.days) || 3,
        from: opts.from,
        to: opts.to,
        dryRun: Boolean(opts['dry-run']),
    });

    printSummary(result);

    if (!opts['dry-run'] && result.written.inserted === 0) {
        console.error(
            '\nAtenção: 0 linhas gravadas. Confira se o período tem dados no Windsor.'
        );
        process.exit(1);
    }
    process.exit(0);
} catch (err) {
    console.error('\nFalha na sincronização:');
    console.error(`  ${err.message}`);
    if (err.invalidKey) {
        console.error(
            '  → A WINDSOR_API_KEY foi rejeitada. Copie a chave completa em ' +
                'onboard.windsor.ai → Data (query bar) ou Account → API keys, ' +
                'cole no .env como WINDSOR_API_KEY= e rode de novo.'
        );
    }
    if (err.config) {
        console.error('  → Preencha as variáveis no .env (veja o cabeçalho deste script).');
    }
    process.exit(1);
}
