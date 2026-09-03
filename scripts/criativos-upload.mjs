// =============================================================================
//  criativos-upload.mjs — Carga inicial da biblioteca de criativos
// =============================================================================
//  Sobe os arquivos de uma pasta local (default: a pasta de criativos do Alex)
//  para o bucket "criativos" do Supabase Storage e registra na tabela
//  public.criativos — com a COPY que já rodou no tráfego pago, buscada na
//  hora no Windsor.ai (conector Facebook Ads: body = texto principal,
//  title = headline exibida).
//
//  Uso (a partir da raiz do repo):
//    node scripts/criativos-upload.mjs --dry-run
//        Mostra o plano (mapeamento arquivo → anúncio → copy) sem gravar nada.
//
//    node scripts/criativos-upload.mjs
//        Sobe tudo que ainda não existe (idempotente por arquivo_nome).
//
//    node scripts/criativos-upload.mjs --dir="C:\Users\Alex\Downloads\criativos-ads"
//        Pasta alternativa.
//
//  Requer no .env: WINDSOR_API_KEY, PUBLIC_SUPABASE_URL, service_role.
//  Pré-requisito: supabase/sql/2026-09-04-criativos.sql já executado.
// =============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = 'C:\\Users\\Alex\\Downloads\\criativos-ads';

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

const { BUCKET, buildStoragePath, publicObjectUrl } = await import(
    pathToFileURL(join(repoRoot, 'api', '_criativos.js')).href
);

// --- mapeamento arquivo → anúncio de referência ------------------------------
// Campanha/setembro em vigor; ad_name bate com o que rodou (fonte da copy).
const CAMPANHA_SET = '[Conversao][Meteorico Set-26]';
const ADSET_VIDEOS = 'Raio_30km_HM_18_Negativações_demais_estados_Vídeos';
const ADSET_IMAGENS = 'Raio30km_HM_18_Negativações_demais_estados_Imagens';

const MAPPING = {
    // vídeos
    'ads.mp4': {
        titulo: 'Vídeo O Menor Preço — Horizontal 16:9',
        formato: 'vídeo 16:9',
        campaign: CAMPANHA_SET,
        adset_name: ADSET_VIDEOS,
        ad_name: 'video _o_menor_preco_horizontal', // espaço real no nome do anúncio
    },
    '0831 (2).mp4': {
        titulo: 'Vídeo O Menor Preço — Vertical 4:5',
        formato: 'vídeo 4:5',
        campaign: CAMPANHA_SET,
        adset_name: ADSET_VIDEOS,
        ad_name: 'video_o_menor_preco_vertical',
    },
    // imagens CNH Brasil — Fachada (1-4)
    ...Object.fromEntries(
        [1, 2, 3, 4].map((n) => [
            `CNH Brasil - Fachada ${n}.jpg`,
            {
                titulo: `CNH Brasil — Fachada ${n}`,
                formato: 'feed 3:4',
                campaign: CAMPANHA_SET,
                adset_name: ADSET_IMAGENS,
                ad_name: `Imagem_CNH_Fachada_${n}`,
            },
        ])
    ),
    // imagens CNH Menor Preço — Mulher (1-7)
    ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((n) => [
            `CNH Menor Preço - Mulher ${n}.jpg`,
            {
                titulo: `CNH Menor Preço — Mulher ${n}`,
                formato: 'feed 3:4',
                campaign: CAMPANHA_SET,
                adset_name: ADSET_IMAGENS,
                ad_name: `Imagem_CNH_Menor_Preço_Mulher_${n}`,
            },
        ])
    ),
    // novos criativos (ainda não rodaram) — copy da família CNH Brasil em vigor
    ...Object.fromEntries(
        [1, 2, 3].map((n) => [
            `4por5-CNH-Brasil (${n}).png`,
            {
                titulo: `CNH Brasil — Variação ${n} (nova)`,
                formato: 'feed 16:9',
                campaign: CAMPANHA_SET,
                adset_name: ADSET_IMAGENS,
                ad_name: 'Imagem - CNH Brasil - Fachada - [SET]',
            },
        ])
    ),
    'magnific_criar-variacao-dessa-imag_MBhw5QvDCm.jpg': {
        titulo: 'CNH Brasil — Variação Magnific (vertical)',
        formato: 'feed 3:4',
        campaign: CAMPANHA_SET,
        adset_name: ADSET_IMAGENS,
        ad_name: 'Imagem - CNH Brasil - Fachada - [SET]',
    },
    ...Object.fromEntries(
        ['4Rnues39Aa', 'bxSTNh25Y2', 'gO6IYqkSXO', 'vQKZSDha47'].map((sufixo, i) => [
            `magnific_criar-variacao-dessa-imag_${sufixo}.jpg`,
            {
                titulo: `CNH Brasil — Variação Magnific ${i + 1}`,
                formato: 'feed 16:9',
                campaign: CAMPANHA_SET,
                adset_name: ADSET_IMAGENS,
                ad_name: 'Imagem - CNH Brasil - Fachada - [SET]',
            },
        ])
    ),
};

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v'];
const CONTENT_TYPE = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
};

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

