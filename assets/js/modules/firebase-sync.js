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
      if (!this.isOnline || !this.db) return;
      
      try {
        const user = this.auth.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        const dados = {
          mif: window.data.db.get('mif'),
          contracep: window.data.db.get('contracep'),
          pccu: window.data.db.get('pccu'),
          ist: window.data.db.get('ist'),
          fila_contracep: window.data.db.get('fila_contracep'),
          soap_history: window.data.db.get('soap_history'),
          soap_templates: window.data.db.get('soap_templates'),
          config: window.data.db.get('config'),
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
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
      if (!this.isOnline || !this.db) return;
      
      try {
        const user = this.auth.currentUser;
        const collectionName = user ? `usuarios/${user.uid}/dados` : 'dados_publicos';
        
        const doc = await this.db.collection(collectionName).doc('backup').get();
        
        if (doc.exists) {
          const dados = doc.data();
          
          if (dados.mif) window.data.db.set('mif', dados.mif);
          if (dados.contracep) window.data.db.set('contracep', dados.contracep);
          if (dados.pccu) window.data.db.set('pccu', dados.pccu);
          if (dados.ist) window.data.db.set('ist', dados.ist);
          if (dados.fila_contracep) window.data.db.set('fila_contracep', dados.fila_contracep);
          if (dados.soap_history) window.data.db.set('soap_history', dados.soap_history);
          if (dados.soap_templates) window.data.db.set('soap_templates', dados.soap_templates);
          if (dados.config) window.data.db.set('config', dados.config);
          
          console.log("✅ Dados baixados da nuvem!");
          return true;
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
      
      setInterval(() => {
        this.syncToCloud();
      }, window.syncConfig.syncInterval);
      
      // Sincronizar ao iniciar
      this.syncFromCloud();
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
    document.addEventListener('DOMContentLoaded', () => window.FirebaseSync.init());
  } else {
    window.FirebaseSync.init();
  }
})();