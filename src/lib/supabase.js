import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Cliente client-side com a anon key — as permissões reais são definidas
// pelas políticas RLS da tabela "leads" no Supabase.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
