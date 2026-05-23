# Ex-Skill Mobile Chat

A mobile-first, Apple iMessage-style Progressive Web Application (PWA) designed to interface with a local persistent Claude persona session via Ollama. 

The application features a sleek Next.js (React + TypeScript) frontend optimized for iOS devices (Safari & PWA Add to Home Screen) and a robust FastAPI backend managing a persistent interactive CLI session with conversation context.

---

## 🏗️ Architecture

```
                  ┌──────────────────────────────┐
                  │   iPhone Safari / PWA Host   │
                  └──────────────┬───────────────┘
                                 │ HTTPS (Ngrok / Local)
                                 ▼
                  ┌──────────────────────────────┐
                  │    Next.js Chat Frontend     │
                  └──────────────┬───────────────┘
                                 │ REST API / Web Push
                                 ▼
                  ┌──────────────────────────────┐
                  │    FastAPI Python Backend    │
                  └──────────────┬───────────────┘
                                 │ pexpect Subprocess
                                 ▼
                  ┌──────────────────────────────┐
                  │    Ollama CLI Runtime        │
                  │   (gemma4:31b-cloud model)   │
                  └──────────────┬───────────────┘
                                 │ Persona Init
                                 ▼
                  ┌──────────────────────────────┐
                  │  /ex-skill Persona Active    │
                  └──────────────────────────────┘
```

- **Frontend**: Next.js 14, Tailwind CSS, TypeScript, Web Push Service Worker (PWA-enabled).
- **Backend**: FastAPI, `pexpect` (persistent terminal subprocess tracking), SQLite (for offline historical message replication).

---

## ✨ Features

- **Apple iMessage Mirror UI**: Native-looking outgoing blue bubbles, incoming gray bubbles, timestamps, delivery indicators, and custom iOS typing indicator bubbles.
- **PWA Capabilities**: Installable to Home Screen on iOS/Android, splash screen config, full-screen standalone mode, and theme color support.
- **Persistent CLI Session**: The backend retains one single long-lived CLI terminal subprocess (`ollama launch claude`). It chooses the model and runs the `/ex-skill` initialization command once. All subsequent chat inputs are piped into the same terminal stdin, preserving model context naturally.
- **SQLite History**: Safe message persistence that survives backend restarts, automatically synchronizing with the frontend when reloaded.
- **Web Push Notifications**: Automatic background worker registration supporting offline incoming notifications via standard web push.
- **Enhanced Security**: Protected endpoints requiring auth headers matched against an `API_TOKEN`. Safe terminal input pipe mapping.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+ & **npm**
- **Python** v3.10+
- **Ollama** installed on the host system

---

### 📥 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure the environment variables. Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```
   *Example `.env`:*
   ```env
   API_TOKEN=your-super-secure-token
   ALLOWED_ORIGINS=http://localhost:3000
   OLLAMA_COMMAND=ollama launch claude
   OLLAMA_MODEL=gemma4:31b-cloud
   PERSONA_COMMAND=/ex-skill
   ```

5. **Generate VAPID keys for Push Notifications (Optional)**:
   The backend expects `private_key.pem` and `public_key.pem` in the root of the `backend` folder to send push notifications. You can generate a VAPID keypair using open-source utilities or Python's `pywebpush` tool:
   ```bash
   # Python utility to create keys
   python -c "from pywebpush import webpush; print('VAPID keys must be in standard PEM format')"
   ```

6. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   The backend will be running at `http://127.0.0.1:8000`.

---

### 📱 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install the Node modules:
   ```bash
   npm install
   ```

3. Configure the environment variables. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   *Example `.env.local`:*
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   NEXT_PUBLIC_API_TOKEN=your-super-secure-token  # Must match backend's API_TOKEN
   ```

4. Run the frontend development server:
   ```bash
   npm run dev
   ```
   The frontend will be running at `http://localhost:3000`.

---

## 🔒 Security Hardening

When deploying over public domains (e.g., via `ngrok` or traditional hosting):
- **CORS Protection**: Ensure `ALLOWED_ORIGINS` in `backend/.env` is configured to only allow your frontend domain origin.
- **Authentication**: Keep your `API_TOKEN` randomized and robust.
- **Database & Keys**: All SQLite databases and VAPID `.pem` keyfiles are explicitly excluded in `.gitignore` to avoid exposing secrets on public repositories.
