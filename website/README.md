# DevCue One Website

Independent marketing site for `DevCue One`.

Why it lives here:

- keeps the desktop app and the launch site separated
- targets Cloudflare Workers via static asset deployment
- keeps bilingual content in one place without turning the desktop app into a monolith

## Scripts

```bash
npm install
npm run dev
npm run check
npm run build
npm run deploy
```

## Content Structure

- `src/data/site.ts`: bilingual product copy
- `src/components/LandingPage.astro`: shared landing page renderer
- `src/styles/global.css`: full visual system for the site

## Screenshots

Drop future product screenshots into `public/screens/` and replace the placeholder showcase entries in `src/data/site.ts`.
