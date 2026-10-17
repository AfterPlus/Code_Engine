// Deployment settings, read by js/api.js. Loaded as a classic script before the app so it can be swapped per host
// without touching the rest of the code; the Cloudflare Pages build regenerates it from env vars (see README).
//   backend  URL of the Java backend, e.g. 'https://api.example.com'. Empty = same origin as this page.
window.CODE_ENGINE_CONFIG = { backend: '' };
