// Main JavaScript

document.addEventListener('DOMContentLoaded', () => {

    // Máscara de Telefone (WhatsApp)
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }

    // Smooth Scroll para Links Internos
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Simulação de Envio de Formulário
    const form = document.getElementById('leadForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const originalText = btn.innerText;

            btn.innerText = 'ENVIANDO...';
            btn.disabled = true;

            // Simula delay de rede
            setTimeout(() => {
                alert('Solicitação recebida com sucesso! Em breve entraremos em contato.');
                btn.innerText = originalText;
                btn.disabled = false;
                form.reset();
            }, 1500);
        });
    }
});
