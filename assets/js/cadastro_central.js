// ══════════════════════════════════════════════════════════════════
//  CADASTRO_CENTRAL.JS  –  Cadastro Universal de Pacientes ESF 26
//  Carisma Manager  •  v1.0  •  2026
//  Importa o CSV "Acompanhamento de Condição de Saúde" do e-SUS
//  sem filtros, gerando perfis completos para toda a população.
// ══════════════════════════════════════════════════════════════════

/** Divide uma linha CSV respeitando campos entre aspas */
function splitCSV(line, sep = ';') {
    const res = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === sep && !inQ) { res.push(cur); cur = ''; }
        else cur += c;
    }
    res.push(cur);
    return res;
}

const CC = {
    // Storage
    KEY: 'carisma_pessoas',
    get: () => JSON.parse(localStorage.getItem('carisma_pessoas') || '[]'),
    set: (v) => localStorage.setItem('carisma_pessoas', JSON.stringify(v)),

    // Parsers
    parseDateBR: (s) => {
        if (!s || s === '-') return '';
        s = s.trim().replace(/"/g, '');
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, a] = s.split('/'); return `${a}-${m}-${d}`; }
        return '';
    },
    parseNum: (s) => { const n = parseFloat(String(s || '').replace(',', '.')); return isNaN(n) ? null : n; },
    parseDias: (s) => { const n = parseInt(s); return isNaN(n) || n < 0 ? null : n; },

    // Calcula idade em anos a partir de YYYY-MM-DD
    idade: (nasc) => {
        if (!nasc) return null;
        const h = new Date(), d = new Date(nasc);
        let a = h.getFullYear() - d.getFullYear();
        if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) a--;
        return a;
    },

    // Detecta tags automáticas com base nos dados do CSV
    detectarTags: (p) => {
        try {
            const autoTags = [];
            const existingTags = p.tags || [];
            const id = p.idade;
            const sx = (p.sexo || '').toLowerCase();
            const isFem = sx.startsWith('f');

            if (id !== null) {
                if (id < 10) autoTags.push('Criança');
                else if (id < 18) autoTags.push('Adolescente');
                else if (id >= 60) autoTags.push('Idoso');
            }
            if (isFem && id >= 10 && id <= 49) autoTags.push('MIF');
            if (p.bolsaFamilia === 'Sim') autoTags.push('Bolsa Família');

            // PCCU: sem coleta nos últimos 3 anos (1095 dias) ou nunca
            const pccuStr = p.diasUltPCCU;
            const pccu = CC.parseDias(pccuStr);
            if (isFem && id >= 25 && id <= 64) {
                if (pccu === null || pccu > 1095) autoTags.push('PCCU Pendente');
                else autoTags.push('PCCU OK');
            }

            // HIV
            if (!p.dataUltHIV || p.dataUltHIV === '-') autoTags.push('HIV s/avaliação');

            // Sífilis
            if (!p.dataUltSifilis || p.dataUltSifilis === '-') autoTags.push('Sífilis s/avaliação');

            // Sem visita domiciliar há mais de 6 meses
            const vd = CC.parseDias(p.diasUltVisita);
            if (vd !== null && vd > 180) autoTags.push('S/visita >6m');
            else if (vd === null) autoTags.push('Jamais visitado');

            // PA elevada na última medição
            const pa = p.ultimaPA || '';
            const parts = pa.split('/');
            if (parts.length === 2) {
                const sist = parseInt(parts[0]), diast = parseInt(parts[1]);
                if (!isNaN(sist) && !isNaN(diast)) {
                    if (sist >= 140 || diast >= 90) autoTags.push('PA Elevada');
                    else autoTags.push('PA Normal');
                }
            }

            // Obesidade / Sobrepeso
            const peso = CC.parseNum(p.ultimoPeso);
            const alt = CC.parseNum(p.ultimaAltura);
            if (peso && alt && alt > 0) {
                const imc = peso / ((alt / 100) ** 2);
                if (imc >= 30) autoTags.push('Obesidade');
                else if (imc >= 25) autoTags.push('Sobrepeso');
            }

            if (isFem && id >= 50 && id <= 69) {
                if (!p.dataUltMama || p.dataUltMama === '-') autoTags.push('Mama Pendente');
            }

            // Gestante (detectado via coluna 'gestante' do e-SUS)
            if (p.gestante) {
                const v = p.gestante.toLowerCase();
                if (v === 'sim' || v === 's' || v.includes('gestante') || v.includes('gestação')) {
                    autoTags.push('Gestante');
                }
            }

            // Sem atendimento de enfermagem há mais de 6 meses
            const enf = CC.parseDias(p.diasUltEnfermagem);
            if (enf !== null && enf > 180) autoTags.push('S/enf >6m');

            // UNIFICAR: Mantém tags manuais e adiciona automáticas sem duplicar
            const finalTags = new Set([...existingTags, ...autoTags]);
            return Array.from(finalTags);
        } catch (e) {
            console.error('Erro ao detectar tags:', e);
            return p.tags || [];
        }
    },

    // Salva uma alteração em um campo específico de uma pessoa
    salvarCampo: (id, campo, valor) => {
        const ps = CC.get();
        const idx = ps.findIndex(x => x.id === id);
        if (idx === -1) return false;
        ps[idx][campo] = valor;
        CC.set(ps);
        atualizarCCStats();
        return true;
    }
};

