import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Vite dev server proxies API + websocket traffic to the game server on :3001,
// so the client code can use relative URLs and never worry about CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on every interface so other devices on the LAN can open the game.
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
