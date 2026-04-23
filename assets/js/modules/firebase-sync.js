// Firebase Sync Module for ESF 26 Carisma Manager
// Gerencia sincronização com Firestore

(function() {
  window.FirebaseSync = {
    db: null,
    auth: null,
    isOnline: false,
    lastSync: null,
    pendingChanges: [],

    init: async function() {
      const debugStatus = document.getElementById('sync-debug-status');
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      if (!window.firebaseConfig || window.firebaseConfig.apiKey === "SUA_API_KEY_AQUI") {
        log("❌ Firebase não configurado!");
        this.isOnline = false;
        return;
      }

      try {
        log("📥 Carregando Firebase SDK...");
        
        // Importar Firebase SDK via CDN (versão compat que cria objeto firebase global)
        if (!window.firebase || !window.firebase.initializeApp) {
          await this.loadFirebaseSDK();
        }
        
        if (!window.firebase || !window.firebase.initializeApp) {
          log("❌ Firebase SDK não carregou!");
          return;
        }
        
        log("🔥 Inicializando Firebase...");
        console.log("Config:", window.firebaseConfig);
        
        // Inicializar Firebase
        firebase.initializeApp(window.firebaseConfig);
        this.db = firebase.firestore();
        
        // Verifica se auth está disponível
        if (firebase.auth) {
          this.auth = firebase.auth();
        }

        this.isOnline = true;
        log("✅ Firebase conectado! isOnline=true");
        
        // Verificar autenticação se disponível
        if (this.auth && this.auth.onAuthStateChanged) {
          this.auth.onAuthStateChanged(user => {
            if (user) {
              log("👤 Usuário: " + (user.email || user.uid));
            } else {
              log("👤 Modo anónimo");
            }
          });
        } else {
          log("👤 Auth não disponível");
        }

      } catch (e) {
        log("❌ ERRO: " + e.message);
        console.error("Firebase erro:", e);
        this.isOnline = false;
      }
    },

    loadFirebaseSDK: function() {
      return new Promise((resolve, reject) => {
        if (window.firebase && window.firebase.initializeApp) { 
          console.log("Firebase SDK já carregado");
          resolve(); 
          return;
        }
        
        console.log("Carregando Firebase SDK v10.8.0...");
        
        // Carrega Firebase App (versão compat)
        const script1 = document.createElement('script');
        script1.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js';
        script1.onload = () => {
          console.log("Firebase App carregado, carregando módulos...");
          
          // Carrega Auth
          const script2 = document.createElement('script');
          script2.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js';
          script2.onload = () => {
            console.log("Auth carregado, carregando Firestore...");
            
            // Carrega Firestore
            const script3 = document.createElement('script');
            script3.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js';
            script3.onload = () => {
              console.log("Todos os módulos Firebase carregados!");
              resolve();
            };
            script3.onerror = (e) => reject(e);
            document.head.appendChild(script3);
          };
          script2.onerror = (e) => reject(e);
          document.head.appendChild(script2);
        };
        script1.onerror = (e) => reject(e);
        document.head.appendChild(script1);
      });
    },

    // Sincronizar dados locais para Firebase (dividido em partes)
    syncToCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncToCloud: Não conectado");
        return;
      }
      
      // Evita loop de sincronização
      if (window._syncEmProgresso) {
        console.log("⏭️ Sync já em andamento, pulando...");
        return;
      }
      window._syncEmProgresso = true;
      
      const debugStatus = document.getElementById('sync-debug-status');
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      try {
        const collectionName = 'dados_publicos';
        
        // Pega dados do LocalStorage
        const mif = window.data.db.get('mif') || [];
        const contracep = window.data.db.get('contracep') || [];
        const pccu = window.data.db.get('pccu') || [];
        const ist = window.data.db.get('ist') || [];
        
        log(`📤 Enviando dados separados...`);
        
        const promises = [];
        
        // Divide mif em chunks de 500 para ficar abaixo de 1MB
        const CHUNK_SIZE = 500;
        const totalChunks = Math.ceil(mif.length / CHUNK_SIZE);
        
        for (let i = 0; i < mif.length; i += CHUNK_SIZE) {
          const chunk = mif.slice(i, i + CHUNK_SIZE);
          const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
          log(`📤 Enviando mif_${chunkNum}/${totalChunks} (${chunk.length} registros)...`);
          promises.push(
            this.db.collection(collectionName).doc(`mif_${chunkNum}`).set({ 
              data: chunk, 
              chunkNum: chunkNum,
              totalChunks: totalChunks,
              atualizadoEm: new Date().toISOString() 
            })
          );
        }
        
        if (contracep.length > 0) {
          promises.push(
            this.db.collection(collectionName).doc('contracep').set({ 
              data: contracep, atualizadoEm: new Date().toISOString() })
          );
        }
        if (pccu.length > 0) {
          promises.push(
            this.db.collection(collectionName).doc('pccu').set({ 
              data: pccu, atualizadoEm: new Date().toISOString() })
          );
        }
        if (ist.length > 0) {
          promises.push(
            this.db.collection(collectionName).doc('ist').set({ 
              data: ist, atualizadoEm: new Date().toISOString() })
          );
        }
        
        await Promise.all(promises);
        this.lastSync = new Date();
        log("✅ Dados SALVOS em documentos separados!");
        
      } catch (e) {
        log("❌ Erro ao enviar: " + e.message);
        console.error("Erro ao sincronizar:", e);
      } finally {
        window._syncEmProgresso = false;
      }
    },

    // Baixar dados do Firebase para local
    syncFromCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncFromCloud: Não conectado ou sem db");
        return;
      }
      
      // Evita loop de sincronização
      if (window._syncEmProgresso) {
        console.log("⏭️ Sync já em andamento, pulando...");
        return;
      }
      window._syncEmProgresso = true;
      
      const debugStatus = document.getElementById('sync-debug-status');
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      try {
        const collectionName = 'dados_publicos';
        let dadosBaixados = false;
        
        log(`📥 Buscando documentos em: ${collectionName}`);
        
        // Primeiro, busca chunks do mif (mif_1, mif_2, etc)
        let mifCompleto = [];
        let chunkNum = 1;
        while (true) {
          try {
            const doc = await this.db.collection(collectionName).doc(`mif_${chunkNum}`).get();
            if (doc.exists && doc.data().data) {
              const chunk = doc.data().data;
              mifCompleto = mifCompleto.concat(chunk);
              log(`✅ mif_${chunkNum}: ${chunk.length} registros`);
              chunkNum++;
            } else {
              break;
            }
          } catch (e) {
            break;
          }
        }
        
        if (mifCompleto.length > 0) {
          window.data.db.set('mif', mifCompleto);
          log(`✅ mif completo: ${mifCompleto.length} pacientes`);
          dadosBaixados = true;
        }
        
        // Busca outros documentos
        const outrosDocs = ['contracep', 'pccu', 'ist', 'config'];
        
        for (const docName of outrosDocs) {
          try {
            const doc = await this.db.collection(collectionName).doc(docName).get();
            
            if (doc.exists) {
              const dados = doc.data();
              if (dados.data && dados.data.length > 0) {
                log(`✅ ${docName}: ${dados.data.length} registros`);
                window.data.db.set(docName, dados.data);
                dadosBaixados = true;
              }
            }
          } catch (e) {
            // Ignora erros de documentos que não existem
          }
        }
        
        if (dadosBaixados) {
          log("✅ Todos os dados baixados!");
          return true;
        } else {
          log("⚠️ Nenhum dado encontrado na nuvem");
        }
      } catch (e) {
        log("❌ Erro ao baixar: " + e.message);
        console.error("Erro ao baixar dados:", e);
      } finally {
        window._syncEmProgresso = false;
      }
      return false;
    },

    // Login anónimo (para testes)
    loginAnonimo: async function() {
      if (!this.auth) return;
      try {
        await this.auth.signInAnonymously();
      } catch (e) {
        console.error("Erro login anónimo:", e);
      }
    },

    // Login com email/senha
    login: async function(email, password) {
      if (!this.auth) return;
      try {
        await this.auth.signInWithEmailAndPassword(email, password);
        return true;
      } catch (e) {
        alert("Erro no login: " + e.message);
        return false;
      }
    },

    // Logout
    logout: async function() {
      if (!this.auth) return;
      await this.auth.signOut();
    },

    // Iniciar sincronização automática
    startAutoSync: function() {
      if (!window.syncConfig.autoSync) return;
      
      // Sincronizar ao iniciar (baixa dados da nuvem)
      console.log("Iniciando sincronização automática...");
      this.syncFromCloud().then(() => {
        // Depois de baixar, configura intervalo para enviar
        setInterval(() => {
          this.syncToCloud();
        }, window.syncConfig.syncInterval);
      });
    },

    // Forçar sincronização manual
    forceSync: async function() {
      // Permite forçar sync mesmo se já em andamento
      window._syncEmProgresso = false;
      
      const statusEl = document.getElementById('sync-status');
      const debugStatus = document.getElementById('sync-debug-status');
      
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      if(statusEl) statusEl.innerHTML = '⏳ Enviando dados para a nuvem...';
      log("🚀 forceSync iniciado...");
      
      // Primeiro, mostra o que vamos enviar
      const mif = window.data.db.get('mif') || [];
      const contracep = window.data.db.get('contracep') || [];
      const pccu = window.data.db.get('pccu') || [];
      
      log(`📊 Dados locais: mif=${mif.length}, contracep=${contracep.length}, pccu=${pccu.length}`);
      
      try {
        await this.syncToCloud();
        if(statusEl) statusEl.innerHTML = '✅ Dados enviados! Baixando do Firebase...';
        log("📤 Dados enviados para a nuvem!");
        
        // Pequena pausa antes de baixar
        await new Promise(r => setTimeout(r, 1000));
        
        if(statusEl) statusEl.innerHTML = '⏳ Baixando dados...';
        log("📥 Tentando baixar dados...");
        
        const sucesso = await this.syncFromCloud();
        
        if(sucesso) {
          if(statusEl) {
            statusEl.innerHTML = '✅ Sincronização completa!';
            setTimeout(() => statusEl.innerHTML = '', 5000);
          }
          log("✅ Sincronização completa!");
          alert("Sincronização concluída!");
        } else {
          if(statusEl) statusEl.innerHTML = '⚠️ Enviado, mas não encontrou dados para baixar';
          log("⚠️ Enviado, mas não encontrou dados para baixar");
        }
      } catch(e) {
        if(statusEl) statusEl.innerHTML = '❌ Erro: ' + e.message;
        log("❌ Erro: " + e.message);
        alert("Erro na sincronização: " + e.message);
      }
    }
  };

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initFirebaseSync());
  } else {
    initFirebaseSync();
  }

  async function initFirebaseSync() {
    // Mostra painel de debug
    const debugEl = document.getElementById('sync-debug');
    const debugStatus = document.getElementById('sync-debug-status');
    
    if (debugEl) debugEl.style.display = 'block';
    
    function log(msg) {
      console.log(msg);
      if (debugStatus) debugStatus.innerHTML += msg + '<br>';
    }
    
    log("🔄 Iniciando Firebase...");
    
    await window.FirebaseSync.init();
    
    log("📡 isOnline: " + window.FirebaseSync.isOnline);
    log("⚙️ autoSync: " + window.syncConfig?.autoSync);
    
    // Se conectado e sincronização automática ativada, baixa dados APENAS uma vez
    if (window.FirebaseSync.isOnline && window.syncConfig?.autoSync && !window._jaSincronizou) {
      window._jaSincronizou = true; // Marca que já sync para evitar loop
      
      log("⏳ Baixando dados da nuvem (início)...");
      
      setTimeout(async () => {
        const sucesso = await window.FirebaseSync.syncFromCloud();
        if (sucesso) {
          log("✅ Dados baixados na inicialização!");
          window.dispatchEvent(new Event('dadosSincronizados'));
          // Não recarrega automaticamente - o app.js detecta o evento
        } else {
          log("⚠️ Nenhum dado encontrado na nuvem (início)");
        }
      }, 3000);
    } else {
      if (window._jaSincronizou) {
        log("⏭️ Sync já realizado, pulando download automático");
      }
    }
  }
})();