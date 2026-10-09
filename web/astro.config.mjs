import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.com', // PENDIENTE: dominio definitivo
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  security: { checkOrigin: false }, // el formulario se protege con honeypot, time-trap y rate limit
});
