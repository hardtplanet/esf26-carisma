// ESF 26 Carisma Manager v4.0 - app.js
// DATA MANAGEMENT functions are now in assets/js/modules/data.js
// AUTH ──────────────────────────────────────────────────
// Functions now in assets/js/modules/auth.js
// Access via auth.fazerLogin, auth.logout, auth.checarSessao, auth.iniciarApp

// Evento disparado quando dados são sincronizados da nuvem
window.addEventListener('dadosSincronizados', () => {
  console.log("Dados sincronizados, atualizando visualização...");
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderMIF === 'function') renderMIF();
  if (typeof renderContracep === 'function') renderContracep();
  if (typeof renderPCCU === 'function') renderPCCU();
  if (typeof renderIST === 'function') renderIST();
  if (typeof atualizarBadges === 'function') atualizarBadges();
});

// ── NAV ───────────────────────────────────────────────────
function navTo(pg) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link[data-page]').forEach(l => l.classList.remove('active'));
  const el = document.getElementById('pg-' + pg); if (el) el.classList.add('active');
  const lk = document.querySelector(`[data-page="${pg}"]`); if (lk) lk.classList.add('active');
  const titles = {
    dashboard: 'Dashboard', mif: 'Cadastro MIF', contraceptivos: 'Contraceptivos',
    pccu: 'Citopatológicos', ists: 'ISTs / Vaginoses', alertas: 'Central de Alertas',
    relatorios: 'Relatórios', importar: 'Importar e-SUS', configuracoes: 'Configurações',
    'cadastro-central': 'Cadastro Central — População',
    'puericultura': 'Acompanhamento de Puericultura',
    'painel-saude': 'Painel de Saúde Global (Epidemiológico)',
    'soap-templates': 'Banco de SOAP'
  };
  document.getElementById('page-title').textContent = titles[pg] || pg;
  location.hash = pg;
  document.getElementById('sidebar').classList.remove('open');
  if (pg === 'dashboard') renderDashboard();
  if (pg === 'painel-saude') renderHealthPanel();
  if (pg === 'mif') renderMIF();
  if (pg === 'contraceptivos') renderContracep();
  if (pg === 'pccu') renderPCCU();
  if (pg === 'ists') renderIST();
  if (pg === 'alertas') renderAlertas();
  if (pg === 'soap-templates') renderSOAPTemplates();
  if (pg === 'administrativo') renderPedidosMedicamentos();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open') }

