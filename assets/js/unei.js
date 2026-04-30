/**
 * UNEI - Unidade de Internação
 * Lógica de negócio separada para o módulo UNEI
 * Integração com PULSE - Calendário Vacinal PNI 2024
 */

const UNEI = (() => {
  const STORAGE_KEY = 'carisma_unei_adolescentes';
  const PESSOAS_KEY = 'carisma_pessoas';
  const SESSION_KEY = 'unei_session';

  // Calendário Vacinal PNI 2024 completo
  const CALENDARIO_VACINAL = [
    { id: 'bcg', nome: 'BCG', doses: ['Dose única'], idadeMin: 0, idadeMax: 0, grupo: 'Básicas' },
    { id: 'hepb', nome: 'Hepatite B', doses: ['1ª dose', '2ª dose', '3ª dose'], idadeMin: 0, idadeMax: 0, intervalo: 30, grupo: 'Básicas' },
    { id: 'dtp', nome: 'Pentavalente/DTP', doses: ['1ª dose', '2ª dose', '3ª dose'], idadeMin: 2, idadeMax: 6, reforcos: [{ nome: '1º reforço', idade: 15 }, { nome: '2º reforço', idade: 48 }], grupo: 'Básicas' },
    { id: 'polio', nome: 'Poliomielite', doses: ['1ª dose (VIP)', '2ª dose (VIP)'], idadeMin: 2, idadeMax: 6, reforcos: [{ nome: '1º reforço (VOPb)', idade: 6 }, { nome: '2º reforço (VOPb)', idade: 15 }], grupo: 'Básicas' },
    { id: 'pneumo', nome: 'Pneumocócica 10v', doses: ['1ª dose', '2ª dose'], idadeMin: 2, idadeMax: 6, reforcos: [{ nome: 'Reforço', idade: 12 }], grupo: 'Básicas' },
    { id: 'menc', nome: 'Meningocócica C', doses: ['1ª dose', '2ª dose'], idadeMin: 3, idadeMax: 5, reforcos: [{ nome: 'Reforço', idade: 12 }], grupo: 'Básicas' },
    { id: 'rota', nome: 'Rotavírus', doses: ['1ª dose', '2ª dose'], idadeMin: 2, idadeMax: 6, grupo: 'Básicas' },
    { id: 'fa', nome: 'Febre Amarela', doses: ['Dose única'], idadeMin: 9, idadeMax: 12, reforcos: [{ nome: 'Reforço', idade: 48 }], grupo: 'Adolescente' },
    { id: 'scr', nome: 'SCR - Tríplice Viral', doses: ['1ª dose', '2ª dose'], idadeMin: 12, idadeMax: 15, grupo: 'Adolescente' },
    { id: 'varicel', nome: 'Varicela', doses: ['1ª dose', '2ª dose'], idadeMin: 15, idadeMax: 24, grupo: 'Adolescente' },
    { id: 'hepa', nome: 'Hepatite A', doses: ['Dose única'], idadeMin: 12, idadeMax: 18, grupo: 'Adolescente' },
    { id: 'hpv', nome: 'HPV Quadrivalente', doses: ['1ª dose', '2ª dose'], idadeMin: 132, idadeMax: 192, doses15plus: 3, grupo: 'Prioritárias' },
    { id: 'menacwy', nome: 'Meningocócica ACWY', doses: ['Dose única'], idadeMin: 132, idadeMax: 156, reforcos: [{ nome: 'Reforço', idade: 180 }], grupo: 'Prioritárias' },
    { id: 'dtpa', nome: 'dTpa', doses: ['Dose única'], idadeMin: 132, idadeMax: 999, reforcoAnual: false, grupo: 'Prioritárias' },
    { id: 'influenza', nome: 'Influenza', doses: ['Anual'], idadeMin: 6, idadeMax: 999, reforcoAnual: true, grupo: 'Prioritárias' },
    { id: 'dt', nome: 'dT (Dupla Adulto)', doses: ['Reforço'], idadeMin: 132, idadeMax: 999, grupo: 'Prioritárias' }
  ];

  // Utilitários
  const getAdolescentes = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const setAdolescentes = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const getPessoas = () => JSON.parse(localStorage.getItem(PESSOAS_KEY) || '[]');
  const setPessoas = (data) => localStorage.setItem(PESSOAS_KEY, JSON.stringify(data));

  const calcularIdade = (dataNasc) => {
    if (!dataNasc) return null;
    const hoje = new Date();
    const nasc = new Date(dataNasc + 'T12:00');
    let anos = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
    return anos;
  };

  const calcularMeses = (dataNasc) => {
    if (!dataNasc) return 0;
    const hoje = new Date();
    const nasc = new Date(dataNasc + 'T12:00');
    return (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  };

  // Sincronização com banco geral
  const sincronizarComPessoas = (adol) => {
    const pessoas = getPessoas();
    let p = pessoas.find(x =>
      (adol.cns && x.cns === adol.cns) ||
      (adol.cpf && x.cpf === adol.cpf) ||
      x.uneiId === adol.id
    );

    if (p) {
      if (!p.tags) p.tags = [];
      if (!p.tags.includes('UNEI')) p.tags.push('UNEI');
      p.uneiId = adol.id;
      p.nome = adol.nome;
    } else {
      pessoas.push({
        id: 'p_unei_' + adol.id,
        uneiId: adol.id,
        nome: adol.nome,
        nasc: adol.dataNasc || adol.nasc,
        sexo: adol.sexo,
        cns: adol.cns || '',
        cpf: adol.cpf || '',
        tags: ['UNEI'],
        dataCadastro: new Date().toISOString()
      });
    }
    setPessoas(pessoas);
  };

  // Cálculo de alertas vacinais
  const calcularAlertas = (adol) => {
    const meses = calcularMeses(adol.dataNasc || adol.nasc);
    const vacinasRegistradas = adol.vacinas || {};
    const vacinasAtrasadas = [];

    CALENDARIO_VACINAL.forEach(vac => {
      const idadeMesesMin = vac.idadeMin * 1; // Converter para meses se necessário
      const idadeMesesMax = vac.idadeMax * 12;

      if (meses >= idadeMesesMin) {
        // Verificar doses principais
        vac.doses.forEach((dose, idx) => {
          const doseKey = 'dose_' + idx;
          const reg = vacinasRegistradas[vac.id]?.[doseKey];
          if (!reg || reg.status !== 'registrada') {
            // Verificar se está atrasada (idade >= idade mínima + margem)
            if (vac.idadeMin <= calcularIdade(adol.dataNasc || adol.nasc)) {
              vacinasAtrasadas.push({ nome: vac.nome, dose: dose, vacId: vac.id });
            }
          }
        });

        // Verificar reforços
        if (vac.reforcos) {
          vac.reforcos.forEach(ref => {
            if (meses >= ref.idade * 1) {
              const refKey = 'reforco_' + ref.nome.replace(/\s/g, '');
              const reg = vacinasRegistradas[vac.id]?.[refKey];
              if (!reg || reg.status !== 'registrada') {
                vacinasAtrasadas.push({ nome: vac.nome, dose: ref.nome, vacId: vac.id });
              }
            }
          });
        }
      }
    });

    return {
      vacinasAtrasadas,
      total: vacinasAtrasadas.length
    };
  };

  // Estatísticas para dashboard
  const getEstatisticas = () => {
    const lista = getAdolescentes().filter(a => a.ativo !== false);
    let vacinados = 0, atraso = 0, reagentes = 0;

    lista.forEach(adol => {
      const alertas = calcularAlertas(adol);
      if (alertas.total === 0) vacinados++;
      else atraso++;

      const testes = adol.testesRapidos || adol.testes || [];
      if (testes.some(t => t.resultado === 'Reagente')) reagentes++;
    });

    return {
      total: lista.length,
      vacinados,
      atraso,
      reagentes
    };
  };

  // Login
  const doLogin = (user, pass) => {
    if (!user || !pass) return { success: false, message: 'Preencha todos os campos' };
    const session = { user, name: 'Prof. ' + user, time: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, session };
  };

  const doLogout = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  const checkSession = () => {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  };

  // API pública
  return {
    CALENDARIO_VACINAL,
    getAdolescentes,
    setAdolescentes,
    calcularIdade,
    calcularMeses,
    sincronizarComPessoas,
    calcularAlertas,
    getEstatisticas,
    doLogin,
    doLogout,
    checkSession,
    STORAGE_KEY,
    PESSOAS_KEY
  };
})();

// Exportar para uso global
if (typeof window !== 'undefined') window.UNEI = UNEI;