// ── MAPEAMENTO DE COLUNAS DO CSV ─────────────────────────────────
// O CSV "Acompanhamento de Condição de Saúde" do e-SUS tem ~47 colunas
// Este mapa usa substrings para localizar as colunas de forma robusta.
const CSV_MAP = [
    ['nome', 'nome'],
    ['nasc', 'data de nascimento'],
    ['sexo', 'sexo'],
    ['raca', 'raça'],
    ['bolsaFamilia', 'benefici'],
    ['cpf', 'cpf'],
    ['cns', 'cns'],
    ['telCelular', 'celular'],
    ['telResidencial', 'residencial'],
    ['telContato', 'contato'],
    ['microArea', 'micro'],
    ['rua', 'rua'],
    ['numero', 'número'],
    ['complemento', 'complemento'],
    ['bairro', 'bairro'],
    ['municipio', 'munic'],
    ['uf', 'uf'],
    ['cep', 'cep'],
    ['diasUltMedico', 'dias desde o último atendimento médico'],
    ['diasUltEnfermagem', 'dias desde o último atendimento de enfermagem'],
    ['diasUltOdonto', 'dias desde o último atendimento odontológico'],
    ['diasUltVisita', 'dias desde a última visita'],
    ['ultimoPeso', 'última medição de peso'],
    ['ultimaAltura', 'última medição de altura'],
    ['ultimaPA', 'última medição de pressão arterial'],
    ['dataUltPA', 'data da última medição de pressão'],
    ['dataUltSaúdeSexReprod', 'saúde sexual e reprodutiva'],
    ['dataUltHIV', 'hiv'],
    ['dataUltSifilis', 'sífilis'],
    ['dataUltHepB', 'hepatite b'],
    ['dataUltHepC', 'hepatite c'],
    ['descUltPCCU', 'câncer de colo de útero última solicita'],
    ['dataUltPCCU', 'câncer de colo de útero data última solicita'],
    ['descUltAvalPCCU', 'câncer de colo de útero última avalia'],
    ['dataUltAvalPCCU', 'câncer de colo de útero data última avalia'],
    ['dataUltMama', 'câncer de mama data última'],
    ['hpv', 'hpv'],
    ['gestante', 'gesta'],
];

// Dias desde a data de uma coleta (string DD/MM/YYYY)
function diasDesdeData(dateStr) {
    const iso = CC.parseDateBR(dateStr);
    if (!iso) return null;
    return Math.floor((new Date() - new Date(iso)) / 86400000);
}

