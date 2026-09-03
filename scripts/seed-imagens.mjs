// =============================================================================
//  seed-imagens.mjs — popula produtos e fotos_perfil a partir das pastas locais
// =============================================================================
//  Uso (a partir da raiz do repo):
//    node scripts/seed-imagens.mjs
//        Sobe as 9 imagens de orçamento (Downloads/produtos-orcamentos) para o
//        bucket "imagens" na pasta produtos/ e cria as linhas em public.produtos
//        (nome + orçamento + copy verbatim dos scripts já usados no WhatsApp),
//        e as 5 fotos de perfil (Downloads/foto perfil) na pasta perfil/ com as
//        linhas em public.fotos_perfil.
//
//    node scripts/seed-imagens.mjs --produtos="C:\outra\pasta" --fotos="C:\outra"
//        Sobrescreve as pastas de origem.
//
//  PRÉ-REQUISITO: rodar supabase/sql/2026-09-03-produtos-imagens.sql no SQL
//  Editor do Supabase (cria as tabelas e o bucket).
//
//  Idempotente: o caminho no bucket deriva do nome do arquivo (upload com
//  upsert) e a linha só é criada se não existir outra com o mesmo imagem_path
//  (índice único no SQL). Edições feitas pela página /imagens nunca são
//  sobrescritas.
//
//  Requer no .env: PUBLIC_SUPABASE_URL, service_role. A chave nunca é impressa.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- carrega .env (sem dependência de dotenv, igual windsor-sync.mjs) --------
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

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;
const BUCKET = 'imagens';

const DIR_PRODUTOS =
    opts.produtos || 'C:\\Users\\Alex\\Downloads\\produtos-orcamentos';
const DIR_FOTOS = opts.fotos || 'C:\\Users\\Alex\\Downloads\\foto perfil';

const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

// Caminho estável no bucket (idempotência): slug do nome do arquivo original.
function pathNoBucket(nomeArquivo) {
    const ext = extname(nomeArquivo).toLowerCase();
    const base = basename(nomeArquivo, ext)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'imagem';
    return `${base}${ext}`;
}

