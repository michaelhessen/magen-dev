# Magen Vite Refactor

This project refactors the original single-file app into a Vite setup ready for GitHub Pages deployment.

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
npm run preview
```

## GitHub Pages

1. Replace `<REPO_NAME>` in `vite.config.js` with your repository name.
2. Push to `main` and enable **GitHub Pages** with source **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds and deploys `dist/`.
4. A `.nojekyll` file is included so static assets serve correctly.

If client-side routing is added later, create a `404.html` that redirects to `index.html`.

## Debug States

Add `data-debug="states"` to the `<html>` tag to display loading/empty/error/success helper states.

## Notes

- PWA assets live in `/public` and are copied as-is to `dist`.
- Storage keys and DOM ids remain unchanged to preserve existing data.