/** Busca a copy dos anúncios no Windsor e indexa por ad_name. */
async function fetchCopyPorAnuncio(apiKey) {
    const fields = 'campaign,adset_name,ad_name,creative_id,body,title,description';
    const url =
        `https://connectors.windsor.ai/facebook?api_key=${encodeURIComponent(apiKey)}` +
        `&fields=${encodeURIComponent(fields)}&date_from=2026-08-01&date_to=2026-09-03`;
    const res = await fetch(url);
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(`Windsor respondeu ${res.status}: ${JSON.stringify(payload && payload.error || '').slice(0, 200)}`);
    }
    let data = payload && payload.data;
    if (data && !Array.isArray(data) && Array.isArray(data.data)) data = data.data;
    const porAnuncio = new Map();
    for (const row of data || []) {
        if (!row.ad_name) continue;
        const prev = porAnuncio.get(row.ad_name) || {};
        porAnuncio.set(row.ad_name, {
            headline: prev.headline || row.title || '',
            texto_principal: prev.texto_principal || row.body || '',
            descricao: prev.descricao || row.description || '',
            creative_id: prev.creative_id || String(row.creative_id || ''),
        });
    }
    return porAnuncio;
}

/**
 * Caminho da mídia a subir. Contorno do limite de ~50MB/arquivo do plano FREE
 * do Supabase: se o original exceder 45MB e existir uma versão comprimida em
 * _cache/<mesmo nome> (ex.: ffmpeg -crf 20), sobe a comprimida — o
 * arquivo_nome registrado continua sendo o do original.
 */
function mediaPath(p) {
    const original = join(dir, p.arquivo);
    const cached = join(dir, '_cache', p.arquivo);
    try {
        if (
            statSync(original).size > 45 * 1048576 &&
            statSync(cached).size > 0 &&
            statSync(cached).size <= 45 * 1048576
        ) {
            return cached;
        }
    } catch {
        // sem _cache — segue com o original
    }
    return original;
}

const opts = parseArgs(process.argv.slice(2));
const dir = opts.dir || DEFAULT_DIR;
const dryRun = Boolean(opts['dry-run']);

const config = {
    supabaseUrl: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role,
    apiKey: process.env.WINDSOR_API_KEY,
};

if (!config.supabaseUrl || !config.serviceRoleKey) {
    console.error('Erro: PUBLIC_SUPABASE_URL / service_role ausentes no .env');
    process.exit(1);
}
if (!config.apiKey) {
    console.error('Erro: WINDSOR_API_KEY ausente no .env');
    process.exit(1);
}

