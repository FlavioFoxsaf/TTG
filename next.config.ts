import type { NextConfig } from 'next';

const config: NextConfig = {
  // Pacotes que rodam direto no Node (o PGlite carrega um arquivo .wasm)
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default config;
