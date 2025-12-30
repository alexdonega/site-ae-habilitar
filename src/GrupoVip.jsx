import React, { useState, useEffect } from 'react';

function GrupoVip() {
    const [timeLeft, setTimeLeft] = useState({ days: 6, hours: 5, minutes: 33, seconds: 44 });

    useEffect(() => {
        // Timer para contagem regressiva visual
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                let { days, hours, minutes, seconds } = prev;
                seconds--;
                if (seconds < 0) { seconds = 59; minutes--; }
                if (minutes < 0) { minutes = 59; hours--; }
                if (hours < 0) { hours = 23; days--; }
                if (days < 0) { days = 0; hours = 0; minutes = 0; seconds = 0; }
                return { days, hours, minutes, seconds };
            });
        }, 1000);

        // Redirecionamento automático após 7 segundos
        const redirectTimer = setTimeout(() => {
            window.location.href = "https://chat.whatsapp.com/KCD3kqs8Lu97EDhkTAADL6";
        }, 7000);

        // Facebook Pixel Event
        if (typeof window.fbq === 'function') {
            window.fbq('track', 'Lead');
        }

        return () => {
            clearInterval(timer);
            clearTimeout(redirectTimer);
        };
    }, []);

    const formatNumber = (num) => String(num).padStart(2, '0');

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans">
            {/* HERO SECTION */}
            <section className="relative min-h-screen flex flex-col" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.95)), url('assets/images/Cidade-de-Sorriso-Sim-Incorporadora-1024x627.webp')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <header className="w-full py-3 md:py-4">
                    <div className="max-w-7xl mx-auto px-4 flex justify-center items-center gap-4 md:gap-6">
                        <img src="assets/images/cnh-do-brasil.webp" alt="CNH do Brasil" className="h-10 sm:h-14 md:h-20 w-auto" />
                        <img src="assets/images/logo-autoescola-habilitar.webp" alt="Autoescola Habilitar" className="h-12 sm:h-16 md:h-24 w-auto" width="300" height="100" />
                    </div>
                </header>

                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-4xl mx-auto px-4 py-8 text-center">
                        <div className="mb-8">
                            <span className="inline-block bg-yellow-500 text-black font-bold px-4 py-1 rounded-full text-sm md:text-base mb-4 animate-pulse">
                                ⚠️ ATENÇÃO: NÃO FECHE ESSA PÁGINA
                            </span>
                            <h1 className="text-3xl sm:text-4xl md:text-6xl font-black leading-tight mb-6 text-white">
                                ESPERE, ESPERE...<br />
                                <span className="text-habilitar-orange">AINDA FALTA UM PASSO</span>
                            </h1>
                            <p className="text-gray-300 text-lg md:text-2xl max-w-2xl mx-auto leading-relaxed mb-4">
                                As condições especiais de lançamento serão liberadas no dia <strong className="text-white">12 de janeiro de 2026</strong>,
                                apenas para quem estiver no <strong className="text-green-400">Grupo VIP do WhatsApp</strong>.
                            </p>
                            <p className="text-habilitar-orange font-semibold text-base md:text-xl mb-8">CNH do Brasil, sua liberdade começa agora.</p>
                        </div>

                        <div className="flex flex-col items-center gap-6">
                            <a href="https://chat.whatsapp.com/KCD3kqs8Lu97EDhkTAADL6" target="_blank" rel="noopener noreferrer" className="bg-green-500 hover:bg-green-600 text-white font-bold px-8 md:px-12 py-4 md:py-6 rounded-full transition-all duration-300 transform hover:scale-105 text-lg md:text-2xl shadow-xl shadow-green-500/30 flex items-center gap-3" onClick={() => window.fbq && window.fbq('track', 'Lead')}>
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                ENTRAR NO GRUPO VIP
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default GrupoVip;