try {
    console.log(`Pasta: ${dir}`);
    console.log('Buscando copy dos anúncios no Windsor (ago→set/2026)…');
    const copyPorAnuncio = await fetchCopyPorAnuncio(config.apiKey);
    console.log(`  ${copyPorAnuncio.size} anúncios com copy.\n`);

    const arquivos = readdirSync(dir).filter((f) => {
        const ext = extname(f).toLowerCase();
        return IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext);
    });
    if (!arquivos.length) {
        console.error('Nenhum arquivo de mídia encontrado na pasta.');
        process.exit(1);
    }

    const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const plano = [];
    for (const arquivo of arquivos) {
        const ext = extname(arquivo).toLowerCase();
        const tipo = VIDEO_EXT.includes(ext) ? 'video' : 'imagem';
        const mapping = MAPPING[arquivo] || null;

        // dedup por arquivo_nome
        const { data: existing } = await supabase
            .from('criativos')
            .select('id, arquivo_nome')
            .eq('arquivo_nome', arquivo)
            .maybeSingle();

        const copy = mapping ? copyPorAnuncio.get(mapping.ad_name) || null : null;
        plano.push({
            arquivo,
            tipo,
            titulo: mapping ? mapping.titulo : arquivo.replace(/\.[^.]+$/, ''),
            formato: mapping ? mapping.formato : '',
            ad_name: mapping ? mapping.ad_name : '',
            copy: copy ? `${copy.headline || '(sem headline)'} | ${(copy.texto_principal || '').slice(0, 60)}…` : '— SEM COPY —',
            existe: Boolean(existing),
            path: buildStoragePath(arquivo),
            contentType: CONTENT_TYPE[ext] || 'application/octet-stream',
            campaign: mapping ? mapping.campaign : '',
            adset_name: mapping ? mapping.adset_name : '',
            creative_id: copy ? copy.creative_id : '',
            headline: copy ? copy.headline : '',
            texto_principal: copy ? copy.texto_principal : '',
            descricao: copy ? copy.descricao : '',
        });
    }

    // --- relatório do plano ---------------------------------------------------
    console.log('=== PLANO DA CARGA ===');
    for (const p of plano) {
        console.log(`${p.existe ? '[já subido]' : '[novo]     '} ${p.arquivo}`);
        console.log(`    título: ${p.titulo} · ${p.tipo}${p.formato ? ` · ${p.formato}` : ''}`);
        console.log(`    anúncio: ${p.ad_name || '(sem referência)'}`);
        console.log(`    copy: ${p.copy}`);
    }
    const semCopy = plano.filter((p) => !p.headline && !p.texto_principal);
    if (semCopy.length) {
        console.log(`\nAviso: ${semCopy.length} arquivo(s) sem copy do Windsor (mapear manualmente na página):`);
        semCopy.forEach((p) => console.log(`  - ${p.arquivo}`));
    }

    if (dryRun) {
        console.log('\n[dry-run] Nada foi gravado.');
        process.exit(0);
    }

    // --- execução --------------------------------------------------------------
    console.log('\n=== EXECUTANDO ===');

    // bucket existe? (DDL cria; aqui só confere antes de gravar)
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets.some((b) => b.id === BUCKET)) {
        console.error(`Erro: bucket "${BUCKET}" não existe — rode supabase/sql/2026-09-04-criativos.sql.`);
        process.exit(1);
    }

    let ok = 0;
    let falhas = 0;
    for (const p of plano) {
        if (p.existe) {
            console.log(`= pulado (já registrado): ${p.arquivo}`);
            continue;
        }
        try {
            const sourcePath = mediaPath(p);
            if (sourcePath !== join(dir, p.arquivo)) {
                console.log(`  (usando cópia comprimida _cache/${p.arquivo} — original acima de 50MB)`);
            }
            const buffer = readFileSync(sourcePath);
            const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(p.path, buffer, { contentType: p.contentType, upsert: true });
            if (upErr) throw new Error(`upload: ${upErr.message}`);

            const { error: insErr } = await supabase.from('criativos').insert({
                titulo: p.titulo,
                tipo: p.tipo,
                formato: p.formato || null,
                arquivo_nome: p.arquivo,
                arquivo_path: p.path,
                arquivo_url: publicObjectUrl(config, p.path),
                headline: p.headline || null,
                texto_principal: p.texto_principal || null,
                descricao: p.descricao || null,
                campaign: p.campaign || null,
                adset_name: p.adset_name || null,
                ad_name: p.ad_name || null,
                creative_id: p.creative_id || null,
                status: 'novo',
            });
            if (insErr) throw new Error(`insert: ${insErr.message}`);
            console.log(`+ ${p.arquivo} (${(buffer.length / 1048576).toFixed(1)} MB)`);
            ok += 1;
        } catch (err) {
            console.error(`x ${p.arquivo}: ${err.message}`);
            falhas += 1;
        }
    }

    console.log(`\nConcluído: ${ok} publicados, ${falhas} falha(s), ${plano.filter((p) => p.existe).length} já existentes.`);
    process.exit(falhas ? 1 : 0);
} catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
}
