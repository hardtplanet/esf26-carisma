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
      if (!window.firebaseConfig || window.firebaseConfig.apiKey === "SUA_API_KEY_AQUI") {
        console.log("Firebase não configurado. Usando modo local apenas.");
        this.isOnline = false;
        return;
      }

      try {
        // Importar Firebase SDK via CDN
        if (!window.firebase) {
          console.log("Carregando Firebase SDK...");
          await this.loadFirebaseSDK();
        }

        // Inicializar Firebase
        console.log("Inicializando Firebase com config:", window.firebaseConfig);
        firebase.initializeApp(window.firebaseConfig);
        this.db = firebase.firestore();
        this.auth = firebase.auth();

        this.isOnline = true;
        console.log("✅ Firebase conectado! isOnline =", this.isOnline);
        
        // Verificar autenticação
        this.auth.onAuthStateChanged(user => {
          if (user) {
            console.log("Usuário logado:", user.email);
            this.startAutoSync();
          } else {
            console.log("Modo anónimo - sem login requerido");
            // Iniciar sincronização mesmo sem login
            this.startAutoSync();
          }
        });

      } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        this.isOnline = false;
      }
    },

    loadFirebaseSDK: function() {
      return new Promise((resolve, reject) => {
        if (window.firebase) { resolve(); return; }
        
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
        script.onload = () => {
          const script2 = document.createElement('script');
          script2.src = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
          script2.onload = resolve;
          script2.onerror = reject;
          document.head.appendChild(script2);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    // Sincronizar dados locais para Firebase
    syncToCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncToCloud: Não conectado");
        return;
      }
      
      try {
        const user = this.auth.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        // Pega dados do LocalStorage
        const mif = window.data.db.get('mif') || [];
        const contracep = window.data.db.get('contracep') || [];
        const pccu = window.data.db.get('pccu') || [];
        const ist = window.data.db.get('ist') || [];
        
        console.log("Enviando para Firebase:", {
          mif: mif.length,
          contracep: contracep.length,
          pccu: pccu.length,
          ist: ist.length
        });
        
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
        console.log("✅ Dados sincronizados para a nuvem!");
        
      } catch (e) {
        console.error("Erro ao sincronizar:", e);
      }
    },

    // Baixar dados do Firebase para local
    syncFromCloud: async function() {
      if (!this.isOnline || !this.db) {
        console.log("syncFromCloud: Não conectado ou sem db");
        return;
      }
      
      try {
        const user = this.auth.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        console.log("Buscando dados em:", collectionName);
        const doc = await this.db.collection(collectionName).doc('backup').get();
        
        if (doc.exists) {
          const dados = doc.data();
          console.log("Dados encontrados no Firebase:", Object.keys(dados));
          
          if (dados.mif) {
            window.data.db.set('mif', dados.mif);
            console.log("✅ mif restaurado:", dados.mif.length, "pacientes");
          }
          if (dados.contracep) window.data.db.set('contracep', dados.contracep);
          if (dados.pccu) window.data.db.set('pccu', dados.pccu);
          if (dados.ist) window.data.db.set('ist', dados.ist);
          if (dados.fila_contracep) window.data.db.set('fila_contracep', dados.fila_contracep);
          if (dados.soap_history) window.data.db.set('soap_history', dados.soap_history);
          if (dados.soap_templates) window.data.db.set('soap_templates', dados.soap_templates);
          if (dados.config) window.data.db.set('config', dados.config);
          
          console.log("✅ Dados baixados da nuvem!");
          return true;
        } else {
          console.log("Nenhum documento encontrado no Firebase");
        }
      } catch (e) {
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
      if(statusEl) statusEl.innerHTML = '⏳ Enviando dados para a nuvem...';
      
      try {
        await this.syncToCloud();
        if(statusEl) statusEl.innerHTML = '✅ Dados enviados! Baixando do Firebase...';
        
        await this.syncFromCloud();
        
        if(statusEl) {
          statusEl.innerHTML = '✅ Sincronização completa!';
          setTimeout(() => statusEl.innerHTML = '', 3000);
        }
        alert("Sincronização concluída!");
      } catch(e) {
        if(statusEl) statusEl.innerHTML = '❌ Erro: ' + e.message;
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