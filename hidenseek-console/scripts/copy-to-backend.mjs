// Copies the production build into the Spring Boot app, which serves it at /console.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../dist/console/browser', import.meta.url));
const to = fileURLToPath(new URL('../../hidenseek-backend/src/main/resources/static/console', import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Console copied to ${to}`);
