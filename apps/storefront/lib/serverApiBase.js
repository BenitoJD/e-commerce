// ESM facade over the CommonJS implementation (next.config.js needs CommonJS).
import b from './serverApiBase.cjs';

export const serverApiBase = b.serverApiBase;
