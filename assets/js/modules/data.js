// Data Access Layer for ESF 26 Carisma Manager
// Handles all LocalStorage interactions

const KEYS = {
  mif: 'carisma_pessoas', // Unificado com Cadastro Central
  contracep: 'carisma_contracep_v4',
  pccu: 'carisma_pccu_v4',
  ist: 'carisma_ist_v4',
  config: 'carisma_config_v4',
  session: 'carisma_session_v4',
  soap_templates: 'carisma_soap_templates',
  soap_history: 'carisma_soap_history',
  fila_contracep: 'carisma_fila_contracep_v4'
};

const db = {
  get: k => {
    // Migração de segurança: se a chave unificada estiver vazia, tenta ler da antiga migrada
    const valor = localStorage.getItem(KEYS[k]);
    if (!valor && k === 'mif') {
      const legada = localStorage.getItem('carisma_mif_v4');
      if (legada) {
        localStorage.setItem(KEYS.mif, legada);
        return JSON.parse(legada);
      }
    }
    try { return JSON.parse(valor || '[]') } catch { return [] }
  },
  set: (k, v) => localStorage.setItem(KEYS[k], JSON.stringify(v)),
  getObj: k => { try { return JSON.parse(localStorage.getItem(KEYS[k]) || '{}') } catch { return {} } },
  setObj: (k, v) => localStorage.setItem(KEYS[k], JSON.stringify(v))
};

const exportarSistemaCompleto = () => {
  const backup = {};
  const prefixos = ['carisma_', 'carisma_map_'];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (prefixos.some(p => key.startsWith(p))) {
      backup[key] = localStorage.getItem(key);
    }
  }

  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ESF26_BACKUP_${hoje()}_${Date.now()}.carisma`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('Backup exportado com sucesso! Guarde este arquivo em um pendrive para levar para outro computador.');
};

const importarSistemaCompleto = async (file) => {
  if (!file) return;
  if (!confirm('ATENÇÃO: Isso irá substituir todos os dados atuais por este backup. Deseja continuar?')) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const backup = JSON.parse(e.target.result);
      let count = 0;

      // Suporte para restauro de backups em formato JSON legado
      const isLegacyOutput = backup.mif || backup.contraceptivos || backup.pccu || backup.ist;
      if (isLegacyOutput) {
        if (backup.mif) localStorage.setItem('carisma_pessoas', JSON.stringify(backup.mif));
        if (backup.contraceptivos) localStorage.setItem('carisma_contracep_v4', JSON.stringify(backup.contraceptivos));
        if (backup.pccu) localStorage.setItem('carisma_pccu_v4', JSON.stringify(backup.pccu));
        if (backup.ist) localStorage.setItem('carisma_ist_v4', JSON.stringify(backup.ist));
        if (backup.config) localStorage.setItem('carisma_config_v4', JSON.stringify(backup.config));
        
        alert(`Sucesso! Backup em formato legado compatibilizado e restaurado. O sistema irá recarregar.`);
        location.reload();
        return;
      }

      // Limpar chaves antigas do carisma para garantir consistência
      const prefixos = ['carisma_', 'carisma_map_'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (prefixos.some(p => key.startsWith(p))) {
          localStorage.removeItem(key);
        }
      }

      // Restaurar do backup
      for (const [key, value] of Object.entries(backup)) {
        if (prefixos.some(p => key.startsWith(p))) {
          localStorage.setItem(key, value);
          count++;
        }
      }

      alert(`Sucesso! ${count} módulos de dados foram restaurados. O sistema irá recarregar.`);
      location.reload();
    } catch (err) {
      console.error(err);
      alert('Erro ao importar backup. O arquivo pode estar corrompido.');
    }
  };
  reader.readAsText(file);
};

const utils = {
  uuid: () => Date.now().toString(36) + Math.random().toString(36).slice(2),
  hoje: () => new Date().toISOString().slice(0, 10),
  fmtData: d => d ? d.split('-').reverse().join('/') : '—',
  diffDias: (d1, d2) => { if (!d1 || !d2) return null; return Math.round((new Date(d1) - new Date(d2)) / 86400000) },
  calcIdadeNum: nasc => { 
    if (!nasc) return 0; 
    const n = new Date(nasc), h = new Date(); 
    let a = h.getFullYear() - n.getFullYear(); 
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--; 
    return a; 
  },
  diasAtraso: dp => { 
    if (!dp) return null; 
    const d = utils.diffDias(utils.hoje(), dp); 
    return d > 0 ? d : null; 
  }
};

// Export for use in other modules
window.data = { db, KEYS, utils, exportarSistemaCompleto, importarSistemaCompleto };

// Tornar global para os eventos inline (ex: onchange no HTML) e funções do app.js
window.db = db;
window.KEYS = KEYS;
window.importarSistemaCompleto = importarSistemaCompleto;
window.exportarSistemaCompleto = exportarSistemaCompleto;
window.uuid = utils.uuid;
window.hoje = utils.hoje;
window.fmtData = utils.fmtData;
window.diffDias = utils.diffDias;
window.calcIdadeNum = utils.calcIdadeNum;
window.diasAtraso = utils.diasAtraso;