// -----------------------------------------------------------------------------
// Manifest — mapeamento arquivo ↔ produto (verificado olhando cada flyer em
// 2026-09-03; valores conferem com os scripts orçados em
// supabase/sql/2026-09-03-mensagens.sql). A copy é verbatim desses scripts,
// com dois erros de digitação do original corrigidos (1.2970,00 → 1.297,00).
// -----------------------------------------------------------------------------
const PRODUTOS = [
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.49.jpeg',
        nome: 'Primeira habilitação Carro e Moto — Plano Básico',
        orcamento: 'À vista R$ 1.297 (de R$ 1.499,99) ou 10x no cartão',
        ordem: 10,
        copy: `🔰 PLANO BÁSICO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 02 aulas de moto
✔️ 02 aulas de carro
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de R$ 1.499,99 por apenas 1.297
Cartão: até 10x cartão
Boleto: Entrada + boletos
(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼Exame toxicológico Obrigatório`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.50.jpeg',
        nome: 'Primeira habilitação Carro e Moto — Plano Ouro',
        orcamento: 'À vista R$ 1.647 (de R$ 1.849,99) ou 10x no cartão',
        ordem: 11,
        copy: `🔰 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 05 aulas de moto
✔️ 05 aulas de carro
✔️Veículo para a prova e acompanhamento do Instrutor

Formas de Pagamento: à vista, cartão, boleto

À vista: R$ 1.849,99 por apenas 1.647
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼*Exame toxicológico Obrigatório`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.50 (1).jpeg',
        nome: 'Primeira habilitação Carro e Moto — Plano Diamante',
        orcamento: 'À vista R$ 2.097 (de R$ 2.299,99) ou 10x no cartão',
        ordem: 12,
        copy: `🔰 PLANO DIAMANTE
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 10 aulas de moto
✔️ 10 aulas de carro
✔️Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de R$ 2.299,99 por apenas R$ 2.097
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼*Exame toxicológico Obrigatório`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.51.jpeg',
        nome: 'Somente uma categoria (Carro ou Moto) — Plano Bronze',
        orcamento: 'À vista R$ 897 (de R$ 997) ou 10x no cartão',
        ordem: 13,
        copy: `🥉 PLANO BRONZE
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️2 Aulas práticas
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 997,00 por apenas 897,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.51 (1).jpeg',
        nome: 'Somente uma categoria (Carro ou Moto) — Plano Prata',
        orcamento: 'À vista R$ 1.297 (de R$ 1.397) ou 10x no cartão',
        ordem: 14,
        copy: `🥈 PLANO PRATA
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️5 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.397,00 por apenas 1.297,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.52.jpeg',
        nome: 'Somente uma categoria (Carro ou Moto) — Plano Ouro',
        orcamento: 'À vista R$ 1.697 (de R$ 1.797) ou 10x no cartão',
        ordem: 15,
        copy: `🥇 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️10 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.797,00 por apenas 1.697,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.52 (1).jpeg',
        nome: 'Adição (Carro ou Moto) — Plano Bronze',
        orcamento: 'À vista R$ 897 (de R$ 997) ou 10x no cartão',
        ordem: 16,
        copy: `🥉 PLANO BRONZE
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️2 Aulas práticas
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 997,00 por apenas 897,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.52 (2).jpeg',
        nome: 'Adição (Carro ou Moto) — Plano Prata',
        orcamento: 'À vista R$ 1.297 (de R$ 1.397) ou 10x no cartão',
        ordem: 17,
        copy: `🥈 PLANO PRATA
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️5 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.397,00 por apenas 1.297,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
    {
        arquivo: 'WhatsApp Image 2026-09-02 at 19.14.53.jpeg',
        nome: 'Adição (Carro ou Moto) — Plano Ouro',
        orcamento: 'À vista R$ 1.697 (de R$ 1.797) ou 10x no cartão',
        ordem: 18,
        copy: `🥇 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️10 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.797 por apenas 1.697
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)`,
    },
];

const FOTOS = [
    { arquivo: 'perfil-whatsapp.jpg', nome: 'Perfil atual — logos Habilitar + CNH Brasil', ordem: 1 },
    { arquivo: 'magnific_quero-somente-as-duas-log_EbxzPlnuuO.jpg', nome: 'Variação de logo 1', ordem: 2 },
    { arquivo: 'magnific_quero-somente-as-duas-log_TdtSbaBVNR.jpg', nome: 'Variação de logo 2', ordem: 3 },
    { arquivo: 'magnific_quero-somente-as-duas-log_UP3mVAowny.jpg', nome: 'Variação de logo 3', ordem: 4 },
    { arquivo: 'magnific_quero-somente-as-duas-log_xSydzNDjfW.jpg', nome: 'Variação de logo 4', ordem: 5 },
];

// -----------------------------------------------------------------------------
// Execução
// -----------------------------------------------------------------------------

async function semear(supabase, { tabela, pasta, dir, itens, campos }) {
    let subidos = 0;
    let criados = 0;
    let pulados = 0;

    for (const item of itens) {
        const rotulo = item.nome || item.arquivo;
        const origem = join(dir, item.arquivo);
        if (!existsSync(origem) || !statSync(origem).isFile()) {
            console.warn(`⚠  Não achei "${origem}" — pulando "${rotulo}".`);
            continue;
        }

        const path = `${pasta}/${pathNoBucket(item.arquivo)}`;
        const mime = MIME[extname(path)];
        if (!mime) {
            console.warn(`⚠  Extensão não suportada em "${item.arquivo}" — pulando.`);
            continue;
        }

        // 1) Sobe o objeto (upsert: mesma origem ⇒ mesmo caminho).
        const bytes = readFileSync(origem);
        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`Storage (${path}): ${upErr.message}`);
        subidos++;

        // 2) Cria a linha só se ainda não existe (nunca sobrescreve edição).
        const { data: jaExiste, error: selErr } = await supabase
            .from(tabela)
            .select('id')
            .eq('imagem_path', path)
            .maybeSingle();
        if (selErr) throw new Error(`Tabela ${tabela}: ${selErr.message}`);
        if (jaExiste) {
            pulados++;
            console.log(`=  Já cadastrado: ${rotulo}`);
            continue;
        }

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const row = {
            ...campos(item),
            imagem_url: pub.publicUrl,
            imagem_path: path,
        };
        const { error: insErr } = await supabase.from(tabela).insert(row);
        if (insErr) throw new Error(`Insert ${tabela} (${rotulo}): ${insErr.message}`);
        criados++;
        console.log(`+  ${tabela}: ${rotulo}`);
    }

    return { subidos, criados, pulados };
}

try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        throw new Error('PUBLIC_SUPABASE_URL ou service_role ausente no .env');
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Tabelas criadas pelo SQL? (erro PGRST205 = schema ainda não existe)
    const { error: probe } = await supabase.from('produtos').select('id').limit(1);
    if (probe && probe.code === 'PGRST205') {
        throw new Error(
            'A tabela "produtos" ainda não existe — rode ' +
            'supabase/sql/2026-09-03-produtos-imagens.sql no SQL Editor do Supabase primeiro.',
        );
    }
    if (probe && probe.code !== 'PGRST116') throw probe;

    console.log(`Produtos  ← ${DIR_PRODUTOS}`);
    const p = await semear(supabase, {
        tabela: 'produtos',
        pasta: 'produtos',
        dir: DIR_PRODUTOS,
        itens: PRODUTOS,
        // O manifest guarda o título completo ("X — Plano Y", igual ao seed de
        // mensagens.sql); a tabela produtos espera produto e plano separados
        // (ver 2026-09-03-produtos-produto-plano.sql).
        campos: (item) => {
            const [produto, plano = ''] = item.nome.split(' — Plano ');
            return {
                produto,
                plano,
                orcamento: item.orcamento,
                copy: item.copy,
                ordem: item.ordem,
                ativo: true,
            };
        },
    });

    console.log(`\nFotos     ← ${DIR_FOTOS}`);
    const f = await semear(supabase, {
        tabela: 'fotos_perfil',
        pasta: 'perfil',
        dir: DIR_FOTOS,
        itens: FOTOS,
        campos: (item) => ({ nome: item.nome, ordem: item.ordem, ativo: true }),
    });

    console.log(
        `\nPronto: ${p.criados + f.criados} linhas criadas, ${p.pulados + f.pulados} já existiam, ` +
        `${p.subidos + f.subidos} objetos no bucket "${BUCKET}".`,
    );
    console.log('Abra /imagens para conferir (ajuste nome/copy/orçamento por lá quando quiser).');
} catch (err) {
    console.error(`\nErro: ${err.message}`);
    process.exit(1);
}
