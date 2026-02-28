# Finance App (Bonito) — GitHub Pages + Supabase

## 1) Supabase
1. Rode `schema.sql` em **SQL Editor**
2. Authentication -> Providers: habilite **Email**
3. Authentication -> URL Configuration:
   - Site URL: `https://SEU_USUARIO.github.io/SEU_REPO/`
   - Redirect URLs: adicione a mesma URL

## 2) Frontend
Edite `supabase.js` e cole sua **anon public key** (Project Settings -> API -> anon public).

## 3) GitHub Pages
Settings -> Pages:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)
