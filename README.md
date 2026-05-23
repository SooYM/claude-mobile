# Claude Mobile

Mobile-first iMessage-style chat web app for a single Claude persona, with a Next.js frontend and a FastAPI backend.

## Structure

- `frontend/` Next.js + TypeScript app for the iPhone-style chat UI
- `backend/` FastAPI service that will own CLI session orchestration, persistence, and auth

## Next steps

1. Install frontend dependencies.
2. Install Python dependencies.
3. Wire the backend session manager to the persistent `ollama launch claude` process.
4. Connect the frontend chat flow to the backend API.