// ── IMPORTAR CSV ─────────────────────────────────────────────────
function importarCSVCadastral(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const text = e.target.result;
            const allLines = text.split(/\r?\n/).filter(l => l.trim());
            const sep = ';';

            // Detectar linha de cabeçalho (contém 'nome' e 'cns')
            let headerIdx = -1;
            for (let i = 0; i < Math.min(50, allLines.length); i++) {
                const low = allLines[i].toLowerCase();
                if (low.includes('nome') && low.includes('cns') && low.includes('nascimento')) { headerIdx = i; break; }
            }
            if (headerIdx === -1) {
                document.getElementById('cc-preview').innerHTML = '<div style="color:var(--danger);padding:16px">⚠️ Cabeçalho não encontrado. Use o relatório "Acompanhamento de Condição de Saúde" do e-SUS.</div>';
                return;
            }

            // Construir mapa de índice de colunas
            const rawHeader = splitCSV(allLines[headerIdx], sep).map(h => h.toLowerCase().trim());
            const idx = {};
            CSV_MAP.forEach(([campo, chave]) => {
                const i = rawHeader.findIndex(h => h.includes(chave));
                idx[campo] = i;
            });

            const get = (cols, campo) => { const i = idx[campo]; return (i >= 0 && i < cols.length) ? cols[i].trim().replace(/^"+|"+$/g, '') : '' };
            const existentes = CC.get();
            const mapCNS = new Map();
            const mapCPF = new Map();
            const mapNome = new Map();

            existentes.forEach(p => {
                if (p.cns) mapCNS.set(p.cns, p);
                if (p.cpf) mapCPF.set(p.cpf, p);
                if (p.nome) mapNome.set(p.nome.toLowerCase(), p);
            });

            const batchTag = document.getElementById('cc-batch-tag')?.value;
            const novos = []; let dup = 0; let atualizado = 0;

            const dataLines = allLines.slice(headerIdx + 1);
            dataLines.forEach(row => {
                if (!row.trim()) return;
                const cols = splitCSV(row, sep);
                const nome = get(cols, 'nome'); if (!nome || nome.length < 3) return;
                const cns = get(cols, 'cns').replace(/\D/g, '');
                const cpf = get(cols, 'cpf').replace(/\D/g, '');

                let pAntiga = null;
                if (cns) pAntiga = mapCNS.get(cns);
                if (!pAntiga && cpf) pAntiga = mapCPF.get(cpf);
                if (!pAntiga) pAntiga = mapNome.get(nome.toLowerCase());

                const nascStr = get(cols, 'nasc');
                const nasc = CC.parseDateBR(nascStr);
                const id = CC.idade(nasc);
                const dataUltPCCU = get(cols, 'dataUltPCCU');
                const diasUltPCCU = dataUltPCCU && dataUltPCCU !== '-' ? diasDesdeData(dataUltPCCU) : null;

                const pessoa = {
                    id: pAntiga ? pAntiga.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                    nome,
                    nasc,
                    idade: id,
                    sexo: get(cols, 'sexo'),
                    raca: get(cols, 'raca'),
                    bolsaFamilia: get(cols, 'bolsaFamilia'),
                    cpf,
                    cns,
                    telCelular: get(cols, 'telCelular').replace(/\D/g, ''),
                    telResidencial: get(cols, 'telResidencial').replace(/\D/g, ''),
                    telContato: get(cols, 'telContato').replace(/\D/g, ''),
                    microArea: get(cols, 'microArea').replace(/"/g, ''),
                    rua: get(cols, 'rua'),
                    numero: get(cols, 'numero'),
                    complemento: get(cols, 'complemento'),
                    bairro: get(cols, 'bairro'),
                    municipio: get(cols, 'municipio'),
                    uf: get(cols, 'uf'),
                    cep: get(cols, 'cep').replace(/\D/g, ''),
                    diasUltMedico: get(cols, 'diasUltMedico'),
                    diasUltEnfermagem: get(cols, 'diasUltEnfermagem'),
                    diasUltOdonto: get(cols, 'diasUltOdonto'),
                    diasUltVisita: get(cols, 'diasUltVisita'),
                    ultimoPeso: get(cols, 'ultimoPeso'),
                    ultimaAltura: get(cols, 'ultimaAltura'),
                    ultimaPA: get(cols, 'ultimaPA'),
                    dataUltPA: CC.parseDateBR(get(cols, 'dataUltPA')),
                    dataUltSaúdeSexReprod: CC.parseDateBR(get(cols, 'dataUltSaúdeSexReprod')),
                    dataUltHIV: get(cols, 'dataUltHIV'),
                    dataUltSifilis: get(cols, 'dataUltSifilis'),
                    dataUltHepB: get(cols, 'dataUltHepB'),
                    dataUltHepC: get(cols, 'dataUltHepC'),
                    descUltPCCU: get(cols, 'descUltPCCU'),
                    dataUltPCCU,
                    diasUltPCCU,
                    descUltAvalPCCU: get(cols, 'descUltAvalPCCU'),
                    dataUltAvalPCCU: CC.parseDateBR(get(cols, 'dataUltAvalPCCU')),
                    dataUltMama: get(cols, 'dataUltMama'),
                    hpv: get(cols, 'hpv'),
                    dataCadastro: pAntiga ? pAntiga.dataCadastro : new Date().toISOString(),
                    // PRESERVAR CAMPOS MANUAIS
                    anotacoes: pAntiga ? pAntiga.anotacoes : '',
                    medicamentos: pAntiga ? pAntiga.medicamentos : '',
                    examesPendentes: pAntiga ? pAntiga.examesPendentes : '',
                    tags: pAntiga ? (pAntiga.tags || []) : []
                };

                // Aplica Tag de Lote se selecionada
                if (batchTag && !pessoa.tags.includes(batchTag)) {
                    pessoa.tags.push(batchTag);
                }

                pessoa.tags = CC.detectarTags(pessoa);

                if (pAntiga) {
                    atualizado++;
                } else {
                    novos.push(pessoa);
                }

                // Atualizar mapas para evitar duplicatas no mesmo arquivo
                if (cns) mapCNS.set(cns, pessoa);
                if (cpf) mapCPF.set(cpf, pessoa);
                mapNome.set(nome.toLowerCase(), pessoa);
            });

            // Combinar todos os registros únicos de volta
            // Usamos o mapNome como fonte da verdade para a lista final (ou mapCNS se preferir, mas nome é garantido)
            const final = Array.from(mapNome.values());
            CC.set(final);

            document.getElementById('cc-preview').innerHTML = `
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px;margin-top:12px">
        ✅ Processamento concluído!<br>
        <small style="color:#6B7280">
            ➕ <strong>${novos.length}</strong> novos registros.<br>
            🔄 <strong>${atualizado}</strong> registros atualizados (campos manuais preservados).<br>
            Total no cadastro: <strong>${final.length}</strong> pessoas
        </small>
      </div>`;

            atualizarCCStats();
            if (typeof renderCCLista === 'function') renderCCLista();
            event.target.value = '';
        } catch (err) {
            console.error('[Importar CSV] Erro Crítico:', err);
            document.getElementById('cc-preview').innerHTML = `
                <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;padding:16px;margin-top:12px">
                    ❌ <strong>Erro na importação:</strong> ${err.message}<br>
                    <small style="color:#991B1B">Tente abrir o arquivo no Excel e salvar como CSV separado por ponto-e-vírgula (;)</small>
                </div>`;
        }
    };
    reader.readAsText(file, 'latin1');
}

