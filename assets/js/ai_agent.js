// AI Agent Integration for Carisma Manager
// Manages Gemini API integration and UI configuration

window.AIManager = {
    apiKey: localStorage.getItem('carisma_gemini_api_key') || '',
    models: ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest', 'gemini-pro'],

    setApiKey: function(key) {
        this.apiKey = key.trim();
        localStorage.setItem('carisma_gemini_api_key', this.apiKey);
        if (this.apiKey) {
            alert('Chave de API salva com sucesso! O assistente de IA está pronto para uso.');
        } else {
            alert('Chave de API removida.');
        }
    },

    predictStructured: async function(text, schema, retryCount = 0) {
        if (!this.apiKey) {
            throw new Error("O Assistente IA não está ativado. Insira sua chave (botão ✨).");
        }

        // Auto-Discovery: Procura no servidor do Google qual o nome exato do modelo disponível para essa chave
        if (!this.validModelCache) {
            try {
                const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
                const res = await fetch(listUrl);
                if (res.ok) {
                    const data = await res.json();
                    const models = data.models || [];
                    const valid = models.find(m => m.supportedGenerationMethods?.includes("generateContent") && (m.name.includes("gemini-1.5") || m.name.includes("gemini-1") || m.name.includes("gemini")));
                    if (valid) {
                        this.validModelCache = valid.name.replace('models/', '');
                    }
                }
            } catch (e) {
                console.warn("Auto-discovery failed:", e);
            }
        }

        const modelsToTry = this.validModelCache ? [this.validModelCache] : this.models;

        const prompt = `${schema}\n\nTexto/Observações do Paciente:\n${text}`;
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        let lastError = null;

        for (const modelName of modelsToTry) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errMsg = errorData.error?.message ? errorData.error.message : JSON.stringify(errorData);
                    
                    if (response.status === 400 && errMsg.includes("API key not valid")) {
                        throw new Error("Chave de API inválida ou incorreta."); // Aborta instantaneamente se for a chave
                    }
                    
                    if (response.status === 503) {
                        // Erro temporário de demanda alta - tenta novamente após 3 segundos
                        if (retryCount < 2) {
                            await new Promise(r => setTimeout(r, 3000));
                            return this.predictStructured(text, schema, retryCount + 1);
                        }
                        lastError = "Servidor com demanda alta. Aguarde alguns minutos e tente novamente.";
                        continue;
                    }
                    
                    if (response.status === 404) {
                        lastError = `Modelo ${modelName} indisponível (404).`;
                        continue; // Tenta o próximo modelo
                    }
                    
                    throw new Error(`Status ${response.status}: ${errMsg || 'Erro desconhecido'}`);
                }

                const data = await response.json();
                
                if (data.candidates && data.candidates.length > 0) {
                    const generatedText = data.candidates[0].content.parts[0].text;
                    try {
                        let limpo = generatedText.replace(/```json/gi, '').replace(/```/g, '').trim();
                        return JSON.parse(limpo);
                    } catch (parseError) {
                        console.error("Texto gerado não era um JSON válido:", generatedText);
                        throw new Error("A IA não retornou no formato JSON esperado. Tente novamente.");
                    }
                } else {
                    throw new Error("A IA não retornou nenhuma resposta.");
                }
            } catch (error) {
                if (error.message.includes("inválida")) throw error; // Não insiste em caso de chave errada
                if (error.message.includes("demanda alta")) throw error; // Repassa erro de 503
                console.error(`Falha no modelo ${modelName}:`, error);
                lastError = error.message;
            }
        }
        
        // Se esgotou a lista e não deu certo
        throw new Error(`Todos os modelos falharam. Último erro: ${lastError}`);
    },

    // UI Configuration
    initUI: function() {
        // Verifica se o botão já existe para não duplicar
        if (document.getElementById('btn-config-ai')) return;

        // Cria o botão Flutuante de Configuração
        const btn = document.createElement('button');
        btn.id = 'btn-config-ai';
        btn.innerHTML = '⚙️ Chave IA';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: '#4B5563', // Cinza neutro, mais cara de configuração
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            padding: '10px 15px',
            fontSize: '13px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            zIndex: '9999',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
        });

        btn.onclick = () => {
            const currentKey = this.apiKey ? '********' + this.apiKey.slice(-4) : '';
            const msg = currentKey 
                ? `⚙️ CONFIGURAÇÃO DO ASSISTENTE IA\n\nSua chave atual termina em: ${currentKey}\n\nDeseja alterar? Para remover, deixe em branco.\n\nATENÇÃO: Este botão serve APENAS para colocar a chave. Para usar a IA, clique no botão "✨ Formatar SOAP (IA)" acima da caixa de observações do atendimento!`
                : `⚙️ CONFIGURAÇÃO DO ASSISTENTE IA\n\nO assistente requer uma chave da API do Google Gemini Studio para funcionar.\nCole sua chave (API Key) abaixo:\n\nATENÇÃO: Este botão serve APENAS para colocar a chave. Para usar a IA, clique no botão "✨ Formatar SOAP (IA)" acima da caixa de observações do atendimento!`;
            
            const newKey = prompt(msg, this.apiKey);
            
            // Se usuário clicou Cancelar, newKey será null
            if (newKey !== null && newKey !== this.apiKey) {
                this.setApiKey(newKey);
            }
        };

        // Adiciona um efeito de hover
        btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
        btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

        document.body.appendChild(btn);

        // Dispara timer diário para procurar avisos (a cada 1 minuto checa se já deu 12h)
        window.setInterval(() => { this.checkVarreduraAgendada(); }, 60000);
        // Renderiza avisos caso esteja no Dashboard
        setTimeout(() => this.renderAvisos(), 500);
    },

    checkVarreduraAgendada: function() {
        const lastRun = localStorage.getItem('carisma_ia_last_sweep');
        const now = Date.now();
        // 12 hours = 43200000 ms
        if (!lastRun || now - parseInt(lastRun) > 43200000) {
            this.runVarreduraIA(false);
        }
    },

    runVarreduraIA: async function(manual = false) {
        if (!this.apiKey) {
            if(manual) alert("Configure a Chave da IA primeiro clicando no botão de Engrenagem.");
            return;
        }

        const btn = document.getElementById('btn-force-ia-sweep');
        const statusEl = document.getElementById('ia-board-status');
        if (btn) { btn.innerHTML = '🕵️ Analisando...'; btn.disabled = true; }
        if (statusEl) statusEl.innerText = '🕵️ Varrendo dados e analisando com a IA...';

        try {
            // Coletando substrato para a IA analisar
            const atrasados = typeof calcAtrasados === 'function' ? calcAtrasados().slice(0, 10) : [];
            const pccuDB = (window.data?.db?.get('pccu') || []);
            const mifs = window.data?.db?.get('mif') || [];
            
            const ists = (window.data?.db?.get('ist') || []).filter(i => i.status === 'Em Tratamento' || i.status === 'Acompanhamento');
            
            // PCCU vencido ou pendente
            const hoje = new Date().toISOString().split('T')[0];
            const pccuVencidos = pccuDB.filter(p => {
                if (!p.proxColeta || p.status === 'Recebido') return false;
                return p.proxColeta < hoje;
            }).slice(0, 5);

            let datasetText = "=== PACIENTES COM CONTRACEPTIVO ATRASADO (URGENTE) ===\n";
            atrasados.forEach(p => datasetText += `NOME: ${p.nome} | CNS: ${p.cns||'N/A'} | Telefone: ${p.tel||p.telCelular||'N/A'} | Método: ${p.metodo} | Atraso: ${p.diasAtraso} dias\n`);
            
            datasetText += "\n=== EXAMES PCCU VENCIDOS/ATRASADOS ===\n";
            pccuVencidos.forEach(p => {
                const m = mifs.find(mif => mif.id === p.mulherId);
                datasetText += `NOME: ${p.nome||m?.nome||'N/A'} | CNS: ${p.cns||m?.cns||'N/A'} | Telefone: ${p.tel||m?.tel||'N/A'} | Última coleta: ${p.dataColeta} | Venceu em: ${p.proxColeta}\n`;
            });

            datasetText += "\n=== INFECÇÕES (IST) EM TRATAMENTO/ACOMPANHAMENTO ===\n";
            ists.slice(0, 5).forEach(i => {
                const m = mifs.find(mif => mif.id === i.mulherId);
                datasetText += `NOME: ${i.nome||m?.nome||'N/A'} | CNS: ${i.cns||m?.cns||'N/A'} | Telefone: ${i.tel||m?.tel||'N/A'} | Diagnóstico: ${i.diagnostico} | Data: ${i.dataDiag} | Status: ${i.status}\n`;
            });

            // Gestantes em acompanhamento - verificar consultas atrasadas
            const gest = window.data?.db?.get('gestantes') || [];
            const consultas = window.data?.db?.get('consultas_prenatal') || [];
            let gestAtrasadas = [];
            if (gest.length && consultas.length) {
                gest.forEach(g => {
                    const ultConsultas = consultas.filter(c => c.cns === g.cns).sort((a,b) => b.data.localeCompare(a.data));
                    if (ultConsultas.length > 0) {
                        const ultData = ultConsultas[0].data;
                        const diffDias = Math.floor((new Date(hoje) - new Date(ultData)) / (1000*60*60*24));
                        if (diffDias > 30) {
                            gestAtrasadas.push({ nome: g.nome, cns: g.cns, tel: g.tel, ultCons: ultData, dias: diffDias });
                        }
                    }
                });
            }
            
            datasetText += "\n=== GESTANTES COM CONSULTA ATRASADA (>30 dias) ===\n";
            gestAtrasadas.slice(0, 5).forEach(g => {
                datasetText += `NOME: ${g.nome} | CNS: ${g.cns} | Telefone: ${g.tel} | Última consulta: ${g.ultCons} | Dias sem acompanhamento: ${g.dias}\n`;
            });

            // Puericultura atrasada
            const criancas = window.data?.db?.get('puericultura') || [];
            let pueriAtrasadas = [];
            if (criancas.length) {
                criancas.forEach(c => {
                    if (c.proxConsulta && c.proxConsulta < hoje) {
                        pueriAtrasadas.push({ nome: c.nome, cns: c.cns, tel: c.telCelular, prox: c.proxConsulta, responsavel: c.responsavel });
                    }
                });
            }
            
            datasetText += "\n=== PUERICULTURA ATRASADA ===\n";
            pueriAtrasadas.slice(0, 5).forEach(p => {
                datasetText += `CRIANÇA: ${p.nome} | Responsável: ${p.responsavel} | Telefone: ${p.tel} | Consulta deveria ter sido em: ${p.prox}\n`;
            });

            const schema = `Gere até 6 "Post-its" (avisos essenciais) urgentes para o enfermeiro focar HOJE. \n\nREGRAS OBRIGATÓRIAS:\n1. Cada aviso DEVE conter o NOME COMPLETO de pelo menos 1 paciente específico que precisa de atenção\n2. Inclua o contato telefônico quando disponível\n3. Use cores: vermelho para muito urgente, laranja para urgente, amarelo para atenção\n\nRetorne EXATAMENTE um Array JSON com a seguinte estrutura:
[
  { "id": "uuid()", "title": "NOME DO PACIENTE + problema resumido", "task": "Ação necessária clara. Ex: 'Ligar para [telefone] e agendar retorno. Método: [método]'", "color": "red ou orange ou yellow" }
]`;

            const results = await this.predictStructured(datasetText, schema);
            
            if (Array.isArray(results)) {
                let existing = [];
                try { existing = JSON.parse(localStorage.getItem('carisma_avisos_ia') || '[]'); } catch(e){}
                
                results.forEach(r => r.id = window.data?.utils?.uuid() || (Date.now() + Math.random()).toString());
                
                const novosPendentes = results.length;
                let novoBoard = [...results, ...existing.filter(e => !e.done)].slice(0, 15);
                localStorage.setItem('carisma_avisos_ia', JSON.stringify(novoBoard));
                localStorage.setItem('carisma_ia_last_sweep', Date.now().toString());

                if (novosPendentes > 0) {
                    this.tocarAlerta();
                }
                this.renderAvisos();
            }
        } catch (e) {
            console.error("Erro na Varredura IA:", e);
            if(manual) alert("Falha na varredura do Assistente IA: " + e.message);
        } finally {
            if (btn) { btn.innerHTML = '🔄 Forçar Varredura Agora'; btn.disabled = false; }
            if (statusEl) {
                const last = new Date(parseInt(localStorage.getItem('carisma_ia_last_sweep') || Date.now())).toLocaleTimeString();
                statusEl.innerText = 'Última varredura: ' + last;
            }
        }
    },

    tocarAlerta: function() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
            
            setTimeout(() => {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(800, ctx.currentTime);
                gain2.gain.setValueAtTime(0.1, ctx.currentTime);
                osc2.start(ctx.currentTime);
                osc2.stop(ctx.currentTime + 0.2);
            }, 200);
        } catch(e) {}
    },

    concluirAviso: function(id) {
        let existing = [];
        try { existing = JSON.parse(localStorage.getItem('carisma_avisos_ia') || '[]'); } catch(e){}
        const item = existing.find(i => i.id == id);
        if(item) {
            item.done = true;
            localStorage.setItem('carisma_avisos_ia', JSON.stringify(existing));
            this.renderAvisos();
        }
    },

    renderAvisos: function() {
        const board = document.getElementById('dash-ia-board');
        const container = document.getElementById('ia-board-container');
        // Apenas recarrega se o dashboard estiver renderizado no HTML
        if (!board || !container) return;

        let existing = [];
        try { existing = JSON.parse(localStorage.getItem('carisma_avisos_ia') || '[]'); } catch(e){}
        const pendentes = existing.filter(e => !e.done);

        if (pendentes.length === 0) {
            container.innerHTML = '<div style="color:var(--text2); font-size:0.9rem; font-style:italic; padding: 10px;">Nenhum aviso pendente. ✨ IA de olho!</div>';
        } else {
            container.innerHTML = '';
            pendentes.forEach(aviso => {
                const wrap = document.createElement('div');
                const bg = aviso.color === 'red' ? '#FEE2E2' : aviso.color === 'yellow' ? '#FEF3C7' : aviso.color === 'orange' ? '#FFEDD5' : '#F3F4F6';
                const border = aviso.color === 'red' ? '#EF4444' : aviso.color === 'yellow' ? '#F59E0B' : aviso.color === 'orange' ? '#F97316' : '#9CA3AF';
                wrap.style.cssText = `min-width:250px; max-width:300px; padding:15px; border-radius:8px; background:${bg}; border-left: 4px solid ${border}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position:relative; flex-shrink: 0;`;
                
                wrap.innerHTML = `
                    <div style="font-weight:700; color:#1F2937; margin-bottom:5px; font-size:0.95rem;">${aviso.title}</div>
                    <div style="font-size:0.85rem; color:#4B5563; margin-bottom:10px; line-height:1.4;">${aviso.task}</div>
                    <button onclick="window.AIManager.concluirAviso('${aviso.id}')" style="background:#fff; border:1px solid #D1D5DB; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:600; color:#10B981">
                        ✅ Concluir
                    </button>
                `;
                container.appendChild(wrap);
            });
        }

        const statusEl = document.getElementById('ia-board-status');
        if (statusEl) {
            const lastData = localStorage.getItem('carisma_ia_last_sweep');
            if(lastData) {
                statusEl.innerText = 'Última busca: ' + new Date(parseInt(lastData)).toLocaleTimeString();
            }
        }
    }
};

// Inicializa a interface de configuração assim que a página carregar
window.addEventListener('DOMContentLoaded', () => {
    window.AIManager.initUI();
});
