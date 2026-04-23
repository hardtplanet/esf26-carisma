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
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  carregarConfig();
  navTo(location.hash.slice(1) || 'dashboard');
  atualizarBadges();
  setInterval(atualizarBadges, 60000);
};

// Export for use in other modules
window.auth = { fazerLogin, logout, checarSessao, iniciarApp };