// ── ESTATÍSTICAS DO DASHBOARD ────────────────────────────────────
function atualizarCCStats() {
    const ps = CC.get();
    setText('cc-total', ps.length);
    setText('cc-mif', ps.filter(p => p.tags?.includes('MIF')).length);
    setText('cc-pccu-pend', ps.filter(p => p.tags?.includes('PCCU Pendente')).length);
    setText('cc-idosos', ps.filter(p => p.tags?.includes('Idoso')).length);
    setText('cc-pa-elev', ps.filter(p => p.tags?.includes('PA Elevada')).length);
    setText('cc-sem-visita', ps.filter(p => p.tags?.includes('Jamais visitado') || p.tags?.includes('S/visita >6m')).length);
    setText('cc-gestantes', ps.filter(p => p.tags?.includes('Gestante')).length);

    // Adiciona stats das novas condições no Dashboard se existirem os elementos
    const setStat = (id, tag) => { const el = document.getElementById(id); if (el) el.textContent = ps.filter(p => p.tags?.includes(tag)).length; };
    setStat('cc-diab', 'Diabético');
    setStat('cc-hiper', 'Hipertenso');
    setStat('cc-pueri', 'Puericultura');
    setStat('cc-hans', 'Hanseníase');
    setStat('cc-tuberc', 'Tuberculose');
}

// ── RENDER LISTA DE PESSOAS ───────────────────────────────────────
function renderCCLista(page = 1) {
    const ps = CC.get();
    const busca = (document.getElementById('cc-search') || {}).value || '';
    const tagFiltro = (document.getElementById('cc-tag-filter') || {}).value || '';

    let lista = ps;
    if (busca) lista = lista.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.cns.includes(busca) || (p.cpf || '').includes(busca));
    if (tagFiltro) lista = lista.filter(p => p.tags?.includes(tagFiltro));

    const PG = 20;
    const totalPgs = Math.ceil(lista.length / PG);
    const slice = lista.slice((page - 1) * PG, page * PG);

    const el = document.getElementById('cc-lista');
    if (!el) return;

    if (lista.length === 0) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text2)">' +
            (ps.length === 0 ? '📭 Nenhum cadastro importado ainda. Use o botão "Importar CSV" acima.' :
                '🔍 Nenhuma pessoa encontrada com esses filtros.') + '</div>';
        return;
    }

    const tagCor = {
        'MIF': '#8B5CF6', 'Criança': '#3B82F6', 'Adolescente': '#6366F1', 'Idoso': '#F59E0B',
        'PCCU Pendente': '#EF4444', 'PCCU OK': '#10B981', 'PA Elevada': '#EF4444', 'PA Normal': '#10B981',
        'Bolsa Família': '#0EA5E9', 'Obesidade': '#F97316', 'Sobrepeso': '#F59E0B',
        'HIV s/avaliação': '#DC2626', 'Sífilis s/avaliação': '#B91C1C',
        'S/visita >6m': '#9CA3AF', 'Jamais visitado': '#6B7280',
        'Mama Pendente': '#EC4899', 'S/enf >6m': '#A78BFA'
    };

    el.innerHTML = slice.map(p => {
        const tel = p.telCelular || p.telResidencial || p.telContato || '—';
        const end = [p.rua, p.numero, p.bairro].filter(Boolean).join(', ') || '—';
        const tagsBadges = (p.tags || []).slice(0, 4).map(t => `<span style="background:${tagCor[t] || '#6B7280'}22;color:${tagCor[t] || '#6B7280'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">${t}</span>`).join(' ');
        return `
      <div class="cc-card" onclick="abrirPerfilCC('${p.id}')">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0">${p.nome.charAt(0)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
            <div style="font-size:.75rem;color:var(--text2)">${p.idade !== null ? p.idade + ' anos · ' : ''} ${p.sexo || ''} · Microárea ${p.microArea || '?'} · ${tel}</div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${tagsBadges}</div>
          </div>
          <button class="btn btn-sm btn-primary" style="flex-shrink:0" onclick="event.stopPropagation();abrirPerfilCC('${p.id}')">✏️</button>
        </div>
      </div>`;
    }).join('');

    // Paginação
    const pgEl = document.getElementById('cc-paginacao');
    if (pgEl) pgEl.innerHTML = totalPgs > 1
        ? `<div style="display:flex;gap:8px;justify-content:center;padding:12px;flex-wrap:wrap">
        ${Array.from({ length: totalPgs }, (_, i) => `<button onclick="renderCCLista(${i + 1})" class="btn btn-sm ${i + 1 === page ? 'btn-primary' : 'btn-secondary'}" style="min-width:36px">${i + 1}</button>`).join('')}
       </div>` : '';

    setText('cc-count-label', `Exibindo ${slice.length} de ${lista.length} pessoas`);
}

