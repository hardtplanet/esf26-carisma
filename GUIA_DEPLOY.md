# Guia de Deploy - ESF 26 Carisma Manager

## 🎯 Pré-requisitos

1. Conta Google (para Firebase e Vercel)
2. Dados actuais do sistema (LocalStorage) - faça backup primeiro!

---

## 📱 PARTE 1: Configurar Firebase

### Passo 1: Criar projeto no Firebase
1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Nome: `esf26-carisma` (ou outro de sua preferência)
4. Desative o Google Analytics (opcional)
5. Clique em **"Criar projeto"**

### Passo 2: Ativar Firestore (Banco de dados)
1. No menu lateral, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha localização: `southamerica-east1` (São Paulo)
4. Inicie em **"Modo de teste"** (para Development)
5. Clique em **"Ativar"**

### Passo 3: Obter configurações do projeto
1. No menu superior (⚙️), clique em **"Configurações do projeto"**
2. Role até **"Seus apps"**
3. Clique no ícone **</>** (Web)
4. Apelido: `carisma-web`
5. Marque "Also set up Firebase Hosting"
6. Clique em **"Registrar app"**
7. Copie o objeto `firebaseConfig` fornecido

### Passo 4: Colar configurações no sistema
1. Abra o arquivo: `assets/js/modules/firebase-config.js`
2. Substitua os valores pelos que você copiou:

```javascript
window.firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "esf26-carisma.firebaseapp.com",
  projectId: "esf26-carisma",
  storageBucket: "esf26-carisma.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:..."
};
```

3. Altere `enabled: false` para `enabled: true`

---

## 🚀 PARTE 2: Deploy na Vercel (Gratuito)

### Opção A: Deploy via Git (Recomendado)

1. **Crie uma conta no GitHub** (se não tiver)
2. **Coloque o projeto numa pasta Git:**
   ```bash
   cd /home/hardt/CARISMA/UBS/APP/ESF26_Carisma_Manager
   git init
   git add .
   git commit -m "v4.0 - Sistema ESF 26"
   ```

3. **Crie um repositório no GitHub** e faça push:
   ```bash
   git remote add origin https://github.com/seu-usuario/esf26-carisma.git
   git push -u origin main
   ```

4. **Acesse [vercel.com](https://vercel.com)** e faça login
5. Clique em **"Add New..."** → **"Project"**
6. Selecione seu repositório GitHub
7. Configure:
   - Framework Preset: `Other`
   - Build Command: (vazio)
   - Output Directory: `.`
8. Clique em **"Deploy"**

### Opção B: Deploy via Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Passo 5: Configurar Domínio Personalizado (Opcional)
1. No projeto Vercel, vá em **Settings** → **Domains**
2. Adicione seu domínio (ex: `carisma.saude.dourados.ms.gov.br`)
3. Configure o DNS conforme instruções

---

## 🔄 PARTE 3: Usar o Sistema Online

### Acceso
- URL: `https://seu-projeto.vercel.app`

### Primeiro uso
1. Acesse a URL
2. O sistema carregará normalmente
3. **Importante:** Os dados não aparecem automaticamente no início
4. Para carregar seus dados do Firebase:
   - Abra o console (F12)
   - Digite: `FirebaseSync.forceSync()`
   - Pressione Enter

### Modo Offline
O sistema continua funcionando offline com LocalStorage. Quando reconectar, os dados sincronizam automaticamente.

---

## ⚙️ Configurações de Sincronização

Edite `assets/js/modules/firebase-config.js`:

```javascript
window.syncConfig = {
  enabled: true,     // Ative para sincronizar
  autoSync: true,    // Sincroniza automaticamente
  syncInterval: 30000 // Tempo em ms (30 segundos)
};
```

---

## 🔒 Segurança (Produção)

Antes de colocar em produção, configure regras de segurança no Firebase:

1. Vá em **Firestore Database** → **Regras**
2. Use estas regras (exemplo para usuários autenticados):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuário só vê seus próprios dados
    match /usuarios/{userId}/dados/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Dados públicos (apenas leitura)
    match /dados_publicos/{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

---

## 📋 Backup Manual

Mesmo com Firebase, faça backups periódicos:

1. No sistema, vá em **Configurações** → **Exportar Backup**
2. Salve o arquivo `.carisma` em local seguro

---

## ❓ Problemas Comuns

| Problema | Solução |
|----------|---------|
| Logos não aparecem | Verifique caminhos em `assets/img/` |
| Dados não sincronizam | Verifique se `enabled: true` no config |
| Erro 503 na IA | Aguarde e tente novamente |
| Firebase não conecta | Verifique a API Key no firebase-config.js |

---

## 📞 Suporte

Em caso de dúvidas, verifique o console do navegador (F12) para mensagens de erro.