# ESF 26 - Carisma Manager

Bem-vindo à documentação oficial estrutural do **ESF 26 - Carisma Manager**.
Este documento tem como objetivo registrar como a engenharia do projeto funciona, detalhar o banco de dados interno e servir como um **Guia de Sobrevivência (Troubleshooting)** caso enfrente dores de cabeça ou precise migrar dados para um computador novo na sua UBS.

---

## 🏛 Arquitetura do Sistema

O sistema é construído totalmente através de **"Client-Side Storage"** puro com **Vanilla JavaScript**. Isso significa que **não existe um servidor na nuvem (backend)** puxando os dados. Tudo que você digita fica a salvo e encriptado no armazenamento interno do seu Próprio Navegador (o *LocalStorage* ou "Memória Local").

### Módulos Principais (Arquivos Físicos)
- **`index.html`**: A espinha dorsal do sistema. É um SPA (Single Page Application). Abriga sua barra lateral de navegação e as "Páginas/Abas" centrais num layout de abas ocultáveis (Dashboard, Cadastro, Fila, Alertas).
- **`SAÚDE DA MULHER.html`**: O braço de laboratório/pdf. É uma página separada feita primeiramente para formatar guias e imprimir papéis do Preventivo. Atualmente ela se cruza diretamente com o aplicativo principal.
- **`assets/js/app.js`**: Os "músculos" do aplicativo. Gerencia renderização das tabelas (PCCU, IST, Contraceptivo), controles de botões, e controle das lógicas de alerta, idade e dias de atraso.
- **`assets/js/cadastro_central.js`**: A central de inteligência da edição de pacientes. Controla buscas complexas, duplicações e atua preenchendo todos os dados na aba de Perfil Geral de Pacientes.
- **`assets/js/modules/data.js`**: A barreira blindada dos seus dados (Camada DAL). Tudo o que salva, apaga, importa e faz o backup passa por aqui. Define o que é exportado pra pendrive.

---

## 🗄 Bancos de Dados Atuais (Chaves LocalStorage)

Para os backups funcionarem com maestria, eles copiam chaves com prefixo fixo. Caso um dia precise abrir o Console (F12) e analisar manualmente o banco, esses são os diretórios "virtuais" rodando no seu navegador:

| Chave de Registro | Finalidade no Sistema |
| --- | --- |
| `carisma_pessoas` | É a principal de todas (antigamente chamada `carisma_mif_v4`). Contém os nomes, CPFs, datas e tudo que é do Cadastro Central. |
| `carisma_pccu_v4` | Guarda especificamente os calendários de Preventivos das Mulheres da Unidade. |
| `carisma_ist_v4` | Registros dos acompanhamentos de infecções rastreadas em sigilo. |
| `carisma_contracep_v4`| Gerencia laqueaduras, DIU e controle de Pílulas. |
| `carisma_soap_history`| Prontuários (Anotações SOAP). Relatórios gerados em histórico linear para cada paciente. |
| `examesCitopatologicos`| Chave estrita da aba `SAÚDE DA MULHER.html`. Preenchida automática e simultaneamente via integração do `app.js` quando se salva coletas. |

---

## 🔁 Fluxos de Automação (Mágicas de Integração)

1. **Auto-Busca Inteligente Modal:** Ao escrever um nome parcial e clicar em "Nova Coleta", a lista suspensa já abrirá bloqueada ("pinada") na mulher digitada.
2. **Integração de Fichas (Cadastro -> Laboratório):**
   - No perfil da Paciente, apertar `PCCU Pendente` insere o dado da sessão dela (`cc_pessoa_selecionada` via `sessionStorage`).
   - Salvar no botão de Coleta do PCCU repassa imediatamente o clone do dado cruzado ("Exame", "Idade", "CNS mascarado") para a listagem da Impressão em `SAÚDE DA MULHER.html`.
3. **Escrita Simultânea SOAP:** Salvar exames reflete uma injeção de evento no seu histórico clínico automático da mulher, para documentação retroativa.

---

## 🚨 Guia Anti-Problema & Rotinas Válidas

### O Dashboard amanheceu todo zerado! 🤯
* **O que houve:** Quase sempre isso é um Erro de Sintaxe fatal injetado em arquivos `.js`. Quando o navegador tenta calcular "Quantas pessoas" e se depara com um nome de variável incorreto, o arquivo `app.js` crascha sozinho e desliga tudo o que vem depois na programação visual.
* **Solução:** Acessar o "Console" do Navegador apertando `Crtl+Shift+J` (F12) na tela que quebra. Ele apontará de forma vermelha exatamente a "linha" que derrubou os números.

### Precisam Formatar meu PC na UBS amanhã. O que eu levo?
Você só precisa de **DUAS** coisas num pendrive pra sua vida inteira estar salva:
1. Um **Backup de Arquivos do Programa**: Copie a pasta inteira onde se encontra os arquivos `.js` e `.html` para ter acesso offline do painel visual amanhã no PC novo.
2. Um **Backup de Banco de Dados**: APLICATIVOS DE JAVASCRIPT **GUARDAM INFORMAÇÕES DENTRO DO GOOGLE CHROME/EDGE**, E NÃO NA PASTA! Use a função do botão `"Exportar Backup"` do seu menu visual. Isso te cuspirá um arquivo gigante no formato JSON/Carisma. No novo PC, ao abrir o index lá do passo 1, você aperta `"Importar Backup"` e manda ele ler esse arquivo JSON. Simples assim.

### O Arquivo falhou na Importação manual / Conflitrou "Carisma_MIF" com v4.
Criamos um funil legatório em `data.js`. Ele repara dados antigos no momento da carga. Caso algo bizarro aconteça (Ex: Pessoas Sumiram), use o console (`F12`), vá até a aba "Application" e observe à esquerda "Local Storage". Tudo pode ser manipulado lá puramente à mão se preferir.