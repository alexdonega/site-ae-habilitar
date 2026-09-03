// =============================================================================
//  _criativos.js — Núcleo da biblioteca de criativos (Storage + tabela)
// =============================================================================
//  Compartilhado por:
//    • api/criativos.js     (Vercel function: /api/criativos)
//    • vite.config.js       (middleware dev — paridade com produção)
//    • scripts/criativos-upload.mjs (carga inicial da pasta local)
//
//  Tabela public.criativos + bucket público "criativos" do Storage
//  (DDL em supabase/sql/2026-09-04-criativos.sql). A tabela tem RLS sem
//  policies: só a service_role (sempre server-side) lê e escreve.
//
//  Uploads do navegador NÃO passam pela função da Vercel (limite de corpo
//  ~4,5MB): o cliente pede aqui uma signed upload URL e envia o arquivo
//  direto para o Storage do Supabase; depois registra os metadados.
//
//  Decisão do Alex em 2026-09-03: página aberta, sem token (mesmo padrão de
//  /api/produtos e /api/fotos-perfil do /imagens) — leitura E escrita.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'criativos';

// Campos de texto editáveis da tabela (whitelist de insert/update).
export const EDITABLE_FIELDS = [
    'titulo',
    'tipo',
    'formato',
    'arquivo_nome',
    'arquivo_path',
    'headline',
    'texto_principal',
    'descricao',
    'campaign',
    'adset_name',
    'ad_name',
    'creative_id',
    'status',
    'observacoes',
];

const STATUS_VALUES = ['novo', 'aprovado', 'em_uso', 'arquivado'];

export function criativosConfigFromEnv() {
    return {
        supabaseUrl:
            process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
        serviceRoleKey:
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.service_role ||
            '',
    };
}

export function requireCriativosConfig(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey) {
        const err = new Error(
            'Credenciais do Supabase ausentes (PUBLIC_SUPABASE_URL / service_role)'
        );
        err.config = true;
        return err;
    }
    return null;
}

function client(config) {
    return createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export function slugifyFilename(filename) {
    const ext = (filename.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    const base = filename
        .slice(0, filename.length - ext.length)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${base || 'arquivo'}${ext}`;
}

/** Caminho do objeto no bucket: criativos/<aaaa-mm>/<slug-do-arquivo>. */
export function buildStoragePath(filename) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${month}/${slugifyFilename(filename)}`;
}

/** URL pública de um objeto do bucket (bucket público serve sem auth). */
export function publicObjectUrl(config, path) {
    const root = config.supabaseUrl.replace(/\/$/, '');
    return `${root}/storage/v1/object/public/${BUCKET}/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
}

/** Valida/normaliza campos para insert/update. Retorna { row } ou { error }. */
export function sanitizeCriativoFields(input, { partial = false } = {}) {
    const row = {};
    for (const field of EDITABLE_FIELDS) {
        if (!(field in input)) continue;
        const value = input[field];
        if (value === null || value === undefined || value === '') {
            row[field] = null;
            continue;
        }
        if (typeof value !== 'string' || value.length > 5000) {
            return { error: `Campo "${field}" inválido` };
        }
        row[field] = value.trim() || null;
    }
    if (row.tipo && !['imagem', 'video'].includes(row.tipo)) {
        return { error: 'tipo deve ser "imagem" ou "video"' };
    }
    if (row.status && !STATUS_VALUES.includes(row.status)) {
        return { error: `status deve ser um de: ${STATUS_VALUES.join(', ')}` };
    }
    if (!partial) {
        if (!row.titulo) return { error: 'titulo é obrigatório' };
        if (!row.tipo) return { error: 'tipo é obrigatório (imagem|video)' };
        if (!row.arquivo_path) return { error: 'arquivo_path é obrigatório' };
    }
    return { row };
}

/** Lista todos os criativos, mais recentes primeiro. */
export async function listCriativos({ config }) {
    const { data, error } = await client(config)
        .from('criativos')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(1000);
    if (error) throw error;
    return data || [];
}

/**
 * Cria uma signed upload URL para o cliente enviar o arquivo DIRETO ao
 * Storage (bypassa o limite de corpo da Vercel). O caminho é gerado aqui
 * para o cliente não escolher caminhos arbitrários.
 */
export async function createUploadUrl({ config, filename }) {
    if (!filename || typeof filename !== 'string' || filename.length > 260) {
        throw Object.assign(new Error('filename inválido'), { badInput: true });
    }
    const path = buildStoragePath(filename);
    const { data, error } = await client(config)
        .storage.from(BUCKET)
        .createSignedUploadUrl(path, { expiresIn: 3600 });
    if (error) throw error;
    return {
        bucket: BUCKET,
        path,
        token: data.token,
        signedUrl: data.signedUrl,
        publicUrl: publicObjectUrl(config, path),
    };
}

/** Insere um criativo (upload já feito — path + metadados). */
export async function insertCriativo({ config, input }) {
    const { row, error } = sanitizeCriativoFields(input);
    if (error) throw Object.assign(new Error(error), { badInput: true });

    if (row.arquivo_nome) {
        const { data: existing } = await client(config)
            .from('criativos')
            .select('id, arquivo_nome')
            .eq('arquivo_nome', row.arquivo_nome)
            .maybeSingle();
        if (existing) {
            throw Object.assign(
                new Error(`Já existe um criativo com o arquivo "${row.arquivo_nome}"`),
                { conflict: true }
            );
        }
    }

    const payload = { ...row, arquivo_url: publicObjectUrl(config, row.arquivo_path) };
    const { data, error: insertError } = await client(config)
        .from('criativos')
        .insert(payload)
        .select()
        .single();
    if (insertError) throw insertError;
    return data;
}

/** Atualiza campos editáveis de um criativo (atualizado_em via trigger). */
export async function updateCriativo({ config, id, input }) {
    const { row, error } = sanitizeCriativoFields(input, { partial: true });
    if (error) throw Object.assign(new Error(error), { badInput: true });
    if (!Object.keys(row).length) {
        throw Object.assign(new Error('Nenhum campo para atualizar'), { badInput: true });
    }
    const db = client(config);

    // Troca de mídia: o path novo exige URL nova, e o objeto antigo sai do
    // Storage (best-effort — falha aqui não bloqueia o update).
    if (row.arquivo_path) {
        const { data: atual } = await db
            .from('criativos')
            .select('id, arquivo_path')
            .eq('id', id)
            .maybeSingle();
        row.arquivo_url = publicObjectUrl(config, row.arquivo_path);
        if (atual && atual.arquivo_path && atual.arquivo_path !== row.arquivo_path) {
            try {
                await db.storage.from(BUCKET).remove([atual.arquivo_path]);
            } catch {
                // objeto já removido/inacessível — segue o update
            }
        }
    }

    const { data, error: updateError } = await db
        .from('criativos')
        .update(row)
        .eq('id', id)
        .select()
        .single();
    if (updateError) throw updateError;
    if (!data) throw Object.assign(new Error('Criativo não encontrado'), { notFound: true });
    return data;
}

/** Remove o criativo e o objeto do Storage (falha no Storage não bloqueia). */
export async function deleteCriativo({ config, id }) {
    const db = client(config);
    const { data, error } = await db
        .from('criativos')
        .select('id, arquivo_path')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Criativo não encontrado'), { notFound: true });

    if (data.arquivo_path) {
        try {
            await db.storage.from(BUCKET).remove([data.arquivo_path]);
        } catch {
            // objeto já removido/inacessível — segue para apagar a row
        }
    }
    const { error: delError } = await db.from('criativos').delete().eq('id', id);
    if (delError) throw delError;
    return { ok: true };
}