// ── DASHBOARD ─────────────────────────────────────────────
let charts = {};
function renderDashboard() {
  const mifs = data.db.get('mif').filter(m => {
    const sx = (m.sexo || '').toLowerCase();
    const idade = data.utils.calcIdadeNum(m.nasc);
    const isFem = sx.startsWith('f') || sx === '';
    return isFem && idade >= 10 && idade <= 49 && m.situacao !== 'Inativa' && m.situacao !== 'Óbito';
  });
  const ists = data.db.get('ist');
  const atrasados = calcAtrasados();

  const setVal = (id, val) => { 
    const el = document.getElementById(id); 
    if (el) {
      el.textContent = val;
      // Adiciona atributo para styling de cards zeros
      const card = el.closest('.dash-card');
      if (card) {
        card.setAttribute('data-val', val);
        if (val === 0 || val === '0') {
          card.classList.add('dash-zero');
        } else {
          card.classList.remove('dash-zero');
        }
      }
    }
  };
  setVal('d-total-geral', data.db.get('mif').length);
  setVal('d-total', mifs.length);
  setVal('d-atrasados', atrasados.length);
  setVal('d-pccu', mifs.filter(m => {
    const dt = m.pccuData || m.dataUltPCCU;
    if (!dt || dt === '-') return true;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dt) ? dt : typeof parseDateBR === 'function' ? parseDateBR(dt) : (dt ? dt.split('/').reverse().join('-') : null);
    return !iso || data.utils.diffDias(data.utils.hoje(), iso) > 365;
  }).length);
  setVal('d-ist', ists.filter(i => i.status === 'Em Tratamento' || i.status === 'Acompanhamento').length);
  setVal('d-adol', mifs.filter(m => data.utils.calcIdadeNum(m.nasc) <= 19 && (!m.metodo || m.metodo === 'Nenhum' || m.metodo === '')).length);

  // PUERICULTURA: Crianças <= 18 meses
  const pueri = data.db.get('mif').filter(p => {
    if (!p.nasc) return false;
    const n = new Date(p.nasc), h = new Date();
    const meses = (h.getFullYear() - n.getFullYear()) * 12 + (h.getMonth() - n.getMonth());
    return meses <= 18 && p.situacao !== 'Inativa' && p.situacao !== 'Óbito';
  });
  setVal('d-pueri', pueri.length);

  // GESTANTES: Lógica Multi-Fonte e Leniente
  const gPN = JSON.parse(localStorage.getItem('carisma_prenatal_gestantes') || '[]');
  const gCC = data.db.get('mif').filter(p => (p.tags || []).includes('Gestante'));
  const mapG = new Map();

  gPN.forEach(g => {
    const sit = (g.situacao || '').trim().toLowerCase();
    if (!sit || sit.includes('acompanhamento') || sit.includes('ativa')) {
      const k = (g.cns || g.cpf || g.id || g.nome || '').trim().toLowerCase();
      if (k) mapG.set(k, g);
    }
  });
  gCC.forEach(g => {
    const k = (g.cns || g.cpf || g.id || g.nome || '').trim().toLowerCase();
    if (k && !mapG.has(k)) mapG.set(k, g);
  });
  setVal('d-gestantes', mapG.size);

  if (typeof atualizarCCStats === 'function') { try { atualizarCCStats(); } catch (e) { } }

  const ab = document.getElementById('dash-alertas-box');
  if (ab) ab.style.display = atrasados.length > 0 ? 'flex' : 'none';
  const an = document.getElementById('dash-alerta-n');
  if (an) an.textContent = atrasados.length;

  const prio = [
    ...atrasados.map(a => ({ nome: a.nome, idade: data.utils.calcIdadeNum(a.nasc), motivo: 'Contraceptivo atrasado', dias: a.diasAtraso + 'd', tel: a.tel || a.telCelular, id: a.id })),
    ...mifs.filter(m => data.utils.calcIdadeNum(m.nasc) <= 19 && (!m.metodo || m.metodo === 'Nenhum'))
      .map(m => ({ nome: m.nome, idade: data.utils.calcIdadeNum(m.nasc), motivo: 'Adolescente sem contraceptivo', dias: '—', tel: m.tel || m.telCelular, id: m.id }))
  ].slice(0, 15);

  const tb = document.getElementById('tb-prioridades');
  if (tb) {
    tb.innerHTML = prio.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text2)">✅ Nenhuma prioridade hoje</td></tr>'
      : prio.map(p => `<tr><td><strong>${p.nome}</strong></td><td>${p.idade} anos</td><td>${p.motivo}</td>
        <td style="color:var(--danger);font-weight:700">${p.dias}</td><td>${p.tel || '—'}</td>
        <td><button class="btn btn-sm btn-outline" onclick="verMIF('${p.id}')">Ver</button></td></tr>`).join('');
  }

  try { renderCharts(mifs); } catch (e) { console.error('[Dashboard] Erro Crítico:', e); }
}
function renderCharts(mifs) {
  if (typeof Chart === 'undefined') { console.warn('Chart.js não carregado'); return; }

  const metodos = {}; mifs.forEach(m => { try { const k = m.metodo || 'Nenhum'; metodos[k] = (metodos[k] || 0) + 1 } catch (e) { } });
  const faixas = { '10-14': 0, '15-19': 0, '20-24': 0, '25-29': 0, '30-34': 0, '35-39': 0, '40-44': 0, '45-49': 0, '50+': 0 };
  mifs.forEach(m => {
    try {
      const i = calcIdadeNum(m.nasc);
      if (i >= 10 && i <= 14) faixas['10-14']++; else if (i <= 19) faixas['15-19']++; else if (i <= 24) faixas['20-24']++;
      else if (i <= 29) faixas['25-29']++; else if (i <= 34) faixas['30-34']++; else if (i <= 39) faixas['35-39']++;
      else if (i <= 44) faixas['40-44']++; else if (i <= 49) faixas['45-49']++; else faixas['50+']++;
    } catch (e) { }
  });
  const riscos = { 'Baixo': 0, 'Moderado': 0, 'Alto': 0 }; mifs.forEach(m => { try { let r = m.risco || 'Baixo'; if (riscos.hasOwnProperty(r)) riscos[r]++; else riscos['Baixo']++; } catch (e) { } });
  const statusC = { 'Em Dia': 0, 'Atrasado': 0, 'Sem método': 0 };
  mifs.forEach(m => {
    try {
      if (!m.metodo || m.metodo === 'Nenhum') { statusC['Sem método']++; return }
      statusC[diasAtraso(m.proximaDose) ? 'Atrasado' : 'Em Dia']++
    } catch (e) { }
  });

  const mk = (id, type, labels, data, colors, datasetLabel) => {
    const ctx = document.getElementById(id); if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type, data: { labels, datasets: [{ label: datasetLabel || 'Total', data, backgroundColor: colors || ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444'], borderWidth: 1 }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  };
  mk('chart-metodos', 'doughnut', Object.keys(metodos), Object.values(metodos), null, 'Uso de Métodos');
  mk('chart-faixa', 'bar', Object.keys(faixas), Object.values(faixas), '#8B5CF6', 'Pacientes');
  mk('chart-risco', 'doughnut', Object.keys(riscos), Object.values(riscos), ['#10B981', '#F59E0B', '#EF4444'], 'Grau de Risco');
  mk('chart-status', 'doughnut', Object.keys(statusC), Object.values(statusC), ['#10B981', '#EF4444', '#9CA3AF'], 'Status de Uso');
}

function renderHealthPanel() {
  console.log('[Painel Saúde] Iniciando renderização...');
  const ps = data.db.get('mif') || [];
  console.log('[Painel Saúde] Pacientes encontrados:', ps.length);

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
    else console.warn(`[Painel Saúde] Elemento #${id} não encontrado.`);
  };

  const diab = ps.filter(p => (p.tags || []).includes('Diabético')).length;
  const hiper = ps.filter(p => (p.tags || []).includes('Hipertenso')).length;
  const gest = ps.filter(p => (p.tags || []).includes('Gestante')).length;

  console.log('[Painel Saúde] Stats:', { diab, hiper, gest });

  setVal('h-diab', diab);
  setVal('h-hiper', hiper);
  setVal('h-gest', gest);

  if (typeof Chart === 'undefined') {
    console.error('[Painel Saúde] Chart.js não está disponível!');
    return;
  }

  // 1. Gráfico de Condições
  const tagsAlvo = ['Diabético', 'Hipertenso', 'Tabagista', 'Acamado', 'Saúde Mental', 'Puericultura', 'Hanseníase', 'Tuberculose'];
  const condContagem = {};
  tagsAlvo.forEach(t => {
    condContagem[t] = ps.filter(p => (p.tags || []).includes(t)).length;
  });

  // 2. Gráfico de Microáreas (Prevalência de Crônicos)
  const microContagem = {};
  const cronicos = ps.filter(p => {
    const t = p.tags || [];
    return t.includes('Diabético') || t.includes('Hipertenso') || t.includes('Hanseníase') || t.includes('Tuberculose');
  });
  cronicos.forEach(p => {
    const m = p.microArea || 'Sem área';
    microContagem[m] = (microContagem[m] || 0) + 1;
  });

  // 3. Perfil Etário (Crônicos)
  const faixas = { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80+': 0 };
  cronicos.forEach(p => {
    const idx = data.utils.calcIdadeNum(p.nasc);
    if (idx < 20) faixas['0-19']++;
    else if (idx < 40) faixas['20-39']++;
    else if (idx < 60) faixas['40-59']++;
    else if (idx < 80) faixas['60-79']++;
    else faixas['80+']++;
  });

  const mk = (id, type, labels, data, colors, datasetLabel) => {
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`[Painel Saúde] Canvas #${id} não encontrado.`);
      return;
    }
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type, data: { labels, datasets: [{ label: datasetLabel || 'Total', data, backgroundColor: colors || ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#06B6D4', '#6366F1'], borderWidth: 1 }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  };

  mk('chart-saude-condicoes', 'doughnut', Object.keys(condContagem), Object.values(condContagem), null, 'Condições');
  mk('chart-saude-microareas', 'bar', Object.keys(microContagem), Object.values(microContagem), '#3B82F6', 'Pacientes Crônicos');
  mk('chart-saude-idade', 'bar', Object.keys(faixas), Object.values(faixas), '#10B981', 'Distribuição Etária');
}

// ── MIF CRUD ──────────────────────────────────────────────
function abrirModalMIF(id) {
  document.getElementById('mif-modal-title').textContent = id ? 'Editar – MIF' : 'Nova Mulher – MIF';
  document.getElementById('form-mif').reset(); document.getElementById('mif-id').value = '';
  if (id) {
    const m = db.get('mif').find(x => x.id === id); if (!m) return;
    const s = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || '' };
    s('mif-id', m.id); s('mif-nome', m.nome); s('mif-nomesocial', m.nomeSocial); s('mif-nasc', m.nasc);
    s('mif-cns', m.cns); s('mif-cpf', m.cpf); s('mif-tel', m.tel); s('mif-micro', m.microArea); s('mif-end', m.endereco);
    s('mif-gest', m.gestacoes || 0); s('mif-partos', m.partos || 0); s('mif-ces', m.cesareas || 0);
    s('mif-abort', m.abortamentos || 0); s('mif-fvivos', m.filhosVivos || 0); s('mif-dum', m.dum);
    s('mif-metodo', m.metodo); s('mif-inicio-metodo', m.inicioMetodo); s('mif-proxima-dose', m.proximaDose); s('mif-obs-metodo', m.obsMetodo);
    s('mif-pccu-data', m.pccuData); s('mif-pccu-result', m.pccuResultado); s('mif-pccu-status', m.pccuStatus || 'Pendente'); s('mif-pccu-prox', m.pccuProx);
    s('mif-hpv', m.hpv || 'Não'); s('mif-hepb', m.hepatiteB || 'Não'); s('mif-risco', m.risco || 'Baixo');
    s('mif-prioridade', m.prioridade || 'Rotina'); s('mif-situacao', m.situacao || 'Ativa'); s('mif-obs', m.obs);
    calcIdade();
  }
  toggleDose(); abrirModal('modal-mif');
}
function salvarMIF(e) {
  e.preventDefault();
  const id = document.getElementById('mif-id').value;
  const nasc = document.getElementById('mif-nasc').value;
  const metodo = document.getElementById('mif-metodo').value;
  const idade = data.utils.calcIdadeNum(nasc);
  let risco = document.getElementById('mif-risco').value;
  let prioridade = document.getElementById('mif-prioridade').value;
  if (idade <= 19 && (!metodo || metodo === 'Nenhum')) { risco = 'Alto'; prioridade = 'Prioritária' }
  const g = eid => document.getElementById(eid).value;
  const obj = {
    id: id || data.utils.uuid(), nome: g('mif-nome').trim(), nomeSocial: g('mif-nomesocial').trim(),
    nasc, idade, cns: g('mif-cns').trim(), cpf: g('mif-cpf').trim(), tel: g('mif-tel').trim(),
    microArea: g('mif-micro'), endereco: g('mif-end').trim(),
    gestacoes: +g('mif-gest'), partos: +g('mif-partos'), cesareas: +g('mif-ces'),
    abortamentos: +g('mif-abort'), filhosVivos: +g('mif-fvivos'), dum: g('mif-dum'),
    metodo, inicioMetodo: g('mif-inicio-metodo'), proximaDose: g('mif-proxima-dose'), obsMetodo: g('mif-obs-metodo'),
    pccuData: g('mif-pccu-data'), pccuResultado: g('mif-pccu-result'), pccuStatus: g('mif-pccu-status'), pccuProx: g('mif-pccu-prox'),
    hpv: g('mif-hpv'), hepatiteB: g('mif-hepb'), risco, prioridade, situacao: g('mif-situacao'), obs: g('mif-obs'),
    dataCadastro: id ? undefined : new Date().toISOString(), dataAtualizacao: new Date().toISOString()
  };
  let lista = data.db.get('mif');
  lista = id ? lista.map(x => x.id === id ? { ...x, ...obj } : x) : [...lista, obj];
  data.db.set('mif', lista); fecharModal('modal-mif'); renderMIF(); atualizarBadges();
}
function renderMIF() {
  const busca = document.getElementById('s-mif').value.toLowerCase();
  const fM = document.getElementById('f-metodo').value;
  const fR = document.getElementById('f-risco').value;
  const fA = document.getElementById('f-microarea').value;
  let lista = data.db.get('mif');
  const areas = [...new Set(lista.map(m => m.microArea).filter(Boolean))].sort();
  const sel = document.getElementById('f-microarea'); const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as microáreas</option>' + areas.map(a => `<option${a === cur ? ' selected' : ''}>${a}</option>`).join('');
  if (busca) lista = lista.filter(m => (m.nome + m.cns + m.cpf).toLowerCase().includes(busca));
  if (fM) lista = lista.filter(m => m.metodo === fM);
  if (fR) lista = lista.filter(m => m.risco === fR);
  if (fA) lista = lista.filter(m => m.microArea === fA);
  const tb = document.getElementById('tb-mif'); const em = document.getElementById('mif-empty');
  if (!lista.length) { tb.innerHTML = ''; em.style.display = 'block'; document.getElementById('mif-count').textContent = ''; return }
  em.style.display = 'none'; document.getElementById('mif-count').textContent = `Exibindo ${lista.length} registro(s)`;
  tb.innerHTML = lista.map(m => {
    const id = data.utils.calcIdadeNum(m.nasc);
    const atraso = m.proximaDose ? data.utils.diasAtraso(m.proximaDose) : null;
    const sb = atraso ? `<span class="badge b-red">⚠️ ${atraso}d atraso</span>` : m.proximaDose ? `<span class="badge b-green">✅ Em Dia</span>` : `<span class="badge b-gray">${m.metodo || 'Sem método'}</span>`;
    const rb = { Baixo: 'b-green', Moderado: 'b-yellow', Alto: 'b-red' }[m.risco] || 'b-gray';
    return `<tr>
      <td><strong>${m.nomeSocial || m.nome}</strong><br><small style="color:var(--text2)">${m.cns || m.cpf || '—'}</small></td>
      <td>${id} anos</td><td>${m.microArea || '—'}</td><td>${sb}</td>
      <td>${m.proximaDose ? data.utils.fmtData(m.proximaDose) : '—'}</td>
      <td>${m.pccuData ? data.utils.fmtData(m.pccuData) : '<span style="color:var(--danger)">Pendente</span>'}</td>
      <td><span class="badge ${rb}">${m.risco || 'Baixo'}</span></td>
      <td><div class="actions">
        <button class="btn btn-sm btn-primary" onclick="abrirModalMIF('${m.id}')">✏️</button>
        <button class="btn btn-sm btn-mulher" onclick="abrirModalContracepPac('${m.id}')">💊</button>
        <button class="btn btn-sm btn-danger" onclick="excluirMIF('${m.id}')">🗑️</button>
      </div></td></tr>`;
  }).join('');
}
function excluirMIF(id) { const m = data.db.get('mif').find(x => x.id === id); if (!m || !confirm(`Excluir ${m.nome}?`)) return; data.db.set('mif', data.db.get('mif').filter(x => x.id !== id)); renderMIF(); atualizarBadges() }
function verMIF(id) { navTo('mif'); setTimeout(() => { const m = data.db.get('mif').find(x => x.id === id); if (m) { document.getElementById('s-mif').value = m.nome; renderMIF() } }, 100) }
function calcIdade() { const n = document.getElementById('mif-nasc').value; document.getElementById('mif-idade').value = n ? data.utils.calcIdadeNum(n) + ' anos' : '' }
function toggleDose() { const m = document.getElementById('mif-metodo').value; document.getElementById('div-proxima-dose').style.display = (m === 'Injetável Mensal' || m === 'Injetável Trimestral' || m === 'Oral') ? 'flex' : 'none' }

// ── CONTRACEPTIVOS ────────────────────────────────────────
function abrirModalContracep() { _openContracep(null) }
function abrirModalContracepPac(mifId) { _openContracep(mifId) }

function _openContracep(mifId) {
  try {
    const fc = document.getElementById('form-contracep');
    if(fc) fc.reset();
    const ci = document.getElementById('contracep-id');
    if(ci) ci.value = '';
    const cd = document.getElementById('contracep-data');
    if(cd) cd.value = hoje();

    preencherSel('contracep-mulher');
    if (mifId) { 
      const cm = document.getElementById('contracep-mulher');
      if(cm) cm.value = mifId; 
      preencherMetodoPaciente();
    }
    abrirModal('modal-contracep');
  } catch(e) {
    alert("ERRO abrirModalContracep: " + e.message);
  }
}
function calcAtrasados() {
  return data.db.get('mif')
    .filter(m => m.proximaDose && m.metodo && m.metodo !== 'Nenhum' && data.utils.diasAtraso(m.proximaDose) !== null)
    .map(m => ({ ...m, diasAtraso: data.utils.diasAtraso(m.proximaDose) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}
function preencherSel(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const pts = data.db.get('mif').filter(m => m && m.nome);
  sel.innerHTML = '<option value="">Selecionar paciente...</option>' +
    pts.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      .map(m => `<option value="${m.id}">${m.nome}${m.cns ? ' – ' + m.cns : ''}</option>`).join('');
}

function toggleFilaNovaPaciente() {
  const isNova = document.getElementById('fila-nova-paciente').checked;
  document.getElementById('fila-select-paciente').style.display = isNova ? 'none' : 'block';
  document.getElementById('fila-novo-nome-group').style.display = isNova ? 'block' : 'none';
  document.getElementById('fila-novo-telefone-group').style.display = isNova ? 'block' : 'none';
  document.getElementById('fila-novo-cns-group').style.display = isNova ? 'block' : 'none';
  document.getElementById('fila-mulher').required = !isNova;
  document.getElementById('fila-novo-nome').required = isNova;
}
function preencherMetodoPaciente() {
  const id = document.getElementById('contracep-mulher').value; if (!id) return;
  const m = data.db.get('mif').find(x => x.id === id);
  if (m && m.metodo) { document.getElementById('contracep-tipo').value = m.metodo; calcProxDoseAuto() }
}
function calcProxDoseAuto() {
  const tipo = document.getElementById('contracep-tipo').value;
  const data = document.getElementById('contracep-data').value; if (!data) return;
  const d = new Date(data);
  if (tipo === 'Injetável Mensal') d.setDate(d.getDate() + 30);
  else if (tipo === 'Injetável Trimestral') d.setDate(d.getDate() + 90);
  else if (tipo === 'Oral') d.setDate(d.getDate() + 28);
  else { document.getElementById('contracep-prox').value = ''; return }
  document.getElementById('contracep-prox').value = d.toISOString().slice(0, 10);
}

function atualizarEscorePreview() {
  let escore = 0;
  if (document.getElementById('fila-criterio-puerpera')?.checked) escore += 30;
  if (document.getElementById('fila-criterio-puerpera-risco')?.checked) escore += 40;
  if (document.getElementById('fila-criterio-lactante')?.checked) escore += 25;
  if (document.getElementById('fila-criterio-adolescente')?.checked) escore += 30;
  if (document.getElementById('fila-criterio-violencia')?.checked) escore += 40;
  if (document.getElementById('fila-criterio-falha-metodo')?.checked) escore += 25;
  if (document.getElementById('fila-criterio-pos-parto')?.checked) escore += 20;
  if (document.getElementById('fila-criterio-comorbidade')?.checked) escore += 25;
  if (document.getElementById('fila-criterio-uso-atual')?.checked) escore += 15;
  const preview = document.getElementById('fila-escore-preview');
  if (preview) preview.textContent = escore;
}
function salvarContracep(e) {
  e.preventDefault();
  const mifId = document.getElementById('contracep-mulher').value;
  const tipo = document.getElementById('contracep-tipo').value;
  const dataAplic = document.getElementById('contracep-data').value;
  const prox = document.getElementById('contracep-prox').value;
  data.db.set('contracep', [...data.db.get('contracep'), {
    id: data.utils.uuid(), mulherId: mifId, tipo, data: dataAplic, proxDose: prox,
    dose: document.getElementById('contracep-dose').value, lote: document.getElementById('contracep-lote').value,
    obs: document.getElementById('contracep-obs').value, criadoEm: new Date().toISOString()
  }]);
  data.db.set('mif', data.db.get('mif').map(m => m.id !== mifId ? m : { ...m, metodo: tipo, inicioMetodo: dataAplic, proximaDose: prox }));
  fecharModal('modal-contracep'); renderContracep(); atualizarBadges();
}
function renderContracep() {
  const busca = document.getElementById('s-contracep').value.toLowerCase();
  const fT = document.getElementById('f-contracep-tipo').value;
  const fS = document.getElementById('f-contracep-status').value;
  let lista = data.db.get('mif').filter(m => m.metodo && m.metodo !== 'Nenhum' && m.metodo !== '')
    .map(m => ({ ...m, atraso: data.utils.diasAtraso(m.proximaDose) }))
    .map(m => ({ ...m, status: m.atraso ? 'Atrasado' : 'Em Dia' }));
  if (busca) lista = lista.filter(m => m.nome.toLowerCase().includes(busca));
  if (fT) lista = lista.filter(m => m.metodo === fT);
  if (fS) lista = lista.filter(m => m.status === fS);
  const at = lista.filter(m => m.status === 'Atrasado');
  const alEl = document.getElementById('alert-contracep-atraso');
  if (at.length) { alEl.style.display = 'flex'; document.getElementById('n-atrasados').textContent = at.length }
  else alEl.style.display = 'none';
  const tb = document.getElementById('tb-contracep'); const em = document.getElementById('contracep-empty');
  if (!lista.length) { tb.innerHTML = ''; em.style.display = 'block'; return } em.style.display = 'none';
  tb.innerHTML = lista.map(m => `<tr>
    <td><strong>${m.nome}</strong><br><small style="color:var(--text2)">${m.tel || '—'}</small></td>
    <td>${m.metodo}</td>
    <td>${m.inicioMetodo ? data.utils.fmtData(m.inicioMetodo) : '—'}</td>
    <td>${m.proximaDose ? data.utils.fmtData(m.proximaDose) : '—'}</td>
    <td><span class="badge ${m.status === 'Atrasado' ? 'b-red' : 'b-green'}">${m.status}</span></td>
    <td>${m.atraso ? `<span style="color:var(--danger);font-weight:700">+${m.atraso}d</span>` : '—'}</td>
    <td><div class="actions">
      <button class="btn btn-sm btn-mulher" onclick="abrirModalContracepPac('${m.id}')">+ Dose</button>
      <button class="btn btn-sm btn-primary" onclick="abrirModalMIF('${m.id}')">✏️</button>
    </div></td></tr>`).join('');
}

// ── FILA DE ESPERA CONTRACEPTIVOS ─────────────────────────
function switchContracepTab(tab) {
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view-content').forEach(c => c.classList.remove('active'));
  
  const btnNovo = document.getElementById('btn-novo-contracep');
  const btnFila = document.getElementById('btn-nova-fila');

  if (tab === 'uso') {
    document.querySelector('.view-tab:nth-child(1)').classList.add('active');
    document.getElementById('view-contracep-uso').classList.add('active');
    if(btnNovo) btnNovo.style.display = 'inline-flex';
    if(btnFila) btnFila.style.display = 'none';
    renderContracep();
  } else {
    document.querySelector('.view-tab:nth-child(2)').classList.add('active');
    document.getElementById('view-contracep-fila').classList.add('active');
    if(btnNovo) btnNovo.style.display = 'none';
    if(btnFila) btnFila.style.display = 'inline-flex';
    renderFilaEspera();
  }
}

function abrirModalFilaEspera(id) {
  try {
    const fe = document.getElementById('form-fila-espera');
    if(fe) fe.reset();
    const fi = document.getElementById('fila-id');
    if(fi) fi.value = '';
    const fd = document.getElementById('fila-data');
    if(fd) fd.value = data.utils.hoje();
    
    ['fila-criterio-puerpera', 'fila-criterio-puerpera-risco', 'fila-criterio-lactante', 
     'fila-criterio-adolescente', 'fila-criterio-violencia', 'fila-criterio-falha-metodo',
     'fila-criterio-pos-parto', 'fila-criterio-comorbidade', 'fila-criterio-uso-atual', 'fila-data-parto'].forEach(eid => {
       const el = document.getElementById(eid);
       if(el) { el.checked = false; if(el.type === 'text' || el.type === 'date') el.value = ''; }
     });
    const ep = document.getElementById('fila-escore-preview');
    if(ep) ep.textContent = '0';
    
    if (id) {
      const p = data.db.get('fila_contracep')?.find(x => x.id === id);
      if (p) {
        if (fi) fi.value = p.id;
        const mf = document.getElementById('fila-mulher');
        if (mf) mf.value = p.mulherId || '';
        if (fd) fd.value = p.dataInsercao || '';
        const mt = document.getElementById('fila-metodo');
        if (mt) mt.value = p.metodo || '';
        const ob = document.getElementById('fila-obs');
        if (ob) ob.value = p.obs || '';
        const dParto = document.getElementById('fila-data-parto');
        if (dParto) dParto.value = p.dataParto || '';
        
        const c = p.criterios || {};
        if (c.puerpera) document.getElementById('fila-criterio-puerpera').checked = true;
        if (c.puerperaRisco) document.getElementById('fila-criterio-puerpera-risco').checked = true;
        if (c.lactante) document.getElementById('fila-criterio-lactante').checked = true;
        if (c.adolescente) document.getElementById('fila-criterio-adolescente').checked = true;
        if (c.violencia) document.getElementById('fila-criterio-violencia').checked = true;
        if (c.falhaMetodo) document.getElementById('fila-criterio-falha-metodo').checked = true;
        if (c.posParto) document.getElementById('fila-criterio-pos-parto').checked = true;
        if (c.comorbidade) document.getElementById('fila-criterio-comorbidade').checked = true;
        if (c.usoAtual) document.getElementById('fila-criterio-uso-atual').checked = true;
        atualizarEscorePreview();
      }
    }
    
    preencherSel('fila-mulher');
    if (id) {
      const mf = document.getElementById('fila-mulher');
      const p = data.db.get('fila_contracep')?.find(x => x.id === id);
      if (mf && p?.mulherId) mf.value = p.mulherId;
    }
    abrirModal('modal-fila-espera');
  } catch(e) {
    console.error("Erro abrirModalFilaEspera:", e);
    alert("ERRO na Fila de Espera: " + e.message);
  }
}

function salvarFilaEspera(e) {
  e.preventDefault();
  const idEl = document.getElementById('fila-id');
  const mulherEl = document.getElementById('fila-mulher');
  const isNovaPaciente = document.getElementById('fila-nova-paciente').checked;
  
  let selectedMifId = mulherEl.value;
  
  if (isNovaPaciente) {
    const novoNome = document.getElementById('fila-novo-nome').value.trim();
    if (!novoNome) {
      alert("Digite o nome da paciente!");
      return;
    }
    const novoTelefone = document.getElementById('fila-novo-telefone').value.trim();
    const novoCns = document.getElementById('fila-novo-cns').value.trim();
    
    const novaPaciente = {
      id: data.utils.uuid(),
      nome: novoNome,
      telCelular: novoTelefone,
      cns: novoCns || '',
      situacao: 'Ativa',
      dataCadastro: data.utils.hoje()
    };
    
    let mifLista = data.db.get('mif') || [];
    mifLista.push(novaPaciente);
    data.db.set('mif', mifLista);
    selectedMifId = novaPaciente.id;
    
    alert(`✅ Nova paciente "${novoNome}" cadastrada automaticamente!`);
  } else if (!selectedMifId) {
    alert("Selecione a paciente!");
    return;
  }
  
  const id = idEl ? idEl.value : '';
  const g = eid => { const el = document.getElementById(eid); return el ? el.value : ''; };
  const gc = eid => { const el = document.getElementById(eid); return el ? el.checked : false; };
  
  const escore = 
    (gc('fila-criterio-puerpera') ? 30 : 0) +
    (gc('fila-criterio-puerpera-risco') ? 40 : 0) +
    (gc('fila-criterio-lactante') ? 25 : 0) +
    (gc('fila-criterio-adolescente') ? 30 : 0) +
    (gc('fila-criterio-violencia') ? 40 : 0) +
    (gc('fila-criterio-falha-metodo') ? 25 : 0) +
    (gc('fila-criterio-pos-parto') ? 20 : 0) +
    (gc('fila-criterio-comorbidade') ? 25 : 0) +
    (gc('fila-criterio-uso-atual') ? 15 : 0);
  
  const criterios = {
    puerpera: gc('fila-criterio-puerpera'),
    puerperaRisco: gc('fila-criterio-puerpera-risco'),
    lactante: gc('fila-criterio-lactante'),
    adolescente: gc('fila-criterio-adolescente'),
    violencia: gc('fila-criterio-violencia'),
    falhaMetodo: gc('fila-criterio-falha-metodo'),
    posParto: gc('fila-criterio-pos-parto'),
    comorbidade: gc('fila-criterio-comorbidade'),
    usoAtual: gc('fila-criterio-uso-atual')
  };
  
  const obj = {
    id: id || data.utils.uuid(),
    mulherId: selectedMifId,
    metodo: g('fila-metodo'),
    dataInsercao: g('fila-data'),
    dataParto: g('fila-data-parto'),
    escore: escore,
    criterios: criterios,
    obs: g('fila-obs'),
    criadoEm: new Date().toISOString()
  };
  
  let lista = data.db.get('fila_contracep') || [];
  lista = id ? lista.map(x => x.id === id ? obj : x) : [...lista, obj];
  data.db.set('fila_contracep', lista);
  
  fecharModal('modal-fila-espera');
  renderFilaEspera();
}

function renderFilaEspera() {
  const busca = (document.getElementById('s-fila-espera')?.value || '').toLowerCase();
  const fM = document.getElementById('f-fila-metodo')?.value || '';
  
  const mifs = db.get('mif') || [];
  const mm = {}; 
  mifs.forEach(m => { if(m.id) mm[m.id] = m; });
  
  const records = db.get('fila_contracep') || [];
  
  let lista = records.map(p => ({ 
    ...p, 
    mif: mm[p.mulherId] || { nome: 'Paciente não encontrada', telCelular: '' },
    escore: p.escore || 0
  }));
  
  // Sort by escore (higher first), then by date
  lista.sort((a, b) => {
    if (b.escore !== a.escore) return b.escore - a.escore;
    const da = a.dataInsercao ? new Date(a.dataInsercao).getTime() : 0;
    const dbTime = b.dataInsercao ? new Date(b.dataInsercao).getTime() : 0;
    return (isNaN(da) ? 0 : da) - (isNaN(dbTime) ? 0 : dbTime);
  });
  
  if (busca) lista = lista.filter(p => p.mif.nome && p.mif.nome.toLowerCase().includes(busca));
  if (fM) lista = lista.filter(p => p.metodo === fM);
  
  const tb = document.getElementById('tb-fila-espera'); 
  const em = document.getElementById('fila-espera-empty');
  
  if (!tb || !em) return;

  if (lista.length === 0) { 
    tb.innerHTML = ''; 
    em.style.display = 'block'; 
    return; 
  } 
  em.style.display = 'none';
  
  const getPrioridadeBadge = (escore) => {
    if (escore >= 30) return '<span class="badge b-red" style="font-size:0.7rem">URGENTE</span>';
    if (escore >= 15) return '<span class="badge b-yellow" style="font-size:0.7rem">ALTA</span>';
    if (escore >= 5) return '<span class="badge b-blue" style="font-size:0.7rem">MÉDIA</span>';
    return '<span class="badge b-gray" style="font-size:0.7rem">BAIXA</span>';
  };
  
  const getCriteriosBadges = (p) => {
    const c = p.criterios || {};
    let badges = '';
    if (c.puerpera) badges += '<span class="badge b-purple" style="margin:2px">👶 Puérpera ≤45d</span>';
    if (c.puerperaRisco) badges += '<span class="badge b-red" style="margin:2px">⚠️ Puérpera ≥35a/Comorb</span>';
    if (c.lactante) badges += '<span class="badge b-pink" style="margin:2px">🍼 Lactante</span>';
    if (c.adolescente) badges += '<span class="badge b-yellow" style="margin:2px">👩‍🦰 Adolesc.</span>';
    if (c.violencia) badges += '<span class="badge b-red" style="margin:2px">🚨 Violência</span>';
    if (c.falhaMetodo) badges += '<span class="badge b-orange" style="margin:2px">❌ Falha método</span>';
    if (c.posParto) badges += '<span class="badge b-blue" style="margin:2px">🤰 Pós-parto >1a</span>';
    if (c.comorbidade) badges += '<span class="badge b-red" style="margin:2px">💊 Comorbidade</span>';
    if (c.usoAtual) badges += '<span class="badge b-green" style="margin:2px">🔄 Troca</span>';
    return badges || '<span style="color:var(--text2)">—</span>';
  };
  
  tb.innerHTML = lista.map((p, idx) => {
    try {
        const prioridade = p.escore >= 30 ? 'Urgente' : p.escore >= 15 ? 'Alta' : p.escore >= 5 ? 'Média' : 'Baixa';
        return `<tr>
        <td>${getPrioridadeBadge(p.escore)}<br><small style="color:var(--text2)">${p.escore} pts</small></td>
        <td>${fmtData(p.dataInsercao)} <br><small style="color:var(--text2)">${diffDias(hoje(), p.dataInsercao) || 0} dias de espera</small></td>
        <td><strong>${p.mif.nome}</strong><br><small style="color:var(--text2)">${p.mif.telCelular || p.mif.telResidencial || p.mif.tel || '—'}</small></td>
        <td><span class="badge b-purple">${p.metodo}</span></td>
        <td>${getCriteriosBadges(p)}</td>
        <td><small>${p.obs || '—'}</small></td>
        <td><div class="actions">
        <button class="btn btn-sm btn-primary" title="Editar critérios e pontuação" onclick="abrirModalFilaEspera('${p.id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-success" title="Registrar que conseguiu o método" onclick="concluirFilaEspera('${p.id}')">✔️ Iniciar</button>
        <button class="btn btn-sm btn-danger" title="Remover da fila" onclick="removerFilaEspera('${p.id}')">🗑️ Cancelar</button>
        </div></td></tr>`;
    } catch(e) { return ''; }
  }).join('');
}

function concluirFilaEspera(id) {
  const p = db.get('fila_contracep').find(x => x.id === id);
  if (!p) return;
  
  if (!confirm(`Deseja registrar que ${p.mif?.nome || 'a paciente'} conseguiu o método ${p.metodo}?`)) return;
  
  // Exclui da fila
  db.set('fila_contracep', db.get('fila_contracep').filter(x => x.id !== id));
  
  // Muda pra aba principal
  switchContracepTab('uso');
  
  // Abre o modal pre-preenchido
  _openContracep(p.mulherId);
  setTimeout(() => {
    document.getElementById('contracep-tipo').value = p.metodo;
    calcProxDoseAuto();
  }, 150);
}

function removerFilaEspera(id) {
  const p = db.get('fila_contracep').find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Remover ${p.mif?.nome || 'a paciente'} da fila de espera de ${p.metodo}? Isso NÃO registrará o uso do método.`)) return;
  db.set('fila_contracep', db.get('fila_contracep').filter(x => x.id !== id));
  renderFilaEspera();
}



// ── PCCU ──────────────────────────────────────────────────
function abrirFormularioSaudeMulher() {
  const sBusca = (document.getElementById('s-pccu') || {}).value;
  if (sBusca) {
    const list = db.get('mif').filter(p => p.nome && p.nome.toLowerCase().includes(sBusca.trim().toLowerCase()));
    if (list.length > 0) {
      sessionStorage.setItem('cc_pessoa_selecionada', JSON.stringify(list[0]));
    }
  }
  window.open('SAÚDE DA MULHER.html', '_blank');
}
function abrirModalPCCU(id) {
  document.getElementById('form-pccu').reset();
  document.getElementById('pccu-id').value = '';
  document.getElementById('pccu-coleta').value = hoje();
  preencherSel('pccu-mulher');
  if (id) {
    const p = db.get('pccu').find(x => x.id === id);
    if (p) {
      const s = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || '' };
      s('pccu-id', p.id); s('pccu-mulher', p.mulherId); s('pccu-coleta', p.coleta);
      s('pccu-envio', p.envio); s('pccu-recebido', p.recebido); s('pccu-resultado', p.resultado);
      s('pccu-status', p.status || 'Coletado'); s('pccu-prox', p.prox); s('pccu-conduta', p.conduta)
    }
  } else {
    const sBusca = (document.getElementById('s-pccu') || {}).value;
    if (sBusca) {
      const sel = document.getElementById('pccu-mulher');
      if (sel && sel.options) {
        const opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes(sBusca.trim().toLowerCase()));
        if (opt) sel.value = opt.value;
      }
    }
  }
  abrirModal('modal-pccu');
}
function salvarPCCU(e) {
  e.preventDefault();
  const id = document.getElementById('pccu-id').value;
  const mifId = document.getElementById('pccu-mulher').value;
  const coleta = document.getElementById('pccu-coleta').value;
  const dp = new Date(coleta); dp.setFullYear(dp.getFullYear() + 1);
  const prox = document.getElementById('pccu-prox').value || dp.toISOString().slice(0, 10);
  const g = eid => document.getElementById(eid).value;
  const obj = {
    id: id || uuid(), mulherId: mifId, coleta, envio: g('pccu-envio'), recebido: g('pccu-recebido'),
    resultado: g('pccu-resultado'), status: g('pccu-status'), prox, conduta: g('pccu-conduta'), criadoEm: new Date().toISOString()
  };
  let lista = db.get('pccu'); lista = id ? lista.map(x => x.id === id ? obj : x) : [...lista, obj]; db.set('pccu', lista);
  
  // Atualiza as datas no cadastro da mulher (MIF)
  db.set('mif', db.get('mif').map(m => m.id === mifId ? { ...m, pccuData: coleta, pccuResultado: obj.resultado, pccuStatus: obj.status, pccuProx: prox } : m));

  // --- Integração com SAÚDE DA MULHER (Formulário Físico / Laboratório) ---
  try {
    const p = db.get('mif').find(x => x.id === mifId);
    if (p) {
        let exames = JSON.parse(localStorage.getItem('examesCitopatologicos') || '[]');
        
        // Verifica se já existe pra não duplicar impressão
        let dtSplit = coleta.split('-');
        let dataB = dtSplit.length === 3 ? `${dtSplit[2]}/${dtSplit[1]}/${dtSplit[0]}` : coleta;
        
        const cnsFormatado = (p.cns || '').replace(/\D/g, '');
        let regExistente = exames.find(e => e.nome === p.nome.toUpperCase() && e.dataColeta === dataB);
        
        if (!regExistente) {
             const calculoIdade = window.calcIdadeNum || data.utils.calcIdadeNum;
             const registro = {
                  dataColeta: dataB,
                  nome: p.nome.toUpperCase(),
                  idade: calculoIdade ? calculoIdade(p.nasc).toString() : '0',
                  cns: p.cns || 'NÃO INFORMADO',
                  resultado: obj.resultado || 'Aguardando...',
                  situacao: obj.status || 'Coletado',
                  dataCadastro: new Date().toISOString()
             };
             exames.push(registro);
             localStorage.setItem('examesCitopatologicos', JSON.stringify(exames));
             
             // Cria também o SOAP History (prontuário de Citopatológico)
             const historicoSOAP = JSON.parse(localStorage.getItem('carisma_soap_history') || '[]');
             historicoSOAP.push({
                 id: data.utils.uuid(),
                 pacienteId: p.id,
                 data: new Date().toISOString(),
                 s: "Coleta de exame citopatológico (preventivo) agendada.",
                 o: `Coleta realizada. Paciente: ${registro.nome}, ${registro.idade} anos. CNS: ${registro.cns}.`,
                 a: `Exame citopatológico coletado. Enviado para análise laboratorial.`,
                 p: `Aguardando resultado do exame citopatológico. Retorno agendado conforme necessidade. Data da coleta: ${registro.dataColeta}.`
             });
             localStorage.setItem('carisma_soap_history', JSON.stringify(historicoSOAP));
        }
        
        // Pre-seleciona ela para quando você for gerar a guia de requisição no botão!
        sessionStorage.setItem('cc_pessoa_selecionada', JSON.stringify(p));
    }
  } catch(err) { console.error("Erro na integração com Saúde da Mulher:", err); }
  // ------------------------------------------------------------------------

  fecharModal('modal-pccu'); renderPCCU();
}
function renderPCCU() {
  const busca = document.getElementById('s-pccu').value.toLowerCase();
  const fS = document.getElementById('f-pccu-status').value;
  const mm = {}; db.get('mif').forEach(m => mm[m.id] = m);
  let lista = db.get('pccu').map(p => ({ ...p, mif: mm[p.mulherId] })).filter(p => p.mif);
  if (busca) lista = lista.filter(p => p.mif.nome.toLowerCase().includes(busca));
  if (fS) lista = lista.filter(p => p.status === fS);
  const tb = document.getElementById('tb-pccu'); const em = document.getElementById('pccu-empty');
  if (!lista.length) { tb.innerHTML = ''; em.style.display = 'block'; return } em.style.display = 'none';
  const rb = r => ({ 'Negativo': 'b-green', 'ASC-US': 'b-yellow', 'ASC-H': 'b-yellow', 'LSIL': 'b-yellow', 'HSIL': 'b-red', 'Câncer': 'b-red', 'Insatisfatório': 'b-gray' }[r] || 'b-gray');
  tb.innerHTML = lista.map(p => `<tr>
    <td><strong>${p.mif.nome}</strong></td>
    <td>${fmtData(p.coleta)}</td>
    <td>${p.resultado ? `<span class="badge ${rb(p.resultado)}">${p.resultado}</span>` : '<span style="color:var(--text2)">Aguardando</span>'}</td>
    <td><span class="badge b-blue">${p.status}</span></td>
    <td>${p.prox ? fmtData(p.prox) : '—'}</td>
    <td><div class="actions">
      <button class="btn btn-sm btn-primary" onclick="abrirModalPCCU('${p.id}')">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="excItem('pccu','${p.id}',renderPCCU)">🗑️</button>
    </div></td></tr>`).join('');
}

// ── ISTs ──────────────────────────────────────────────────
function abrirModalIST(id) {
  document.getElementById('form-ist').reset();
  document.getElementById('ist-id').value = '';
  document.getElementById('ist-data').value = hoje();
  preencherSel('ist-mulher');
  if (id) {
    const p = db.get('ist').find(x => x.id === id);
    if (p) {
      const s = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || '' };
      s('ist-id', p.id); s('ist-mulher', p.mulherId); s('ist-diag', p.diagnostico); s('ist-data', p.data);
      s('ist-trat', p.tratamento); s('ist-inicio-trat', p.inicioTrat); s('ist-fim-trat', p.fimTrat);
      s('ist-parceiro', p.parceiro); s('ist-status', p.status || 'Em Tratamento'); s('ist-obs', p.obs)
    }
  }
  abrirModal('modal-ist');
}
function salvarIST(e) {
  e.preventDefault(); const id = document.getElementById('ist-id').value;
  const g = eid => document.getElementById(eid).value;
  const obj = {
    id: id || uuid(), mulherId: g('ist-mulher'), diagnostico: g('ist-diag'), data: g('ist-data'),
    tratamento: g('ist-trat'), inicioTrat: g('ist-inicio-trat'), fimTrat: g('ist-fim-trat'),
    parceiro: g('ist-parceiro'), status: g('ist-status'), obs: g('ist-obs'), criadoEm: new Date().toISOString()
  };
  let lista = db.get('ist'); lista = id ? lista.map(x => x.id === id ? obj : x) : [...lista, obj]; db.set('ist', lista);
  fecharModal('modal-ist'); renderIST(); atualizarBadges();
}
function renderIST() {
  const busca = document.getElementById('s-ist').value.toLowerCase();
  const fD = document.getElementById('f-ist-diag').value;
  const fS = document.getElementById('f-ist-status').value;
  const mm = {}; db.get('mif').forEach(m => mm[m.id] = m);
  let lista = db.get('ist').map(p => ({ ...p, mif: mm[p.mulherId] })).filter(p => p.mif);
  if (busca) lista = lista.filter(p => p.mif.nome.toLowerCase().includes(busca));
  if (fD) lista = lista.filter(p => p.diagnostico === fD); if (fS) lista = lista.filter(p => p.status === fS);
  const tb = document.getElementById('tb-ist'); const em = document.getElementById('ist-empty');
  if (!lista.length) { tb.innerHTML = ''; em.style.display = 'block'; return } em.style.display = 'none';
  const sc = { 'Em Tratamento': 'b-yellow', 'Curada': 'b-green', 'Acompanhamento': 'b-blue', 'Perda de Seguimento': 'b-gray' };
  tb.innerHTML = lista.map(p => `<tr>
    <td><strong>${p.mif.nome}</strong></td><td>${p.diagnostico}</td><td>${fmtData(p.data)}</td>
    <td>${p.tratamento || '—'}</td>
    <td><span class="badge ${sc[p.status] || 'b-gray'}">${p.status}</span></td>
    <td><div class="actions">
      <button class="btn btn-sm btn-primary" onclick="abrirModalIST('${p.id}')">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="excItem('ist','${p.id}',renderIST)">🗑️</button>
    </div></td></tr>`).join('');
}

// ── ALERTAS ───────────────────────────────────────────────
function renderAlertas() {
  const atrasados = calcAtrasados();
  const mifs = db.get('mif');
  const adolSem = mifs.filter(m => calcIdadeNum(m.nasc) <= 19 && (!m.metodo || m.metodo === 'Nenhum'));
  const pccuPend = mifs.filter(m => !m.pccuData || diffDias(hoje(), m.pccuData) > 365);
  let html = '';
  if (atrasados.length) {
    html += `<div class="alert-box danger"><span class="alert-icon">🚨</span><div><strong>Contraceptivos Atrasados (${atrasados.length})</strong> – Dose injetável vencida</div></div>`;
    html += atrasados.map(m => `<div class="alert-card">
      <span style="font-size:1.6rem">💊</span>
      <div class="ac-info"><div class="ac-name">${m.nome}</div>
        <div class="ac-detail">${m.metodo} · Vencida há <strong>${m.diasAtraso} dia(s)</strong> · ${m.tel || 'Sem tel.'} · ${m.microArea || '—'}</div></div>
      <button class="btn btn-sm btn-mulher" onclick="abrirModalContracepPac('${m.id}')">💊 Aplicar</button>
    </div>`).join('');
  }
  if (adolSem.length) {
    html += `<div class="alert-box warning" style="margin-top:16px"><span class="alert-icon">⚠️</span><div><strong>Adolescentes Sem Contraceptivo (${adolSem.length})</strong> – Alto risco de gravidez</div></div>`;
    html += adolSem.map(m => `<div class="alert-card" style="border-left-color:var(--warning)">
      <span style="font-size:1.6rem">👧</span>
      <div class="ac-info"><div class="ac-name">${m.nome}</div>
        <div class="ac-detail">${calcIdadeNum(m.nasc)} anos · ${m.tel || 'Sem tel.'} · ${m.microArea || '—'}</div></div>
      <button class="btn btn-sm btn-primary" onclick="abrirModalMIF('${m.id}')">✏️ Ver</button>
    </div>`).join('');
  }
  if (pccuPend.length) {
    html += `<div class="alert-box warning" style="margin-top:16px"><span class="alert-icon">📋</span><div><strong>PCCU Pendente/Vencido (${pccuPend.length})</strong> – Exame anual em atraso</div></div>`;
    html += pccuPend.map(m => `<div class="alert-card" style="border-left-color:var(--warning)">
      <span style="font-size:1.6rem">📋</span>
      <div class="ac-info"><div class="ac-name">${m.nome}</div>
        <div class="ac-detail">Últ. PCCU: ${m.pccuData ? fmtData(m.pccuData) : 'Nunca'} · ${m.tel || 'Sem tel.'}</div></div>
      <button class="btn btn-sm btn-mulher" onclick="abrirModalPCCU()">+ Coletar</button>
    </div>`).join('');
  }
  if (!html) html = '<div class="empty-state"><div class="es-icon">✅</div><h3>Nenhum alerta ativo</h3><p>Todas as pacientes estão em dia!</p></div>';
  document.getElementById('alertas-list').innerHTML = html;
}
function atualizarBadges() {
  const n = calcAtrasados().length;
  ['badge-atrasados', 'badge-alertas'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = n; el.style.display = n > 0 ? 'inline' : 'none' } });
}

// ── CSV IMPORT ────────────────────────────────────────────
// Palavras-chave que identificam a LINHA DE CABEÇALHO real do e-SUS
const CSV_HEADER_KEYS = ['nome', 'cns', 'nascimento', 'nasc', 'cpf', 'sexo', 'microarea', 'micro'];

// Converte data DD/MM/AAAA → AAAA-MM-DD ou retorna string original se já estiver no formato ISO
function parseDateBR(raw) {
  if (!raw) return '';
  const r = raw.trim().replace(/"/g, '');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(r)) { const [d, m, a] = r.split('/'); return `${a}-${m}-${d}` }
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  return '';
}

// Detecta o separador dominante da linha (';' ou ',')
function detectSep(line) { return (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ';' : ',' }

// Divide uma linha CSV respeitando campos entre aspas
function splitCSV(line, sep) {
  const res = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ }
    else if (c === sep && !inQ) { res.push(cur.trim().replace(/^"+|"+$/g, '')); cur = '' }
    else cur += c;
  }
  res.push(cur.trim().replace(/^"+|"+$/g, ''));
  return res;
}

function processarCSV(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const allLines = text.split(/\r?\n/).filter(l => l.trim());
    if (allLines.length < 2) { alert('CSV inválido ou vazio'); return }

    // ── 1. Detectar separador ───────────────────────────────
    const sep = detectSep(allLines[0]);

    // ── 2. Encontrar linha de cabeçalho real ───────────────
    // O e-SUS tem ~6-10 linhas de metadados antes do cabeçalho de colunas.
    // Procuramos a primeira linha que contenha pelo menos 2 das palavras-chave.
    let headerIdx = -1;
    for (let i = 0; i < Math.min(50, allLines.length); i++) {
      const norm = allLines[i].toLowerCase();
      const hits = CSV_HEADER_KEYS.filter(k => norm.includes(k)).length;
      if (hits >= 2) { headerIdx = i; break }
    }

    if (headerIdx === -1) {
      document.getElementById('import-preview').innerHTML =
        `<div style="color:var(--danger);padding:16px">
          ⚠️ Não foi possível identificar o cabeçalho do CSV.<br>
          Verifique se o arquivo é um Relatório de Cadastro do e-SUS PEC.<br>
          <small>Primeiras linhas encontradas:</small><br>
          <code>${allLines.slice(0, 5).join('<br>')}</code>
        </div>`;
      return;
    }

    const rawHeader = splitCSV(allLines[headerIdx], sep).map(h => h.toLowerCase().trim());
    const dataLines = allLines.slice(headerIdx + 1);

    // ── 3. Mapear colunas ───────────────────────────────────
    // Aliases em ordem de prioridade para cada campo
    const ci = (...keys) => { for (const k of keys) { const i = rawHeader.findIndex(h => h.includes(k)); if (i >= 0) return i } return -1 };
    const nomeI = ci('nome');
    const nascI = ci('nascimento', 'nasc', 'data nasc', 'dt.nasc', 'dn');
    const cnsI = ci('cns', 'cartão sus', 'cartao sus');
    const cpfI = ci('cpf');
    const sexoI = ci('sexo');
    const telI = ci('telefone', 'celular', 'fone', 'tel');
    const endI = ci('endereço', 'endereco', 'logradouro', 'rua');
    const numI = ci('número', 'numero', 'num');
    const microI = ci('microárea', 'microarea', 'micro área', 'equipe', 'acs');
    const cidI = ci('cidade', 'municipio', 'município');

    if (nomeI === -1) {
      document.getElementById('import-preview').innerHTML =
        `<div style="color:var(--danger);padding:16px">⚠️ Coluna "Nome" não encontrada.<br>
        Colunas detectadas: <code>${rawHeader.join(' | ')}</code></div>`;
      return;
    }

    // ── 4. Processar linhas de dados ────────────────────────
    let importadas = 0, duplicadas = 0, foraDeFaixa = 0, errors = [];
    const existentes = db.get('mif');
    const existCNS = new Set(existentes.map(m => m.cns).filter(Boolean));
    const existCPF = new Set(existentes.map(m => m.cpf).filter(Boolean));
    const existNome = new Set(existentes.map(m => m.nome.toLowerCase()));
    const novos = [];

    const batchTag = document.getElementById('mif-batch-tag')?.value;

    // Preview HTML
    let prevRows = '';
    const previewCols = [nomeI, nascI, cnsI, sexoI, microI].filter(i => i >= 0);

    dataLines.forEach((row, ri) => {
      if (!row.trim()) return;
      const cols = splitCSV(row, sep);
      const get = i => i >= 0 && i < cols.length ? cols[i].trim() : '';

      const nome = get(nomeI);
      if (!nome || nome.length < 3) return; // pula linhas sem nome válido

      // Filtro de sexo — aceita: F, FEM, FEMININO, ou sem info
      const sexoRaw = get(sexoI).toUpperCase();
      if (sexoRaw && sexoRaw !== '' && !sexoRaw.startsWith('F')) return;

      // Data de nascimento
      const nasc = parseDateBR(get(nascI));
      const idade = calcIdadeNum(nasc);
      if (nasc && (idade < 10 || idade > 49)) { foraDeFaixa++; return }

      // CNS/CPF/Nome — deduplicação
      const cns = get(cnsI).replace(/\D/g, '');
      const cpf = get(cpfI).replace(/\D/g, '');

      if (cns && existCNS.has(cns)) { duplicadas++; return }
      if (cpf && existCPF.has(cpf)) { duplicadas++; return }
      if (!cns && !cpf && existNome.has(nome.toLowerCase())) { duplicadas++; return }

      // Montar endereço
      const end = [get(endI), get(numI)].filter(Boolean).join(', ');
      const micro = get(microI);
      const tel = get(telI).replace(/\D/g, ''); // só dígitos

      // Preview (5 primeiras linhas)
      if (ri < 5) prevRows += `<tr><td>${nome}</td><td>${nasc ? fmtData(nasc) : '?'}</td><td>${cns || '—'}</td><td>${micro || '—'}</td></tr>`;

      if (cns) existCNS.add(cns);
      if (cpf) existCPF.add(cpf);
      existNome.add(nome.toLowerCase());

      novos.push({
        id: uuid(), nome, nasc, cns,
        cpf: get(cpfI).replace(/\D/g, ''),
        tel, endereco: end, microArea: micro,
        metodo: '', situacao: 'Ativa',
        risco: idade <= 19 ? 'Alto' : 'Baixo',
        prioridade: idade <= 19 ? 'Prioritária' : 'Rotina',
        tags: batchTag ? [batchTag] : [],
        dataCadastro: new Date().toISOString()
      });
      importadas++;
    });

    // ── 5. Exibir resultado ─────────────────────────────────
    const prevHTML = `
      <div style="margin-bottom:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;font-size:.85rem">
        <strong>Arquivo:</strong> ${file.name} &nbsp;|&nbsp;
        <strong>Cabeçalho na linha ${headerIdx + 1}</strong> &nbsp;|&nbsp;
        Colunas mapeadas: Nome✓${nascI >= 0 ? ' DataNasc✓' : ''}${cnsI >= 0 ? ' CNS✓' : ''}${sexoI >= 0 ? ' Sexo✓' : ''}${microI >= 0 ? ' Microárea✓' : ''}${telI >= 0 ? ' Tel✓' : ''}
      </div>
      <table>
        <thead><tr><th>Nome</th><th>Nasc.</th><th>CNS</th><th>Microárea</th></tr></thead>
        <tbody>${prevRows || '<tr><td colspan="4">Nenhuma linha processada</td></tr>'}</tbody>
      </table>
      ${importadas > 0 ? `<p style="margin-top:8px;color:var(--success)">✅ <strong>${importadas}</strong> registros prontos para importar.</p>` : ''}
      ${duplicadas > 0 ? `<p style="color:var(--warning)">⚠️ ${duplicadas} duplicatas ignoradas (CNS ou nome já cadastrado).</p>` : ''}
      ${foraDeFaixa > 0 ? `<p style="color:var(--text2)">ℹ️ ${foraDeFaixa} registros fora da faixa 10-49 anos ignorados.</p>` : ''}
    `;
    document.getElementById('import-preview').innerHTML = prevHTML;

    if (importadas > 0) {
      db.set('mif', [...existentes, ...novos]);
      document.getElementById('import-result').style.display = 'flex';
      document.getElementById('import-n').textContent = importadas;
      atualizarBadges();
    } else {
      document.getElementById('import-preview').innerHTML +=
        `<div style="color:var(--danger);margin-top:12px">⚠️ Nenhum registro importado. Verifique se o arquivo contém mulheres de 10-49 anos não cadastradas.</div>`;
    }
  };
  reader.readAsText(file, 'latin1');
}

// ── RELATÓRIOS PDF ────────────────────────────────────────
function exportarJSON() {
  const blob = new Blob([JSON.stringify({
    sistema: 'ESF26 Carisma v4', exportadoEm: new Date().toISOString(),
    mif: db.get('mif'), contraceptivos: db.get('contracep'), pccu: db.get('pccu'), ist: db.get('ist')
  }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `carisma_backup_${hoje()}.json`; a.click();
}
function importarJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!confirm('Isso SUBSTITUIRÁ todos os dados atuais. Continuar?')) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.mif) db.set('mif', d.mif); if (d.contraceptivos) db.set('contracep', d.contraceptivos);
      if (d.pccu) db.set('pccu', d.pccu); if (d.ist) db.set('ist', d.ist);
      alert('✅ Backup restaurado!'); location.reload()
    }
    catch { alert('❌ Arquivo inválido') }
  };
  r.readAsText(file);
}
function exportarRelatorio(tipo) {
  const cfg = db.getObj('config'); const ubs = cfg.ubs || 'ESF 26 – Carisma';
  const { jsPDF } = window.jspdf; const doc = new jsPDF(); const hj = new Date().toLocaleDateString('pt-BR');
  doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(ubs, 105, 15, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(`Dourados/MS – ${hj}`, 105, 22, { align: 'center' });
  let titulo = '', rows = [];
  if (tipo === 'atrasados') {
    titulo = 'Contraceptivos Atrasados – Busca Ativa';
    rows = calcAtrasados().map((m, i) => [i + 1, m.nome, m.metodo, fmtData(m.proximaDose), m.diasAtraso + 'd', m.tel || '—', m.microArea || '—'])
  }
  else if (tipo === 'mif') {
    titulo = 'Cadastro MIF';
    rows = db.get('mif').map((m, i) => [i + 1, m.nome, calcIdadeNum(m.nasc) + 'a', m.metodo || '—', m.microArea || '—', m.tel || '—'])
  }
  else if (tipo === 'pccu') {
    titulo = 'PCCU Pendentes';
    rows = db.get('mif').filter(m => !m.pccuData || diffDias(hoje(), m.pccuData) > 365)
      .map((m, i) => [i + 1, m.nome, m.pccuData ? fmtData(m.pccuData) : 'Nunca', m.tel || '—'])
  }
  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text(titulo, 105, 32, { align: 'center' });
  let y = 44; doc.setFontSize(8); doc.setFont(undefined, 'normal');
  rows.forEach(row => { doc.text(row.join('   '), 10, y); y += 7; if (y > 280) { doc.addPage(); y = 15 } });
  doc.save(`${titulo.replace(/\W/g, '_')}_${hoje()}.pdf`);
}
function exportarBuscaAtiva() { exportarRelatorio('atrasados') }

function exportarFilaEspera(metodoFiltro = '', tipo = 'pdf') {
  const mifs = db.get('mif') || [];
  const mm = {}; mifs.forEach(m => { if(m.id) mm[m.id] = m; });
  let lista = (db.get('fila_contracep') || []).map(p => ({ 
    ...p, 
    mif: mm[p.mulherId] || { nome: 'Paciente não encontrada', telCelular: '' },
    escore: p.escore || 0
  }));
  
  if (metodoFiltro) {
    lista = lista.filter(p => p.metodo === metodoFiltro);
  }
  
  lista.sort((a, b) => {
    if (b.escore !== a.escore) return b.escore - a.escore;
    const da = a.dataInsercao ? new Date(a.dataInsercao).getTime() : 0;
    const dbTime = b.dataInsercao ? new Date(b.dataInsercao).getTime() : 0;
    return (isNaN(da) ? 0 : da) - (isNaN(dbTime) ? 0 : dbTime);
  });
  
  if (tipo === 'imprimir') {
    const titulo = metodoFiltro ? `Fila de Espera - ${metodoFiltro}` : 'Fila de Espera - Contraceptivos';
    const rows = lista.map((p, i) => {
      const prioridade = p.escore >= 40 ? 'URGENTE' : p.escore >= 25 ? 'ALTA' : p.escore >= 15 ? 'MÉDIA' : 'BAIXA';
      const dias = diffDias(hoje(), p.dataInsercao) || 0;
      return `${i+1}. ${p.mif.nome} | Prior: ${prioridade} (${p.escore}pts) | Método: ${p.metodo||'-'} | ${dias} dias`;
    }).join('\n');
    
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>${titulo}</title>
        <style>body{font-family:Arial;padding:20px;white-space:pre-wrap;}</style></head>
        <body><h2>${titulo}</h2><p>Data: ${new Date().toLocaleDateString('pt-BR')}</p><hr>${rows || 'Nenhum registro encontrado.'}</body></html>
      `);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
    return;
  }
  
  const { jsPDF } = window.jspdf; 
  const doc = new jsPDF();
  const cfg = db.getObj('config');
  const ubs = cfg.ubs || 'ESF 26 – Carisma';
  const hj = new Date().toLocaleDateString('pt-BR');
  const titulo = metodoFiltro ? `Fila de Espera - ${metodoFiltro}` : 'Fila de Espera - Contraceptivos';
  
  doc.setFontSize(14); doc.setFont(undefined, 'bold'); 
  doc.text(ubs, 105, 12, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); 
  doc.text(`Dourados/MS – ${hj}`, 105, 18, { align: 'center' });
  doc.setFontSize(12); doc.setFont(undefined, 'bold'); 
  doc.text(titulo, 105, 26, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Total: ${lista.length} paciente(s)`, 105, 32, { align: 'center' });
  
  let y = 40; doc.setFontSize(8); doc.setFont(undefined, 'bold');
  doc.text('Nº', 10, y);
  doc.text('Prioridade', 20, y);
  doc.text('Paciente', 45, y);
  doc.text('Método', 115, y);
  doc.text('Pts', 150, y);
  doc.text('Dias', 170, y);
  y += 4; doc.setFont(undefined, 'normal');
  
  lista.forEach((p, i) => {
    const prioridade = p.escore >= 40 ? 'URGENTE' : p.escore >= 25 ? 'ALTA' : p.escore >= 15 ? 'MÉDIA' : 'BAIXA';
    const dias = diffDias(hoje(), p.dataInsercao) || 0;
    const nome = p.mif.nome.length > 30 ? p.mif.nome.substring(0, 30) + '...' : p.mif.nome;
    doc.text(String(i + 1), 10, y);
    doc.text(prioridade, 20, y);
    doc.text(nome, 45, y);
    doc.text(p.metodo || '—', 115, y);
    doc.text(String(p.escore), 150, y);
    doc.text(String(dias), 170, y);
    y += 6;
    if (y > 280) { doc.addPage(); y = 15; }
  });
  
  const filename = metodoFiltro ? `fila_espera_${metodoFiltro.toLowerCase()}_${hoje()}.pdf` : `fila_espera_contraceptivos_${hoje()}.pdf`;
  doc.save(filename);
}

function abrirModalExportFila() {
  document.getElementById('export-fila-metodo').value = '';
  document.getElementById('export-fila-tipo').value = 'pdf';
  abrirModal('modal-export-fila');
}

function executarExportFila() {
  const metodo = document.getElementById('export-fila-metodo').value;
  const tipo = document.getElementById('export-fila-tipo').value;
  exportarFilaEspera(metodo, tipo);
  fecharModal('modal-export-fila');
}

function exportarPrioridades() {
  const { jsPDF } = window.jspdf; const doc = new jsPDF(); const cfg = db.getObj('config');
  doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(cfg.ubs || 'ESF 26 – Carisma', 105, 15, { align: 'center' });
  doc.setFontSize(11); doc.text('Prioridades – ' + new Date().toLocaleDateString('pt-BR'), 105, 23, { align: 'center' });
  let y = 35; doc.setFontSize(9);
  calcAtrasados().forEach((m, i) => { doc.text(`${i + 1}. ${m.nome} – ${m.metodo} – ${m.diasAtraso}d atraso – Tel: ${m.tel || '—'}`, 10, y); y += 7; if (y > 280) { doc.addPage(); y = 15 } });
  doc.save(`prioridades_${hoje()}.pdf`);
}

// ── CONFIGURAÇÕES ─────────────────────────────────────────
function carregarConfig() {
  const cfg = db.getObj('config');
  ['ubs', 'mun', 'cnes', 'resp'].forEach(k => { const el = document.getElementById('cfg-' + k); if (el && cfg[k]) el.value = cfg[k] });
}
function salvarConfig() {
  const g = id => document.getElementById(id).value;
  const novaSenha = g('cfg-senha');
  db.setObj('config', {
    ubs: g('cfg-ubs'), mun: g('cfg-mun'), cnes: g('cfg-cnes'), resp: g('cfg-resp'),
    senha: novaSenha || db.getObj('config').senha || '123456'
  });
  const ok = document.getElementById('cfg-ok'); ok.style.display = 'flex'; setTimeout(() => ok.style.display = 'none', 3000);
}
function confirmarLimpar() {
  if (!confirm('⚠️ Apagará TODOS os dados permanentemente. Tem certeza?')) return;
  if (!confirm('ÚLTIMA CONFIRMAÇÃO: Apagar tudo?')) return;
  Object.values(KEYS).forEach(k => localStorage.removeItem(k)); alert('Dados apagados.'); location.reload();
}

// ── UTILS MODAL ───────────────────────────────────────────
function abrirModal(id) { document.getElementById(id).classList.add('open') }
function fecharModal(id) { document.getElementById(id).classList.remove('open') }
function abrirModalNovoPaciente() { abrirModal('modal-novo-paciente') }

function salvarNovoPaciente(e) {
  e.preventDefault();
  console.log("Salvando novo paciente...");
  
  try {
    const nome = document.getElementById('np-nome').value;
    const nasc = document.getElementById('np-nasc').value;
    const sexo = document.getElementById('np-sexo')?.value;
    const cpf = document.getElementById('np-cpf').value;
    const cns = document.getElementById('np-cns').value;
    const tel = document.getElementById('np-tel').value;
    
    if (!nome) return alert('Nome é obrigatório!');
    if (!nasc) return alert('Data de nascimento é obrigatória!');
    
    const novo = {
      id: uuid(),
      nome: nome,
      nasc: nasc,
      sexo: sexo,
      cpf: cpf,
      cns: cns,
      tel: tel || document.getElementById('np-cel')?.value,
      endereco: document.getElementById('np-rua')?.value,
      numero: document.getElementById('np-num')?.value,
      bairro: document.getElementById('np-bairro')?.value,
      cidade: document.getElementById('np-cidade')?.value || 'Dourados',
      estado: document.getElementById('np-est')?.value || 'MS',
      micro: document.getElementById('np-micro')?.value,
      createdAt: new Date().toISOString()
    };
    
    const existing = db.get('mif') || [];
    
    if (cpf) {
      const alreadyCpf = existing.find(p => p.cpf === cpf);
      if (alreadyCpf) return alert('Já existe paciente com este CPF!');
    }
    if (cns) {
      const alreadyCns = existing.find(p => p.cns === cns);
      if (alreadyCns) return alert('Já existe paciente com este CNS!');
    }
    
    db.set('mif', [...existing, novo]);
    console.log("Paciente salvo:", novo.nome);
    
    atualizarBadges();
    fecharModal('modal-novo-paciente');
    document.getElementById('form-novo-paciente')?.reset();
    alert('Paciente cadastrado com sucesso!');
  } catch(err) {
    console.error("Erro ao salvar:", err);
    alert('Erro ao salvar: ' + err.message);
  }
}

function excItem(chave, id, fn) { if (!confirm('Excluir este registro?')) return; db.set(chave, db.get(chave).filter(x => x.id !== id)); fn() }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open') }));

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-link[data-page]').forEach(l => l.addEventListener('click', e => { e.preventDefault(); navTo(l.dataset.page) }));
  checarSessao();
});

// ── ADMINISTRATIVO / PEDIDOS DE MEDICAMENTOS ────────────────────────
function switchAdminTab(tab) {
  document.querySelectorAll('#pg-administrativo .view-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#pg-administrativo .view-content').forEach(c => c.classList.remove('active'));
  
  const tabs = {
    'pedidos': 1,
    'escalas': 2,
    'folgas': 3,
    'equipamentos': 4,
    'estoque': 5
  };
  
  document.querySelector(`#pg-administrativo .view-tab:nth-child(${tabs[tab]})`).classList.add('active');
  document.getElementById(`view-admin-${tab}`).classList.add('active');
  
  if (tab === 'pedidos') renderPedidosMedicamentos();
  if (tab === 'folgas') {
    renderEquipe();
    renderExtratoHoras();
  }
  if (tab === 'escalas') renderEscala();
}

let pedidosAtual = [];

// Base de Medicamentos Simplificada baseada na imagem do usuário
const baseMedicamentos = [
  { horus: "BR0271687", betha: "58712", categoria: "Geral", medicamento: "Ácido Ascórbico (Vitamina C)", desc: "ampola 500mg" },
  { horus: "BR0276839U0063", betha: "11112", categoria: "Geral", medicamento: "Água Destilada", desc: "ampola 10mL" },
  { horus: "BR0268222U0004", betha: "37341", categoria: "Geral", medicamento: "Bicarbonato de Sódio", desc: "ampola 8,4% 10mL" },
  { horus: "BR0267613U0042", betha: "29098", categoria: "Geral", medicamento: "Captopril", desc: "comprimido 25mg" },
  { horus: "BR0448845U0009", betha: "2477", categoria: "Geral", medicamento: "Cetoprofeno", desc: "ampola 50mg/mL" },
  { horus: "BR0368654U0004", betha: "77472", categoria: "Geral", medicamento: "Cloreto de Sódio (Soro Fisiológico)", desc: "ampola 0,9% 10mL" },
  { horus: "BR0268236U0039", betha: "58722", categoria: "Geral", medicamento: "Cloreto de Sódio (Soro Fisiológico)", desc: "frasco 0,9% 500mL" },
  { horus: "BR0292427U0006", betha: "10965", categoria: "Geral", medicamento: "Dexametasona injetável", desc: "ampola 4mg/mL" },
  { horus: "BR0268252U0009", betha: "55942", categoria: "Geral", medicamento: "Dipirona", desc: "ampola 500mg/mL" },
  { horus: "BR0267205U0086", betha: "58024", categoria: "Geral", medicamento: "Dipirona gotas", desc: "frasco 500mg/mL" },
  { horus: "BR0267666U0009", betha: "56293", categoria: "Geral", medicamento: "Furosemida", desc: "ampola 10mg/mL" },
  { horus: "BR0267541U0004", betha: "11123", categoria: "Geral", medicamento: "Glicose", desc: "ampola 50% 10mL" },
  { horus: "BR0356905", betha: "77442", categoria: "Geral", medicamento: "Teste rápido β-HCG (Gravidez)", desc: "Caixa" },
  { horus: "BR0455634", betha: "562639", categoria: "Geral", medicamento: "Teste rápido DUO - HIV e Sífilis", desc: "Caixa" },
  { horus: "BR0334484", betha: "77248", categoria: "Geral", medicamento: "Teste rápido HIV", desc: "Caixa" },
  { horus: "BR0370564", betha: "77249", categoria: "Geral", medicamento: "Teste rápido Hepatite B", desc: "Caixa" },
  { horus: "BR0361446", betha: "77244", categoria: "Geral", medicamento: "Teste Rápido Sífilis", desc: "Caixa" },
  
  // Carrinho
  { horus: "BR0267502U0042", betha: "52250", categoria: "Carrinho de Emergência", medicamento: "Ácido acetilsalicílico", desc: "comprimidos 100mg" },
  { horus: "BR0271710U0010", betha: "37340", categoria: "Carrinho de Emergência", medicamento: "Amiodarona", desc: "ampola 50mg/ml" },
  { horus: "BR0268255U0005", betha: "58726", categoria: "Carrinho de Emergência", medicamento: "Epinefrina (Adrenalina)", desc: "ampola 1:1000" },
  
  // LARCs
  { horus: "BR0297746U0140", betha: "59750", categoria: "LARCs", medicamento: "SISTEMA INTRA-UTERINO (DIU) DE COBRE", desc: "SISTEMA INTRAUTERINO" },
  
  // Cuidados com a pele
  { horus: "BR0430103", betha: "59499", categoria: "Cuidados com a Pele", medicamento: "Creme Barreira", desc: "creme 60 gr" }
];

function initPedidos() {
  const salvas = db.get('carisma_medicamentos');
  if (salvas && salvas.length > 0) {
    pedidosAtual = salvas;
  } else {
    pedidosAtual = baseMedicamentos.map(m => ({ ...m, id: uuid(), pedido: '', obs: '' }));
    db.set('carisma_medicamentos', pedidosAtual);
  }
}

function limparPedidoAtual() {
  if (!confirm('Deseja realmente limpar as quantidades (coluna "Pedido") de todos os medicamentos? O catálogo permanecerá salvo pro próximo mês.')) return;
  initPedidos();
  pedidosAtual = pedidosAtual.map(m => ({ ...m, pedido: '' }));
  db.set('carisma_medicamentos', pedidosAtual);
  renderPedidosMedicamentos();
}

function renderPedidosMedicamentos() {
  initPedidos();
  const cat = document.getElementById('f-pedido-categoria').value;
  const busca = document.getElementById('s-pedido-med').value.toLowerCase();
  
  let lista = pedidosAtual;
  if (cat) lista = lista.filter(m => m.categoria === cat);
  if (busca) lista = lista.filter(m => (m.medicamento + m.desc + m.horus + m.betha).toLowerCase().includes(busca));
  
  const tb = document.getElementById('tb-pedidos-meds');
  const em = document.getElementById('pedidos-meds-empty');
  
  if (lista.length === 0) {
    tb.innerHTML = '';
    em.style.display = 'block';
    return;
  }
  
  em.style.display = 'none';
  tb.innerHTML = lista.map(m => `
    <tr>
      <td><input type="text" value="${m.horus}" onchange="atualizarCampoPedido('${m.id}', 'horus', this.value)" style="width:100%; border:none; background:transparent"></td>
      <td><input type="text" value="${m.betha}" onchange="atualizarCampoPedido('${m.id}', 'betha', this.value)" style="width:100%; border:none; background:transparent"></td>
      <td><input type="text" value="${m.medicamento}" onchange="atualizarCampoPedido('${m.id}', 'medicamento', this.value)" style="width:100%; border:none; background:transparent; font-weight:600"></td>
      <td><input type="text" value="${m.desc}" onchange="atualizarCampoPedido('${m.id}', 'desc', this.value)" style="width:100%; border:none; background:transparent"></td>
      <td><input type="text" value="${m.pedido}" onchange="atualizarCampoPedido('${m.id}', 'pedido', this.value)" placeholder="Qtd" style="width:100%; padding:6px; border:1px solid var(--border); border-radius:6px; font-weight:bold; color:var(--primary-dark)"></td>
      <td><input type="text" value="${m.obs}" onchange="atualizarCampoPedido('${m.id}', 'obs', this.value)" placeholder="Observações" style="width:100%; border:none; background:transparent"></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removerLinhaPedido('${m.id}')" title="Remover item">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function atualizarCampoPedido(id, campo, valor) {
  const item = pedidosAtual.find(x => x.id === id);
  if (item) {
    item[campo] = valor;
    db.set('carisma_medicamentos', pedidosAtual);
  }
}

function adicionarLinhaPedido() {
  initPedidos();
  const cat = document.getElementById('f-pedido-categoria').value || 'Geral';
  pedidosAtual.unshift({
    id: uuid(), horus: '', betha: '', categoria: cat, medicamento: '', desc: '', pedido: '', obs: ''
  });
  db.set('carisma_medicamentos', pedidosAtual);
  renderPedidosMedicamentos();
}

function removerLinhaPedido(id) {
  pedidosAtual = pedidosAtual.filter(x => x.id !== id);
  db.set('carisma_medicamentos', pedidosAtual);
  renderPedidosMedicamentos();
}

function exportarPedidosMedicamentos() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert("Biblioteca PDF não carregada. Você pode tentar imprimir a página (Ctrl+P).");
    return;
  }
  
  const solicitados = pedidosAtual.filter(m => m.pedido && m.pedido.trim() !== '' && m.pedido !== '0');
  
  if (solicitados.length === 0) {
    if (!confirm("Nenhum item com quantidade informada no campo 'Pedido'. Deseja imprimir a lista completa em branco?")) return;
  }
  
  const doc = new jsPDF();
  const hj = new Date().toLocaleDateString('pt-BR');
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text("PEDIDO DE MEDICAMENTOS - CAF", 105, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const cfg = db.getObj('config');
  doc.text(`${cfg.ubs || 'ESF 26 – Carisma'} - Solicitado em: ${hj}`, 105, 22, { align: 'center' });
  
  let y = 35;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text("HÓRUS", 10, y);
  doc.text("BETHA", 40, y);
  doc.text("MEDICAMENTO", 65, y);
  doc.text("DESCRIÇÃO", 125, y);
  doc.text("QTD", 165, y);
  doc.text("OBS", 185, y);
  y += 5;
  
  doc.setLineWidth(0.5);
  doc.line(10, y, 200, y);
  y += 7;
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  
  const listaExport = solicitados.length > 0 ? solicitados : pedidosAtual;
  
  listaExport.forEach(m => {
    let tObs = m.obs || '';
    if (tObs.length > 10) tObs = tObs.substring(0, 10) + '...';
    
    let tMed = m.medicamento || '';
    if (tMed.length > 30) tMed = tMed.substring(0, 30) + '...';
    
    let tDesc = m.desc || '';
    if (tDesc.length > 25) tDesc = tDesc.substring(0, 25) + '...';
    
    doc.text(m.horus || '-', 10, y);
    doc.text(m.betha || '-', 40, y);
    doc.text(tMed, 65, y);
    doc.text(tDesc, 125, y);
    doc.setFont(undefined, 'bold');
    doc.text(m.pedido ? m.pedido.toString() : '      ', 165, y);
    doc.setFont(undefined, 'normal');
    doc.text(tObs, 185, y);
    
    y += 7;
    if (y > 280) {
      doc.addPage();
      y = 15;
    }
  });
  
  doc.save(`pedido_medicamentos_${hoje()}.pdf`);
}

// ── ADMINISTRATIVO / EQUIPE E BANCO DE HORAS ────────────────────────

function renderEquipe() {
  const equipe = db.get('carisma_equipe') || [];
  const tb = document.getElementById('tb-equipe');
  
  if (equipe.length === 0) {
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center">Ninguém cadastrado na equipe.</td></tr>';
  } else {
    tb.innerHTML = equipe.map(m => {
      const saldo = calcularSaldoHoras(m.id);
      const cor = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
      return `
      <tr>
        <td><strong>${m.nome}</strong></td>
        <td>${m.cargo}</td>
        <td>${m.coren || '-'}</td>
        <td style="color:${cor}; font-weight:bold">${saldo}h</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirEquipe('${m.id}')" title="Excluir">🗑️</button></td>
      </tr>`;
    }).join('');
  }
}

function abrirModalEquipe() {
  document.getElementById('form-equipe').reset();
  document.getElementById('eq-id').value = '';
  document.getElementById('equipe-modal-title').textContent = 'Novo Membro da Equipe';
  abrirModal('modal-equipe');
}

function salvarEquipe(e) {
  e.preventDefault();
  const id = document.getElementById('eq-id').value || uuid();
  const nome = document.getElementById('eq-nome').value.trim();
  const cargo = document.getElementById('eq-cargo').value;
  const coren = document.getElementById('eq-coren').value.trim();
  
  const equipe = db.get('carisma_equipe') || [];
  
  const idx = equipe.findIndex(x => x.id === id);
  if (idx >= 0) {
    equipe[idx] = { id, nome, cargo, coren };
  } else {
    equipe.push({ id, nome, cargo, coren });
  }
  
  db.set('carisma_equipe', equipe);
  fecharModal('modal-equipe');
  renderEquipe();
  
  if (document.getElementById('view-admin-escalas').classList.contains('active')) {
    renderEscala();
  }
}

function excluirEquipe(id) {
  if (!confirm('Deseja realmente remover este membro da equipe e apagar seu histórico?')) return;
  db.set('carisma_equipe', (db.get('carisma_equipe') || []).filter(x => x.id !== id));
  db.set('carisma_folgas', (db.get('carisma_folgas') || []).filter(x => x.equipeId !== id));
  renderEquipe();
  renderExtratoHoras();
  if (document.getElementById('view-admin-escalas').classList.contains('active')) {
    renderEscala();
  }
}

function abrirModalLancarHoras() {
  const equipe = db.get('carisma_equipe') || [];
  if (equipe.length === 0) {
    alert("Cadastre membros da equipe primeiro na tabela.");
    return;
  }
  const sel = document.getElementById('ho-membro');
  sel.innerHTML = equipe.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
  
  document.getElementById('form-horas').reset();
  document.getElementById('ho-data').value = new Date().toISOString().split('T')[0];
  toggleFatorHoras();
  abrirModal('modal-horas');
}

function toggleFatorHoras() {
  const tipo = document.getElementById('ho-tipo').value;
  document.getElementById('div-fator').style.display = tipo === 'Credito' ? 'block' : 'none';
}

function salvarHoras(e) {
  e.preventDefault();
  const equipeId = document.getElementById('ho-membro').value;
  const tipo = document.getElementById('ho-tipo').value;
  const data = document.getElementById('ho-data').value;
  const baseHoras = parseFloat(document.getElementById('ho-qtd').value);
  const fator = tipo === 'Credito' ? parseFloat(document.getElementById('ho-fator').value) : 1;
  const justificativa = document.getElementById('ho-just').value.trim();
  
  let saldoGerado = baseHoras;
  if (tipo === 'Credito') {
    saldoGerado = baseHoras * fator;
  } else {
    saldoGerado = -baseHoras;
  }
  
  const extrato = db.get('carisma_folgas') || [];
  extrato.unshift({
    id: uuid(), equipeId, tipo, data, horasBase: baseHoras, fator, saldoGerado, justificativa, dataReg: new Date().toISOString()
  });
  
  db.set('carisma_folgas', extrato);
  fecharModal('modal-horas');
  renderEquipe();
  renderExtratoHoras();
}

function excluirLancamento(id) {
  if (!confirm('Excluir este lançamento do banco de horas? O saldo do profissional será recalculado automaticamente.')) return;
  const extrato = db.get('carisma_folgas') || [];
  db.set('carisma_folgas', extrato.filter(x => x.id !== id));
  renderEquipe();
  renderExtratoHoras();
}

function calcularSaldoHoras(equipeId) {
  const extrato = db.get('carisma_folgas') || [];
  let saldo = 0;
  extrato.filter(x => x.equipeId === equipeId).forEach(l => {
    saldo += l.saldoGerado;
  });
  return saldo;
}

function renderExtratoHoras() {
  const extrato = db.get('carisma_folgas') || [];
  const equipe = db.get('carisma_equipe') || [];
  const tb = document.getElementById('tb-extrato-horas');
  
  if (extrato.length === 0) {
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center">Nenhum lançamento recente.</td></tr>';
  } else {
    tb.innerHTML = extrato.slice(0, 30).map(l => {
      const membro = equipe.find(x => x.id === l.equipeId);
      const mNome = membro ? membro.nome : '(Excluído)';
      const descFator = l.tipo === 'Credito' ? l.fator + 'x' : '-';
      const corT = l.tipo === 'Credito' ? 'var(--success)' : 'var(--danger)';
      const tipoT = l.tipo === 'Credito' ? '➕ Crédito' : '➖ Débito';
      
      return `
      <tr>
        <td>${fmtData(l.data)}</td>
        <td><strong>${mNome}</strong></td>
        <td style="color:${corT}">${tipoT}</td>
        <td>${l.horasBase}h</td>
        <td>${descFator}</td>
        <td style="font-weight:bold">${l.saldoGerado > 0 ? '+' : ''}${l.saldoGerado}h</td>
        <td>${l.justificativa}</td>
        <td><button class="btn btn-sm btn-danger" onclick="excluirLancamento('${l.id}')" title="Excluir Lançamento">🗑️</button></td>
      </tr>`;
    }).join('');
  }
}

// ── ADMINISTRATIVO / ESCALAS ────────────────────────────────
function renderEscala() {
  const equipe = db.get('carisma_equipe') || [];
  const escalaSalva = db.getObj('carisma_escala') || {};
  
  const tb = document.getElementById('tb-escala-semanal');
  const em = document.getElementById('escala-empty');
  
  if (equipe.length === 0) {
    tb.innerHTML = '';
    em.style.display = 'flex';
  } else {
    em.style.display = 'none';
    const dias = ['seg', 'ter', 'qua', 'qui', 'sex'];
    
    tb.innerHTML = equipe.map(m => {
      const p = escalaSalva[m.id] || {};
      const inputs = dias.map(d => `<td><input type="text" data-eq="${m.id}" data-dia="${d}" value="${p[d] || ''}" placeholder="Setor/Turno" style="width:100%; padding:6px; border:1px solid var(--border); border-radius:4px; font-size:0.85rem"></td>`).join('');
      return `
      <tr>
        <td><strong>${m.nome}</strong><br><span style="font-size:0.75rem; color:var(--text2)">${m.cargo}</span></td>
        ${inputs}
      </tr>`;
    }).join('');
  }
}

function salvarEscala() {
  const equipe = db.get('carisma_equipe') || [];
  if (equipe.length === 0) return;
  
  const escalaObj = {};
  const dias = ['seg', 'ter', 'qua', 'qui', 'sex'];
  
  equipe.forEach(m => {
    escalaObj[m.id] = {};
    dias.forEach(d => {
      const el = document.querySelector(`input[data-eq="${m.id}"][data-dia="${d}"]`);
      if (el) escalaObj[m.id][d] = el.value.trim();
    });
  });
  
  db.setObj('carisma_escala', escalaObj);
  alert("Escala salva com sucesso!");
}
