import { useEffect } from 'react';

// =============================================================================
//  usePageTitle — título da aba do navegador por rota (SPA tem um único
//  <title> no index.html; cada página ajusta ao montar). Sem sufixo na
//  landing, que mantém o título completo de campanha.
// =============================================================================

const BRAND = 'Autoescola Habilitar';
const DEFAULT_TITLE = 'Autoescola Habilitar - Promoção CNH';

export default function usePageTitle(title) {
    useEffect(() => {
        document.title = title ? `${title} · ${BRAND}` : DEFAULT_TITLE;
        // Restaura o título default ao desmontar (ex.: volta para /), para o
        // caso da próxima página não usar o hook.
        return () => {
            document.title = DEFAULT_TITLE;
        };
    }, [title]);
}
