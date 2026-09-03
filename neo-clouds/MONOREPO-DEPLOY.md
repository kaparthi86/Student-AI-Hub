# Deploy from Student-AI-Hub monorepo (optional)

Neo Clouds is a **separate product**. Prefer a standalone repo — see [LAUNCH.md](./LAUNCH.md).

If the code still lives under `neo-clouds/` in Student-AI-Hub, you can still run a **second** Render service (do not reuse the AI Hub service):

1. Render → **New → Web Service**
2. Same GitHub repo: `Student-AI-Hub`
3. **Root Directory:** `neo-clouds`
4. **Start command:** `npm start`
5. **Health check path:** `/api/health`
6. **Custom domain:** `neocloudsmarketplace.com` (only on this service)

AI Hub keeps its own domain on the root service (`render.yaml` at repo root, blank Root Directory).

Never attach `neocloudsmarketplace.com` to the `student-ai-hub` Render service.
