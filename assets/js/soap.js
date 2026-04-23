/**
 * SOAP Logic for ESF 26 Carisma Manager
 * Manages clinical templates and patient assessment history
 */

// ── TEMPLATES ─────────────────────────────────────────────

function renderSOAPTemplates() {
    const templates = db.get('soap_templates');
    const b = document.getElementById('tb-soap-templates');
    const e = document.getElementById('soap-templates-empty');
    const busca = document.getElementById('s-soap-template').value.toLowerCase();

    const filtered = templates.filter(t => t.titulo.toLowerCase().includes(busca));

    if (filtered.length === 0) {
        b.innerHTML = '';
        e.style.display = 'block';
        return;
    }

    e.style.display = 'none';
    b.innerHTML = filtered.map(t => `
        <tr>
            <td><strong>${t.titulo}</strong></td>
            <td><small>${t.s.substring(0, 50)}${t.s.length > 50 ? '...' : ''}</small></td>
            <td><small>${t.o.substring(0, 50)}${t.o.length > 50 ? '...' : ''}</small></td>
            <td>
                <div class="actions">
                    <button class="btn btn-sm btn-primary" onclick="abrirModalTemplate('${t.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="excluirTemplate('${t.id}')">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function abrirModalTemplate(id = null) {
    const f = document.getElementById('form-soap-template');
    f.reset();
    document.getElementById('soap-template-id').value = '';
    document.getElementById('soap-template-modal-title').textContent = id ? 'Editar Modelo SOAP' : 'Novo Modelo SOAP';

    if (id) {
        const t = db.get('soap_templates').find(x => x.id === id);
        if (t) {
            document.getElementById('soap-template-id').value = t.id;
            document.getElementById('soap-template-titulo').value = t.titulo;
            document.getElementById('soap-template-s').value = t.s;
            document.getElementById('soap-template-o').value = t.o;
            document.getElementById('soap-template-a').value = t.a;
            document.getElementById('soap-template-p').value = t.p;
        }
    }
    abrirModal('modal-soap-template');
}

function salvarSOAPTemplate(e) {
    e.preventDefault();
    const id = document.getElementById('soap-template-id').value;
    const obj = {
        id: id || uuid(),
        titulo: document.getElementById('soap-template-titulo').value.trim(),
        s: document.getElementById('soap-template-s').value.trim(),
        o: document.getElementById('soap-template-o').value.trim(),
        a: document.getElementById('soap-template-a').value.trim(),
        p: document.getElementById('soap-template-p').value.trim(),
        dataAtualizacao: new Date().toISOString()
    };

    let lista = db.get('soap_templates');
    if (id) {
        lista = lista.map(x => x.id === id ? obj : x);
    } else {
        lista.push(obj);
    }

    db.set('soap_templates', lista);
    fecharModal('modal-soap-template');
    renderSOAPTemplates();
}

function excluirTemplate(id) {
    if (!confirm('Excluir este modelo permanentemente?')) return;
    const lista = db.get('soap_templates').filter(x => x.id !== id);
    db.set('soap_templates', lista);
    renderSOAPTemplates();
}

// ── CLINICAL RECORDS (REGISTROS) ──────────────────────────

function abrirNovoRegistroSOAP(pacienteId = null) {
    // Se não passou ID (clicou no perfil em tela cheia), pega da URL ou do sessionStorage
    if (!pacienteId) {
        const urlParams = new URLSearchParams(window.location.search);
        pacienteId = urlParams.get('id');
    }

    if (!pacienteId) {
        const psel = JSON.parse(sessionStorage.getItem('cc_pessoa_selecionada') || '{}');
        pacienteId = psel.id;
    }

    if (!pacienteId) return alert('Selecione um paciente primeiro.');

    const p = db.get('mif').find(x => x.id === pacienteId);
    if (!p) return alert('Paciente não encontrado no banco de dados.');

    document.getElementById('form-soap-registro').reset();
    document.getElementById('soap-reg-paciente-id').value = p.id;
    document.getElementById('soap-reg-paciente-nome').textContent = p.nome;
    document.getElementById('soap-reg-paciente-info').textContent = `${p.idade || CC.idade(p.nasc)} anos • CNS: ${p.cns || '—'} • Microárea: ${p.microArea || '?'}`;

    // Popular seletor de modelos
    const sel = document.getElementById('soap-reg-modelo');
    const templates = db.get('soap_templates');
    sel.innerHTML = '<option value="">-- Selecione um modelo (opcional) --</option>' +
        templates.map(t => `<option value="${t.id}">${t.titulo}</option>`).join('');

    abrirModal('modal-soap-registro');
}

function aplicarTemplateNoRegistro(templateId) {
    if (!templateId) return;
    const t = db.get('soap_templates').find(x => x.id === templateId);
    if (t) {
        if (confirm('Deseja preencher os campos com este modelo? Isso substituirá o texto atual.')) {
            document.getElementById('soap-reg-s').value = t.s;
            document.getElementById('soap-reg-o').value = t.o;
            document.getElementById('soap-reg-a').value = t.a;
            document.getElementById('soap-reg-p').value = t.p;
        }
    }
}

function salvarRegistroSOAP(e) {
    e.preventDefault();
    const pacienteId = document.getElementById('soap-reg-paciente-id').value;
    const obj = {
        id: uuid(),
        pacienteId: pacienteId,
        data: new Date().toISOString(),
        s: document.getElementById('soap-reg-s').value.trim(),
        o: document.getElementById('soap-reg-o').value.trim(),
        a: document.getElementById('soap-reg-a').value.trim(),
        p: document.getElementById('soap-reg-p').value.trim()
    };

    const historico = db.get('soap_history');
    historico.push(obj);
    db.set('soap_history', historico);

    fecharModal('modal-soap-registro');
    if (typeof renderHistoricoSOAP === 'function') renderHistoricoSOAP(pacienteId);
    alert('Atendimento registrado com sucesso!');
}

function renderHistoricoSOAP(pacienteId) {
    const lista = db.get('soap_history').filter(h => h.pacienteId === pacienteId).reverse();
    const container = document.getElementById('historico-soap-lista');
    if (!container) return;

    if (lista.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text2);background:var(--surface);border-radius:8px;border:1px dashed var(--border)">
                Nenhum atendimento registrado ainda.
            </div>`;
        return;
    }

    container.innerHTML = lista.map(h => `
        <div style="background:#fff; border:1px solid var(--border); border-radius:10px; padding:15px; box-shadow:0 2px 4px rgba(0,0,0,0.03)">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid var(--surface2); padding-bottom:5px">
                <span style="font-weight:700; color:var(--primary); font-size:0.85rem">📅 Atendimento em ${new Date(h.data).toLocaleDateString('pt-BR')} ${new Date(h.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <button class="btn btn-sm btn-outline" onclick="excluirRegistroSOAP('${h.id}', '${pacienteId}')">🗑️</button>
            </div>
            <div style="display:grid; gap:8px; font-size:0.85rem">
                <div><strong style="color:var(--text2)">S:</strong> ${h.s}</div>
                <div><strong style="color:var(--text2)">O:</strong> ${h.o}</div>
                <div><strong style="color:var(--text2)">A:</strong> ${h.a}</div>
                <div><strong style="color:var(--text2)">P:</strong> ${h.p}</div>
            </div>
        </div>
    `).join('');
}

function excluirRegistroSOAP(id, pacienteId) {
    if (!confirm('Excluir este registro de atendimento permanentemente?')) return;
    const lista = db.get('soap_history').filter(x => x.id !== id);
    db.set('soap_history', lista);
    renderHistoricoSOAP(pacienteId);
}

// Patch no carregamento do perfil_paciente.html
if (window.location.pathname.includes('perfil_paciente.html')) {
    const _oldLoad = window.load;
    window.load = function () {
        if (typeof _oldLoad === 'function') _oldLoad();
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('id');
        if (pId) renderHistoricoSOAP(pId);
    };
}
