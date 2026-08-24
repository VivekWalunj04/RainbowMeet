import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import selfsigned from 'selfsigned';

async function getDevCerts(certDir: string) {
  const keyPath = join(certDir, 'key.pem');
  const certPath = join(certDir, 'cert.pem');
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  if (!existsSync(certDir)) mkdirSync(certDir, { recursive: true });
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 365, keySize: 2048, algorithm: 'sha256' },
  );
  writeFileSync(keyPath, pems.private);
  writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_API_URL || 'http://localhost:3000';
  const livekitTarget = env.VITE_LIVEKIT_URL || 'http://localhost:7880';
  const certs = await getDevCerts(join(process.cwd(), '.cert'));

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: certs,
      allowedHosts: true,
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true },
        '/socket.io': { target: backendTarget, ws: true, changeOrigin: true },
        '/livekit': { target: livekitTarget, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/livekit/, '') },
      },
    },
  };
});