// ── PERFIL DO PACIENTE (modal) ────────────────────────────────────
function abrirPerfilCC(id, abaAtiva = 'resumo') {
    const p = CC.get().find(x => x.id === id); if (!p) return;
    const tel = p.telCelular ? '(' + p.telCelular.replace(/(\d{2})(\d{4,5})(\d{4})/, '$1) $2-$3') : p.telResidencial || '—';
    const end = [p.rua, p.numero, p.complemento, p.bairro, p.municipio + '/' + p.uf].filter(Boolean).join(', ');
    const tagHtml = (p.tags || []).map(t => `<span style="background:#EDE9FE;color:#5B21B6;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${t}</span>`).join(' ');

    const buildAbas = () => `
    <div class="cc-modal-tabs" style="display:flex;gap:15px;border-bottom:1px solid var(--border);margin-bottom:16px">
      <button onclick="abrirPerfilCC('${id}','resumo')" class="cc-tab ${abaAtiva === 'resumo' ? 'active' : ''}" style="padding:8px 0;border-bottom:2px solid ${abaAtiva === 'resumo' ? 'var(--primary)' : 'transparent'};background:none;font-weight:600;font-size:13px;color:${abaAtiva === 'resumo' ? 'var(--primary)' : 'var(--text2)'};cursor:pointer">📍 Resumo</button>
      <button onclick="abrirPerfilCC('${id}','clinico')" class="cc-tab ${abaAtiva === 'clinico' ? 'active' : ''}" style="padding:8px 0;border-bottom:2px solid ${abaAtiva === 'clinico' ? 'var(--primary)' : 'transparent'};background:none;font-weight:600;font-size:13px;color:${abaAtiva === 'clinico' ? 'var(--primary)' : 'var(--text2)'};cursor:pointer">🩺 Clínico</button>
      <button onclick="abrirPerfilCC('${id}','anotacoes')" class="cc-tab ${abaAtiva === 'anotacoes' ? 'active' : ''}" style="padding:8px 0;border-bottom:2px solid ${abaAtiva === 'anotacoes' ? 'var(--primary)' : 'transparent'};background:none;font-weight:600;font-size:13px;color:${abaAtiva === 'anotacoes' ? 'var(--primary)' : 'var(--text2)'};cursor:pointer">📝 Anotações</button>
    </div>`;

    let corpoH = buildAbas();

    if (abaAtiva === 'resumo') {
        const isMasc = (p.sexo || '').toLowerCase() === 'masculino';
        const listaS = [
            ['⚖️ Peso', p.ultimoPeso ? (p.ultimoPeso + ' kg') : '-'],
            ['📏 Altura', p.ultimaAltura ? (p.ultimaAltura + ' cm') : '-'],
            ['🩺 PA', p.ultimaPA || '-'],
            ['🗓 Últ. Médico', p.diasUltMedico ? p.diasUltMedico + ' dias' : '-'],
            ['👩‍⚕️ Últ. Enferm.', p.diasUltEnfermagem ? p.diasUltEnfermagem + ' dias' : '-'],
            ['🏠 Últ. Visita', p.diasUltVisita ? p.diasUltVisita + ' dias' : 'Nunca'],
        ];

        if (!isMasc) {
            listaS.push(['🔬 PCCU', p.dataUltPCCU || '-']);
            listaS.push(['🎀 Mama', p.dataUltMama || '-']);
        }

        listaS.push(['🔴 HIV', p.dataUltHIV || '-']);
        listaS.push(['💊 Sífilis', p.dataUltSifilis || '-']);

        const secaoSaude = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          ${listaS.map(([k, v]) => `<div style="background:#F9FAFB;padding:8px 10px;border-radius:8px;font-size:12px"><span style="color:var(--text2)">${k}</span><br><strong>${v}</strong></div>`).join('')}
        </div>`;

        // Lógica de Elegibilidade para Esterilização (Exibição simplificada no modal)
        let btnEst = '';
        const hoje_est = new Date();
        const nasc_est = new Date(p.nasc);
        let idade_est = hoje_est.getFullYear() - nasc_est.getFullYear();
        if (hoje_est.getMonth() < nasc_est.getMonth() || (hoje_est.getMonth() === nasc_est.getMonth() && hoje_est.getDate() < nasc_est.getDate())) idade_est--;
const filhos_est = parseInt(p.numFilhos) || 0;
        const elegivel_est = idade_est >= 21 || (idade_est >= 18 && filhos_est >= 2);
        const isGestante = p.tags?.includes('Gestante');
        
        if (isMasc && elegivel_est) {
            btnEst = `<button class="btn btn-sm" style="background:#EA580C;color:#fff;grid-column: span 2" onclick="preencherFormulario('vasectomia','${p.id}')">✂️ Gerar Passaporte Vasectomia</button>`;
        } else if (!isMasc && elegivel_est) {
            // Se é gestante → Laqueadura no Parto, senão → Eletiva
            const tipoLaq = isGestante ? 'laqueadura_parto' : 'laqueadura';
            btnEst = `<button class="btn btn-sm" style="background:#EA580C;color:#fff;grid-column: span 2" onclick="preencherFormulario('${tipoLaq}','${p.id}')">✂️ Gerar Passaporte ${isGestante ? 'Laqueadura no Parto' : 'Laqueadura Eletiva'}</button>`;
        }

        corpoH += `
        <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:20px;font-weight:700;margin-bottom:4px">${p.nome}</div>
          <div style="font-size:12px;opacity:.9">
            ${p.idade !== null ? p.idade + ' anos · ' : ''} ${p.sexo || ''} · Nasc: ${p.nasc ? new Date(p.nasc + 'T12:00').toLocaleDateString('pt-BR') : '—'}<br>
            CNS: ${p.cns || '—'} · CPF: ${p.cpf || '—'}<br>
            📞 ${tel} · Microárea ${p.microArea || '?'}<br>
            📍 ${end || '—'}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${tagHtml}</div>
        <h4 style="font-size:13px;margin-bottom:4px">Indicadores de Saúde (CSV)</h4>
        ${secaoSaude}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px">
          ${isMasc ? `
            <button class="btn btn-sm btn-secondary" style="grid-column: span 2" onclick="preencherFormulario('ists','${p.id}')">💊 ISTs / Testagem Rápida</button>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="preencherFormulario('prenatal','${p.id}')">🤰 Pré-Natal</button>
            <button class="btn btn-sm" style="background:var(--mulher,#EC4899);color:#fff" onclick="preencherFormulario('pccu','${p.id}')">🔬 PCCU</button>
            <button class="btn btn-sm btn-secondary" onclick="preencherFormulario('mif','${p.id}')">👩 MIF</button>
            <button class="btn btn-sm btn-secondary" onclick="preencherFormulario('ists','${p.id}')">💊 ISTs</button>
          `}
          ${btnEst}
        </div>
        <div style="margin-top:12px">
          <a href="perfil_paciente.html?id=${p.id}" target="_blank" class="btn btn-outline btn-sm" style="width:100%; border-color:var(--primary); color:var(--primary); text-decoration:none; justify-content:center">✏️ Editar Cadastro em Tela Cheia</a>
        </div>`;
    } else if (abaAtiva === 'clinico') {
        corpoH += `
        <div class="form-grid" style="display:grid;gap:15px">
            <div class="form-group">
                <label style="font-size:12px;font-weight:700;color:var(--text2)">💊 Medicamentos em Uso</label>
                <textarea id="cc-edit-meds" class="form-control" style="width:100%;min-height:80px;padding:10px;border:1px solid var(--border);border-radius:8px" placeholder="Liste medicamentos, doses e horários...">${p.medicamentos || ''}</textarea>
            </div>
            <div class="form-group">
                <label style="font-size:12px;font-weight:700;color:var(--text2)">🏥 Condições de Saúde / Patologias</label>
                <textarea id="cc-edit-cond" class="form-control" style="width:100%;min-height:60px;padding:10px;border:1px solid var(--border);border-radius:8px" placeholder="Ex: HAS, DM2, Asma, Alergia a Penicilina...">${p.condicoesClinicas || ''}</textarea>
            </div>
            <div class="form-group">
                <label style="font-size:12px;font-weight:700;color:var(--text2)">📝 Exames Pendentes / Solicitados</label>
                <input id="cc-edit-exames" type="text" class="form-control" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px" value="${p.examesPendentes || ''}" placeholder="Ex: Glicemia, Hemograma, ECG...">
            </div>
            <button class="btn btn-primary" onclick="salvarClinicoCC('${p.id}')">💾 Salvar Histórico Clínico</button>
        </div>`;
    } else if (abaAtiva === 'anotacoes') {
        corpoH += `
        <div class="form-group">
            <label style="font-size:12px;font-weight:700;color:var(--text2)">📌 Lembretes e Observações de Visita</label>
            <textarea id="cc-edit-obs" class="form-control" style="width:100%;min-height:200px;padding:12px;border:1px solid var(--border);border-radius:8px;font-family:inherit" placeholder="Escreva observações importantes sobre o acompanhamento domiciliar...">${p.anotacoes || ''}</textarea>
            <div style="margin-top:10px;display:flex;justify-content:flex-end">
                <button class="btn btn-primary" onclick="salvarCampoCC('${p.id}', 'anotacoes', 'cc-edit-obs')">💾 Salvar Anotações</button>
            </div>
        </div>`;
    }

    document.getElementById('cc-modal-body').innerHTML = corpoH;
    document.getElementById('cc-modal').classList.add('open');
}

function salvarClinicoCC(id) {
    const meds = document.getElementById('cc-edit-meds').value;
    const cond = document.getElementById('cc-edit-cond').value;
    const exames = document.getElementById('cc-edit-exames').value;

    CC.salvarCampo(id, 'medicamentos', meds);
    CC.salvarCampo(id, 'condicoesClinicas', cond);
    CC.salvarCampo(id, 'examesPendentes', exames);

    if (typeof toast === 'function') toast('Dados clínicos salvos!', 'success');
}

function salvarCampoCC(id, campo, idInput) {
    const val = document.getElementById(idInput).value;
    if (CC.salvarCampo(id, campo, val)) {
        if (typeof toast === 'function') toast('Salvo com sucesso!', 'success');
    }
}

// ── SELETOR UNIVERSAL DE PACIENTE ────────────────────────────────
// Uso: <input id="meu-input" oninput="ccBuscarPaciente(this,'div-resultados',onSelect)">
// onSelect(pessoa) é chamado quando o usuário escolhe

function ccBuscarPaciente(input, divResultsId, onSelect) {
    const q = input.value.trim().toLowerCase();
    const div = document.getElementById(divResultsId);
    if (!div) return;
    if (q.length < 2) { div.innerHTML = ''; div.style.display = 'none'; return; }
    const ps = CC.get();
    const matches = ps.filter(p => p.nome.toLowerCase().includes(q) || p.cns.includes(q) || (p.cpf || '').includes(q)).slice(0, 8);
    if (matches.length === 0) { div.innerHTML = '<div style="padding:8px;font-size:13px;color:var(--text2)">Nenhuma pessoa encontrada</div>'; div.style.display = 'block'; return; }
    div.innerHTML = matches.map(p => `
    <div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px"
         onmousedown="ccSelecionarPaciente('${p.id}','${input.id}','${divResultsId}',arguments[0])">
      <strong>${p.nome}</strong><br>
      <span style="color:var(--text2)">${p.idade !== null ? p.idade + ' anos · ' : ''}CNS: ${p.cns || '—'} · ${p.microArea ? 'Área ' + p.microArea : ''}</span>
    </div>`).join('');
    div.style.cssText = 'display:block;position:absolute;z-index:500;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);width:100%;max-height:280px;overflow-y:auto;margin-top:2px';
}

function ccSelecionarPaciente(id, inputId, divId, e) {
    if (e) e.preventDefault();
    const p = CC.get().find(x => x.id === id); if (!p) return;
    const input = document.getElementById(inputId);
    const div = document.getElementById(divId);

    // Pesquisa Global Sidebar: Abre o Perfil
    if (inputId === 'sb-global-search') {
        if (input) input.value = '';
        if (div) { div.innerHTML = ''; div.style.display = 'none'; }
        abrirPerfilCC(id);
        return;
    }

    if (input) input.value = p.nome;
    if (div) { div.innerHTML = ''; div.style.display = 'none'; }
    if (typeof window._ccSelectCallback === 'function') window._ccSelectCallback(p);
    preencherCamposComPessoa(p);
}

// Preenche automaticamente campos do formulário ativo com dados da pessoa
function preencherCamposComPessoa(p) {
    const map = {
        // Cadastro MIF (index.html)
        'mif-nome': p.nome,
        'mif-nasc': p.nasc,
        'mif-cns': p.cns,
        'mif-cpf': p.cpf,
        'mif-tel': p.telCelular || p.telResidencial,
        'mif-end': [p.rua, p.numero].filter(Boolean).join(', '),
        'mif-micro': p.microArea ? `Microárea ${p.microArea}` : '',

        // Pré-Natal (Prenatal_ESF26.html)
        'gestanteNomeInput': p.nome,
        'gestanteDataNasc': p.nasc,
        'gestanteCNS': p.cns,

        // PCCU / IST e outros campos genéricos
        's-pccu': p.nome,
        's-ist': p.nome,
        'pccu-nome': p.nome,
        'pccu-cns': p.cns,
        'pccu-nasc': p.nasc,
        'ist-nome': p.nome,
        'ist-cns': p.cns,
        'inputNome': p.nome,
        'inputCNS': p.cns,
        'inputNasc': p.nasc,
        'inputCPF': p.cpf,
        'inputTel': p.telCelular || p.telResidencial,
        'inputEndereco': [p.rua, p.numero].filter(Boolean).join(', '),
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
    });
    
    // Atualiza listas filtradas caso os itens existam na página ativa
    if (typeof renderPCCU === 'function') renderPCCU();
    if (typeof renderIST === 'function') renderIST();

    // Salvar pessoa selecionada no sessionStorage para uso pelos formulários
    sessionStorage.setItem('cc_pessoa_selecionada', JSON.stringify(p));
}

// Navega para o módulo e pre-seleciona a pessoa
function preencherFormulario(modulo, pessoaId) {
    const p = CC.get().find(x => x.id === pessoaId); if (!p) return;
    sessionStorage.setItem('cc_pessoa_selecionada', JSON.stringify(p));
    fecharModal('cc-modal');

    const destinos = {
        'prenatal': () => { window.open('Prenatal_ESF26.html', '_blank'); },
        'pccu': () => { if (typeof navTo === 'function') navTo('pccu'); setTimeout(() => preencherCamposComPessoa(p), 400); },
        'mif': () => { if (typeof navTo === 'function') navTo('mif'); setTimeout(() => preencherCamposComPessoa(p), 400); },
        'ists': () => { if (typeof navTo === 'function') navTo('ists'); setTimeout(() => preencherCamposComPessoa(p), 400); },
        'vasectomia': () => {
            const d = { nome: p.nome, cns: p.cns, nasc: p.nasc, cpf: p.cpf, end: [p.rua, p.numero].filter(Boolean).join(', '), bairro: p.bairro, tel: p.telCelular || p.telResidencial, mae: p.nomeMae, numFilhos: p.numFilhos };
            localStorage.setItem('dadosEsterilizacao', JSON.stringify(d));
            window.open('Passaporte_Vasectomia.html', '_blank');
        },
        'laqueadura': () => {
            // Laqueadura Eletiva (não gestante)
            const d = { nome: p.nome, cns: p.cns, nasc: p.nasc, cpf: p.cpf, end: [p.rua, p.numero].filter(Boolean).join(', '), bairro: p.bairro, tel: p.telCelular || p.telResidencial, mae: p.nomeMae, numFilhos: p.numFilhos };
            localStorage.setItem('dadosEsterilizacao', JSON.stringify(d));
            window.open('Passaporte_Laqueadura.html', '_blank');
        },
        'laqueadura_parto': () => {
            // Laqueadura no Parto (gestante)
            const d = { nome: p.nome, cns: p.cns, nasc: p.nasc, cpf: p.cpf, end: [p.rua, p.numero].filter(Boolean).join(', '), bairro: p.bairro, tel: p.telCelular || p.telResidencial, mae: p.nomeMae, numFilhos: p.numFilhos };
            localStorage.setItem('dadosEsterilizacao', JSON.stringify(d));
            window.open('Passaporte_Laqueadura_Parto.html', '_blank');
        }
    };
    if (destinos[modulo]) destinos[modulo]();
    else if (typeof toast === 'function') toast('Módulo não disponível nesta tela', 'warning');
}

// ── BUSCA ATIVA ───────────────────────────────────────────────────
function renderBuscaAtiva(filtro) {
    const ps = CC.get();
    let lista = [];
    const titulo = {
        'pccu-pend': { label: '🔬 PCCU Pendente (>3 anos sem coleta)', tag: 'PCCU Pendente' },
        'pa-elev': { label: '🩺 PA Elevada na última medição', tag: 'PA Elevada' },
        'sem-visita': { label: '🏠 Sem visita domiciliar há >6 meses', tag: 'S/visita >6m' },
        'jamais': { label: '🏠 Nunca receberam visita domiciliar', tag: 'Jamais visitado' },
        'hiv-sem': { label: '🔴 Sem avaliação de HIV', tag: 'HIV s/avaliação' },
        'sif-sem': { label: '💊 Sem avaliação de Sífilis', tag: 'Sífilis s/avaliação' },
        'mama-pend': { label: '🎀 Rastreamento de Mama Pendente', tag: 'Mama Pendente' },
        'adolescente': { label: '👩‍🦱 Adolescentes (10-17 anos)', tag: 'Adolescente' },
        'obeso': { label: '⚖️ Obesos', tag: 'Obesidade' },
        'bolsa': { label: '💚 Beneficiários do Bolsa Família', tag: 'Bolsa Família' },
    }[filtro];

    if (!titulo) { document.getElementById('cc-ba-resultado').innerHTML = ''; return; }
    lista = ps.filter(p => p.tags?.includes(titulo.tag));

    const el = document.getElementById('cc-ba-resultado');
    if (!el) return;
    if (lista.length === 0) { el.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text2)">✅ Nenhuma pessoa nesta condição</div>`; return; }

    el.innerHTML = `
    <div style="padding:10px 0;font-weight:700;color:var(--primary)">${titulo.label} — ${lista.length} pessoa(s)</div>
    <div class="table-container"><table>
      <thead><tr><th>Nome</th><th>Microárea</th><th>Telefone</th><th>Ação</th></tr></thead>
      <tbody>${lista.map(p => `<tr>
        <td><strong>${p.nome}</strong><br><span style="font-size:11px;color:var(--text2)">${p.idade !== null ? p.idade + ' anos · ' : ''}${p.sexo || ''}</span></td>
        <td>${p.microArea || '—'}</td>
        <td>${p.telCelular ? p.telCelular.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : p.telResidencial || '—'}</td>
        <td><button class="btn btn-sm btn-primary" onclick="abrirPerfilCC('${p.id}')">Perfil</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function exportarBuscaAtiva() {
    const el = document.getElementById('cc-ba-resultado');
    if (!el || el.innerHTML === '') { toast('Selecione um filtro primeiro', 'warning'); return; }
    if (typeof window.jspdf === 'undefined') { toast('jsPDF não carregado', 'danger'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(139, 92, 246);
    pdf.rect(0, 0, w, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
    pdf.text('ESF 26 - Busca Ativa — Carisma Manager', 14, 14);
    pdf.setTextColor(0, 0, 0);
    // Usar html2canvas em fallback simples
    html2canvas(el, { scale: 2 }).then(canvas => {
        const ww = pdf.internal.pageSize.getWidth() - 28;
        const hh = (canvas.height * ww) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 14, 28, ww, hh);
        pdf.save('busca_ativa.pdf');
        toast('PDF exportado!');
    });
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    atualizarCCStats();
    // Verificar se há pessoa pré-selecionada no sessionStorage (vinda de outro módulo)
    const psel = sessionStorage.getItem('cc_pessoa_selecionada');
    if (psel) {
        try { const p = JSON.parse(psel); preencherCamposComPessoa(p); } catch (e) { }
    }
});

// Helper texto
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

console.log('[cadastro_central.js] Módulo Cadastro Central ESF 26 carregado ✓');
