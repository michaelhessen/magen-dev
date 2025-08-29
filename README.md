# Magen

Refactored into a Vite + PWA project.

## Development
1. Install deps: `npm install`
2. Replace `<REPO_NAME>` in `vite.config.js` with your repository name.
3. Start dev server: `npm run dev`
4. Build for production: `npm run build`
5. Preview build locally: `npm run preview`

## GitHub Pages
- Enable **Pages** in repository settings with source **GitHub Actions**.
- The included workflow builds and deploys `dist/` automatically.
- A `.nojekyll` file ensures assets are served without Jekyll processing.

## Notes
- All existing storage keys and element IDs remain unchanged to preserve data.
- PWA assets live in `public/` and service worker registers from `/sw.js`.
- If adding client-side routing later, add a `404.html` that redirects to `index.html`.
