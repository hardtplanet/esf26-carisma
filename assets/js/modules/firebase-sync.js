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

    // Sincronizar dados locais para Firebase
    syncToCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncToCloud: Não conectado");
        return;
      }
      
      const debugStatus = document.getElementById('sync-debug-status');
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      try {
        const user = this.auth?.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        log(`📤 Enviando para: ${collectionName}`);
        
        // Pega dados do LocalStorage
        const mif = window.data.db.get('mif') || [];
        const contracep = window.data.db.get('contracep') || [];
        const pccu = window.data.db.get('pccu') || [];
        const ist = window.data.db.get('ist') || [];
        
        log(`📊 Enviando: mif=${mif.length}, contracep=${contracep.length}, pccu=${pccu.length}, ist=${ist.length}`);
        
        const dados = {
          mif,
          contracep,
          pccu,
          ist,
          fila_contracep: window.data.db.get('fila_contracep') || [],
          soap_history: window.data.db.get('soap_history') || [],
          soap_templates: window.data.db.get('soap_templates') || [],
          config: window.data.db.get('config') || [],
          atualizadoEm: new Date().toISOString()
        };

        await this.db.collection(collectionName).doc('backup').set(dados, { merge: true });
        this.lastSync = new Date();
        log("✅ Dados SALVOS no Firebase!");
        
      } catch (e) {
        log("❌ Erro ao enviar: " + e.message);
        console.error("Erro ao sincronizar:", e);
      }
    },

    // Baixar dados do Firebase para local
    syncFromCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncFromCloud: Não conectado ou sem db");
        return;
      }
      
      const debugStatus = document.getElementById('sync-debug-status');
      function log(msg) {
        console.log(msg);
        if (debugStatus) debugStatus.innerHTML += msg + '<br>';
      }
      
      try {
        const user = this.auth?.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        log(`📥 Buscando em: ${collectionName}`);
        
        const doc = await this.db.collection(collectionName).doc('backup').get();
        
        if (doc.exists) {
          const dados = doc.data();
          log(`📊 Dados encontrados: ${Object.keys(dados).join(', ')}`);
          
          if (dados.mif) {
            window.data.db.set('mif', dados.mif);
            log(`✅ mif restaurado: ${dados.mif.length} pacientes`);
          }
          if (dados.contracep) {
            window.data.db.set('contracep', dados.contracep);
            log(`✅ contracep restaurado: ${dados.contracep.length} registros`);
          }
          if (dados.pccu) {
            window.data.db.set('pccu', dados.pccu);
            log(`✅ pccu restaurado: ${dados.pccu.length} registros`);
          }
          if (dados.ist) {
            window.data.db.set('ist', dados.ist);
            log(`✅ ist restaurado: ${dados.ist.length} registros`);
          }
          if (dados.fila_contracep) window.data.db.set('fila_contracep', dados.fila_contracep);
          if (dados.soap_history) window.data.db.set('soap_history', dados.soap_history);
          if (dados.soap_templates) window.data.db.set('soap_templates', dados.soap_templates);
          if (dados.config) window.data.db.set('config', dados.config);
          
          log("✅ Dados baixados da nuvem!");
          return true;
        } else {
          log("⚠️ Nenhum documento 'backup' encontrado no Firebase");
          // Tenta buscar em dados_publicos como fallback
          log("🔄 Tentando buscar em dados_publicos...");
          const doc2 = await this.db.collection('dados_publicos').doc('backup').get();
          if (doc2.exists) {
            log("✅ Encontrou em dados_publicos!");
            const dados = doc2.data();
            if (dados.mif) window.data.db.set('mif', dados.mif);
            if (dados.contracep) window.data.db.set('contracep', dados.contracep);
            if (dados.pccu) window.data.db.set('pccu', dados.pccu);
            if (dados.ist) window.data.db.set('ist', dados.ist);
            return true;
          }
        }
      } catch (e) {
        log("❌ Erro ao baixar: " + e.message);
        console.error("Erro ao baixar dados:", e);
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
    
    // Se conectado e sincronização automática ativada, baixa dados
    if (window.FirebaseSync.isOnline && window.syncConfig?.autoSync) {
      log("⏳ Baixando dados da nuvem...");
      
      setTimeout(async () => {
        const sucesso = await window.FirebaseSync.syncFromCloud();
        if (sucesso) {
          log("✅ Dados baixados!");
          window.dispatchEvent(new Event('dadosSincronizados'));
          setTimeout(() => window.location.reload(), 2000);
        } else {
          log("⚠️ Nenhum dado encontrado na nuvem");
        }
      }, 3000);
    } else {
      log("❌ Firebase não conectado ou sync desativado");
    }
  }
})();