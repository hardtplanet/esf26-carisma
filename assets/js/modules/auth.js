// Authentication Module for ESF 26 Carisma Manager
// Handles login, logout, and session management

const fazerLogin = (e) => {
  e.preventDefault();
  const s = document.getElementById('l-pass').value;
  const cfg = data.db.getObj('config');
  if (s === (cfg.senha || '123456')) {
    data.db.setObj('session', { logado: true });
    iniciarApp();
  } else { 
    document.getElementById('login-err').classList.add('show') 
  }
};

const logout = () => { 
  if (!confirm('Deseja sair?')) return; 
  data.db.removeItem(data.KEYS.session); 
  location.reload() 
};

const checarSessao = () => { 
  const s = data.db.getObj('session'); 
  if (s.logado) iniciarApp() 
};

const iniciarApp = () => {
  const loginPage = document.getElementById('login-page');
  const app = document.getElementById('app');
  const topbarDate = document.getElementById('topbar-date');
  
  if (loginPage) loginPage.style.display = 'none';
  if (app) app.style.display = 'block';
  if (topbarDate) topbarDate.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  
  if (typeof carregarConfig === 'function') carregarConfig();
  if (typeof navTo === 'function') navTo(location.hash.slice(1) || 'dashboard');
  if (typeof atualizarBadges === 'function') atualizarBadges();
  if (typeof atualizarBadges === 'function') setInterval(atualizarBadges, 60000);
};

// Export for use in other modules
window.auth = { fazerLogin, logout, checarSessao, iniciarApp };