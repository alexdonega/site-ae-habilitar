import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function AutoescolaHabilitarLanding() {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState({ days: 6, hours: 5, minutes: 33, seconds: 44 });
    const [formData, setFormData] = useState({ full_name: '', phone: '', email: '', categoria: 'Moto [A]' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    const formatPhone = (value) => {
        const numbers = value.replace(/\D/g, '').slice(0, 11);
        if (numbers.length <= 2) return numbers;
        if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    };

    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const getFirstName = (fullName) => fullName.trim().split(' ')[0];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');
        setFieldErrors({});

        if (!formData.full_name.trim()) {
            setFieldErrors(prev => ({ ...prev, full_name: 'Por favor, preencha seu nome' }));
            return;
        }

        const phoneNumbers = formData.phone.replace(/\D/g, '');
        if (!formData.phone) {
            setFieldErrors(prev => ({ ...prev, phone: 'WhatsApp é obrigatório' }));
            return;
        }
        if (phoneNumbers.length < 10 || phoneNumbers.length > 11) {
            setFieldErrors(prev => ({ ...prev, phone: 'Digite o número completo com DDD + 9 dígitos' }));
            return;
        }
        if (!isValidEmail(formData.email)) {
            setFieldErrors(prev => ({ ...prev, email: 'E-mail inválido' }));
            return;
        }
        if (!formData.categoria) {
            setFieldErrors(prev => ({ ...prev, categoria: 'Selecione uma categoria' }));
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                nome_completo: formData.full_name,
                whatsapp: formData.phone,
                email: formData.email,
                categoria_desejada: formData.categoria
            };

            // Envio para Google Sheets
            const googleSheetsPromise = fetch('https://script.google.com/macros/s/AKfycby45iOPKUUQSCYJAgmEqw_3rOoFDV54dmCGQlOsEzQFdPtDGcSls39yXTQcQ0m-OUBx/exec', {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });

            // Envio para Novo Envio Webhook
            const novoEnvioPromise = fetch('https://hook.novoenvio.com.br/webhook/f05ec049-fb8e-4e18-8a1a-c5a0c98542ef', {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            await Promise.all([googleSheetsPromise, novoEnvioPromise]);

            // Facebook Pixel Event
            if (typeof window.fbq === 'function') {
                window.fbq('track', 'CompleteRegistration');
            }

            setSubmitSuccess(true);
            setFormData({ full_name: '', phone: '', email: '', categoria: '' });

            // Redirecionamento imediato
            navigate('/grupo-vip');

        } catch (error) {
            console.error('Erro detalhado:', error);
            setSubmitError(`Erro ao enviar: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
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
        return () => clearInterval(timer);
    }, []);

    const formatNumber = (num) => String(num).padStart(2, '0');
    const scrollToForm = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans">
            {/* HERO SECTION */}
            <section className="relative min-h-screen flex flex-col" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.8)), url('assets/images/bg-campo-grande.webp')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <header className="w-full py-3 md:py-4">
                    <div className="max-w-7xl mx-auto px-4 flex justify-center">
                        <img src="assets/images/Logo fundo transparente.webp" alt="Autoescola Habilitar" className="h-12 sm:h-16 md:h-24 w-auto" width="300" height="100" />
                    </div>
                </header>
                <div className="flex-1 flex items-center">
                    <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-8">
                        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-12 items-center">
                            <div className="space-y-4 md:space-y-6 text-center lg:text-left">
                                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-tight">
                                    <span className="text-white">A CNH MAIS BARATA</span><br />
                                    <span className="text-white">DA HISTÓRIA DE</span><br />
                                    <span className="text-red-600">SORRISO!</span>
                                </h1>
                                <div className="border-2 border-red-600 bg-black/40 backdrop-blur-sm px-3 py-2 md:px-4 md:py-3 rounded-lg inline-flex items-start gap-2 md:gap-3 max-w-xl mx-auto lg:mx-0">
                                    <span className="text-red-500 text-lg md:text-xl">📍</span>
                                    <p className="text-white text-xs sm:text-sm md:text-base text-left">Válido <strong className="text-yellow-400">EXCLUSIVAMENTE</strong> para a <strong className="text-white">Autoescola Habilitar</strong> - <strong className="text-white">Rua das Videiras, 634 - sala 2 - Centro Sul, Sorriso - MT</strong></p>
                                </div>
                                <p className="text-gray-200 text-sm sm:text-base md:text-lg max-w-xl leading-relaxed mx-auto lg:mx-0">A Autoescola Habilitar vai realizar um evento <strong className="text-white">HISTÓRICO</strong>. Se você busca 1ª Habilitação ou Mudança de Categoria nos melhores valores... o momento é <strong className="text-white">AGORA!</strong></p>
                                <div className="flex flex-wrap justify-center lg:justify-start gap-2 md:gap-3">
                                    <span className="bg-gray-800/80 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 md:gap-2 border border-gray-700">📅 12 de Janeiro de 2026</span>
                                    <span className="bg-gray-800/80 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 md:gap-2 border border-gray-700">🏷️ Até R$ 520 OFF</span>
                                    <span className="bg-gray-800/80 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 md:gap-2 border border-gray-700">🔥 Apenas 50 Vagas</span>
                                </div>
                            </div>
                            <div className="w-full max-w-md mx-auto">
                                <div className="bg-white text-gray-900 rounded-xl md:rounded-2xl p-5 md:p-8 shadow-2xl border-t-4 border-red-600">
                                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-center mb-1 md:mb-2 text-gray-900">Grupo VIP de Ofertas</h2>
                                    <p className="text-gray-500 text-center text-xs sm:text-sm mb-4 md:mb-6">Preencha para garantir seu desconto exclusivo</p>
                                    <div className="space-y-3 md:space-y-4">
                                        {submitSuccess ? (
                                            <div className="text-center py-8">
                                                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <h3 className="text-xl font-bold text-green-600 mb-2">Cadastro realizado!</h3>
                                                <p className="text-gray-500">Você entrou no Grupo VIP. Aguarde nosso contato!</p>
                                            </div>
                                        ) : (
                                            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
                                                <div>
                                                    <label htmlFor="full_name" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                                                    <input
                                                        id="full_name"
                                                        type="text"
                                                        placeholder="Qual o seu nome?"
                                                        className={`w-full px-3 py-2.5 md:px-4 md:py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition text-sm md:text-base ${fieldErrors.full_name ? 'border-red-500' : 'border-gray-300'}`}
                                                        value={formData.full_name}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, full_name: e.target.value });
                                                            if (fieldErrors.full_name) setFieldErrors(prev => ({ ...prev, full_name: '' }));
                                                        }}
                                                        required
                                                    />
                                                    {fieldErrors.full_name && <span className="text-red-500 text-xs mt-1 block">{fieldErrors.full_name}</span>}
                                                </div>
                                                <div>
                                                    <label htmlFor="phone" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                                                    <input
                                                        id="phone"
                                                        type="tel"
                                                        placeholder="(67) 99999-9999"
                                                        className={`w-full px-3 py-2.5 md:px-4 md:py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition text-sm md:text-base ${fieldErrors.phone ? 'border-red-500' : 'border-gray-300'}`}
                                                        value={formData.phone}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, phone: formatPhone(e.target.value) });
                                                            if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: '' }));
                                                        }}
                                                        maxLength={16}
                                                        required
                                                    />
                                                    {fieldErrors.phone && <span className="text-red-500 text-xs mt-1 block">{fieldErrors.phone}</span>}
                                                </div>
                                                <div>
                                                    <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                                    <input
                                                        id="email"
                                                        type="email"
                                                        placeholder="seu@email.com"
                                                        className={`w-full px-3 py-2.5 md:px-4 md:py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition text-sm md:text-base ${fieldErrors.email ? 'border-red-500' : 'border-gray-300'}`}
                                                        value={formData.email}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, email: e.target.value });
                                                            if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                                                        }}
                                                        required
                                                    />
                                                    {fieldErrors.email && <span className="text-red-500 text-xs mt-1 block">{fieldErrors.email}</span>}
                                                </div>
                                                <div>
                                                    <label htmlFor="categoria" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Escolha a sua Categoria Desejada</label>
                                                    <select
                                                        id="categoria"
                                                        className={`w-full px-3 py-2.5 md:px-4 md:py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition text-sm md:text-base ${fieldErrors.categoria ? 'border-red-500' : 'border-gray-300'}`}
                                                        value={formData.categoria}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, categoria: e.target.value });
                                                            if (fieldErrors.categoria) setFieldErrors(prev => ({ ...prev, categoria: '' }));
                                                        }}
                                                        required
                                                    >
                                                        <option value="Moto [A]">Categoria A (Moto)</option>
                                                        <option value="Carro [B]">Categoria B (Carro)</option>
                                                        <option value="Carro e Moto [AB]">Categoria AB (Carro e Moto)</option>
                                                        <option value="Adição Moto [A]">Adição A (Moto)</option>
                                                        <option value="Adição Carro [B]">Adição B (Carro)</option>
                                                        <option value="Caminhão [C]">Mudança de Categoria C (Caminhão)</option>
                                                        <option value="Ônibus [D]">Mudança de Categoria D (Ônibus)</option>
                                                        <option value="Carreta [E]">Mudança de Categoria E (Carreta)</option>
                                                    </select>
                                                    {fieldErrors.categoria && <span className="text-red-500 text-xs mt-1 block">{fieldErrors.categoria}</span>}
                                                </div>
                                                <button type="submit" disabled={isSubmitting} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 md:py-4 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-2 text-sm md:text-base shadow-lg shadow-green-500/30 disabled:opacity-70 disabled:cursor-not-allowed">
                                                    {isSubmitting ? (
                                                        <>
                                                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                            Enviando...
                                                        </>
                                                    ) : (
                                                        <>🔥 QUERO MINHA VAGA</>
                                                    )}
                                                </button>
                                            </form>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* COUNTDOWN SECTION */}
            <section className="bg-red-600 py-6 md:py-10">
                <div className="text-center px-4">
                    <p className="text-white text-xs sm:text-sm md:text-base font-semibold tracking-wider mb-4 md:mb-5">ESSA PROMOÇÃO COMEÇA EM:</p>
                    <div className="flex justify-center gap-2 sm:gap-3 md:gap-4">
                        {[{ value: timeLeft.days, label: 'DIAS' }, { value: timeLeft.hours, label: 'HORAS' }, { value: timeLeft.minutes, label: 'MIN' }, { value: timeLeft.seconds, label: 'SEG' }].map((item, i) => (
                            <div key={i} className="bg-gray-800 rounded-lg md:rounded-xl px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 min-w-[60px] sm:min-w-[70px] md:min-w-[90px]">
                                <div className="text-2xl sm:text-3xl md:text-5xl font-bold text-white">{formatNumber(item.value)}</div>
                                <div className="text-gray-400 text-[10px] sm:text-xs md:text-sm mt-0.5 md:mt-1">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* DIFERENCIAIS SECTION */}
            <section className="bg-gray-900 py-12 md:py-20">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="text-center mb-8 md:mb-12">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">Condições que <span className="text-red-500">ninguém mais</span> tem coragem de oferecer</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10">
                        <div className="bg-gray-800 rounded-xl md:rounded-2xl p-5 md:p-6 text-center border-2 border-gray-700 hover:border-green-500 transition-all duration-300">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4"><svg className="w-6 h-6 md:w-8 md:h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h3 className="text-lg md:text-xl font-bold text-white mb-1 md:mb-2">Alto Índice de Aprovação</h3>
                            <p className="text-gray-400 text-sm md:text-base">Instrutores experientes que te preparam de verdade</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl md:rounded-2xl p-5 md:p-6 text-center border-2 border-gray-700 hover:border-green-500 transition-all duration-300">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4"><svg className="w-6 h-6 md:w-8 md:h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg></div>
                            <h3 className="text-lg md:text-xl font-bold text-white mb-1 md:mb-2">Cartão em até 10x</h3>
                            <p className="text-gray-400 text-sm md:text-base">Sem burocracia, parcela que cabe no seu bolso</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl md:rounded-2xl p-5 md:p-6 text-center border-2 border-gray-700 hover:border-green-500 transition-all duration-300 sm:col-span-2 md:col-span-1">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4"><svg className="w-6 h-6 md:w-8 md:h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                            <h3 className="text-lg md:text-xl font-bold text-white mb-1 md:mb-2">Promissória sem Consulta</h3>
                            <p className="text-gray-400 text-sm md:text-base">Sem SPC, sem Serasa.</p>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl md:rounded-2xl p-5 md:p-8 max-w-2xl mx-auto mb-8 md:mb-10">
                        <ul className="space-y-3 md:space-y-4">
                            <li className="flex items-center gap-2 md:gap-3"><span className="w-5 h-5 md:w-6 md:h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"><svg className="w-3 h-3 md:w-4 md:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span><span className="text-gray-200 text-sm sm:text-base md:text-lg">Maior desconto já oferecido em Sorriso</span></li>
                            <li className="flex items-center gap-2 md:gap-3"><span className="w-5 h-5 md:w-6 md:h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"><svg className="w-3 h-3 md:w-4 md:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span><span className="text-gray-200 text-sm sm:text-base md:text-lg">Rua das Videiras, 634 - sala 2 - Centro Sul</span></li>
                        </ul>
                    </div>
                    <div className="text-center">
                        <button onClick={scrollToForm} className="bg-green-500 hover:bg-green-600 text-white font-bold px-8 sm:px-10 md:px-12 py-3 md:py-4 rounded-full transition-all duration-300 transform hover:scale-105 text-base sm:text-lg shadow-lg shadow-green-500/30">QUERO GARANTIR MINHA VAGA</button>
                    </div>
                </div>
            </section>

            {/* FINAL CTA SECTION */}
            <section className="bg-gradient-to-b from-gray-800 to-gray-900 py-12 md:py-24">
                <div className="max-w-4xl mx-auto text-center px-4">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white mb-3 md:mb-4 leading-tight">Chega de depender dos outros<br /><span className="text-green-400">pra ir e vir!</span></h2>
                    <p className="text-gray-400 text-sm sm:text-base md:text-xl mb-6 md:mb-8 max-w-2xl mx-auto">Em 2026, conquiste sua liberdade. A Autoescola Habilitar tá pronta pra te ajudar a realizar esse sonho.</p>
                    <button onClick={scrollToForm} className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 sm:px-10 md:px-16 py-4 md:py-6 rounded-full transition-all duration-300 transform hover:scale-105 text-base sm:text-lg md:text-2xl shadow-xl shadow-red-600/30">SIM, QUERO MINHA CNH! 🚗</button>
                    <p className="text-gray-500 text-xs sm:text-sm mt-4 md:mt-6">Apenas 50 vagas para o dia 12 de janeiro de 2026</p>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-gray-900 border-t border-gray-800 py-8 md:py-10">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="flex justify-center mb-5 md:mb-6"><img src="assets/images/Logo fundo transparente.webp" alt="Autoescola Habilitar" className="h-16 md:h-24 w-auto" width="300" height="100" /></div>
                    <div className="flex justify-center mb-6 md:mb-8 max-w-2xl mx-auto">
                        <div className="bg-gray-800 rounded-lg p-3 md:p-4 text-center"><span className="text-red-500 font-semibold text-sm md:text-base mb-1">📍 Autoescola Habilitar</span><p className="text-gray-300 text-xs md:text-sm">Rua das Videiras, 634 - sala 2<br />Centro Sul, Sorriso - MT</p></div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-gray-400 text-xs md:text-sm mb-3 md:mb-4">
                        <a href="politica_privacidade.html" className="hover:text-white transition">Política de Privacidade</a>
                        <a href="termos_uso.html" className="hover:text-white transition">Termos de Uso</a>
                    </div>
                    <p className="text-gray-400 text-xs md:text-sm text-center">© 2026 Autoescola Habilitar. Todos os direitos reservados.</p>
                </div>
            </footer>

            <a href="https://wa.me/556699630260?text=Ol%C3%A1%21%20Quero%20tirar%20d%C3%BAvidas%20sobre%20a%20promo%C3%A7%C3%A3o%20da%20CNH" target="_blank" rel="noopener noreferrer" className="fixed bottom-4 right-4 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-all duration-300 hover:scale-110 z-50" onClick={() => window.fbq && window.fbq('track', 'Contact')} aria-label="Fale conosco no WhatsApp">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
            </a>
        </div>
    );
}

export default AutoescolaHabilitarLanding;
