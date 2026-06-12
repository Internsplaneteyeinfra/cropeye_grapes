// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  assetsInclude: ["**/*.geojson"],
  // When deployed behind one domain (Render + nginx), grapes app is served under /grapes/
  base: mode === "production" ? "/grapes/" : "/",

  // Ensure single React instance (fixes "isElement" undefined errors with chunking)
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  build: {
    sourcemap: false,
    minify: "esbuild",       // esbuild: safe for React; terser mangling was breaking React.isElement
    outDir: "dist",
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-leaflet': ['leaflet', 'react-leaflet', '@turf/turf'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['lodash', 'date-fns', 'axios'],
          'vendor-export': ['jspdf', 'jspdf-autotable', 'xlsx', 'html2canvas', 'file-saver'],
        },
        sanitizeFileName(name) {
          const lastDot = name.lastIndexOf(".");
          if (lastDot !== -1) {
            const base = name.slice(0, lastDot).replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
            const ext = name.slice(lastDot + 1).toLowerCase();
            return `${base}.${ext}`;
          }
          return name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
        },
      },
      external: [],
    },

    // Chunk size warning threshold
    chunkSizeWarningLimit: 600,

    // Report compressed size (gzipped)
    reportCompressedSize: true,

    // Don't emit asset files with source info
    assetsInlineLimit: 4096,
  },

  // Hide source file references in production
  define: {
    // Only set in production build, not in dev mode (breaks React Fast Refresh)
    ...(process.env.NODE_ENV === 'production' ? {
      __DEV__: false,
      'process.env.NODE_ENV': '"production"',
    } : {}),
  },

  // Disable dev source maps completely
  server: {
    sourcemapIgnoreList: () => {
      return true; // Ignore all source maps in dev too
    },
    host: '0.0.0.0', // Allow access from any IP on the network (0.0.0.0 = all interfaces)
    port: 3001, // Port 3001 for cropeye06
    cors: {
      origin: '*', // Allow all origins
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language', 'Origin', 'X-Requested-With', 'X-CSRFToken', 'Cache-Control', 'Pragma'],
      credentials: false,
      maxAge: 86400, // 24 hours
    },
    strictPort: false, // Allow port fallback if 5174 is busy
    hmr: {
      // Explicitly set HMR to use network host for WiFi access
      port: 3001,
    },
    // Proxy API requests to avoid CORS issues in development
    proxy: {
      // All cropeye-grapes-events-production routes (indices, stress, grapes/*, plots/*)
      '/api/events': {
        target: 'https://cropeye-grapes-events-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/events/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://cropeye-grapes-events-production.up.railway.app');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] =
              'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] =
              'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With, X-CSRFToken, Cache-Control, Pragma';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'false';
            proxyRes.headers['Access-Control-Max-Age'] = '86400';
            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });
          proxy.on('error', (err, _req, res) => {
            console.log('Events API proxy error:', err);
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain',
              });
              res.end('Proxy error');
            }
          });
        },
      },
      '/api/dev-plot': {
        target: 'https://cropeye-grapes-admin-production.up.railway.app',
        changeOrigin: true,
        timeout: 180000,
        proxyTimeout: 180000,
        rewrite: (path) => path.replace(/^\/api\/dev-plot/, ''),
        configure: (proxy, _options) => {
          // Handle OPTIONS preflight requests
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying request:', req.method, req.url);
            // Set CORS headers on request
            proxyReq.setHeader('Origin', 'https://cropeye-grapes-admin-production.up.railway.app');
          });

          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Comprehensive CORS headers - Allow all origins
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With, X-CSRFToken, Cache-Control, Pragma';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'false';
            proxyRes.headers['Access-Control-Max-Age'] = '86400'; // 24 hours
            proxyRes.headers['Access-Control-Allow-Private-Network'] = 'true';
            proxyRes.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Type, Date, Server';

            // Handle OPTIONS preflight
            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }

            console.log('Proxy response:', proxyRes.statusCode, req.url);
          });

          proxy.on('error', (err, _req, res) => {
            console.log('Proxy error:', err);
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
              });
              res.end('Proxy error');
            }
          });
        },
      },
      // Proxy for agroStats API
      '/api/agroStats': {
        target: 'https://cropeye-grapes-events-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agroStats/, '/plots/agroStats'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            proxyReq.setHeader('Origin', 'https://cropeye-grapes-events-production.up.railway.app');
          });

          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Comprehensive CORS headers - Allow all origins
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With, X-CSRFToken, Cache-Control, Pragma';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'false';
            proxyRes.headers['Access-Control-Max-Age'] = '86400';
            proxyRes.headers['Access-Control-Allow-Private-Network'] = 'true';
            proxyRes.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Type, Date, Server';

            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });

          proxy.on('error', (err, _req, res) => {
            console.log('AgroStats proxy error:', err);
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
              });
              res.end('Proxy error');
            }
          });
        },
      },
      // Proxy for backend API (main API server)
      '/api/backend/ws': {
        target: 'https://cropeye-backendd.up.railway.app',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/backend\/ws/, '/ws'),
      },
      // Proxy for backend REST API (main API server)
      '/api/backend': {
        target: 'https://cropeye-backendd.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/backend/, '/api'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            proxyReq.setHeader('Origin', 'https://cropeye-backendd.up.railway.app');
          });

          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Comprehensive CORS headers - Allow all origins
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With, X-CSRFToken, Cache-Control, Pragma';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'false';
            proxyRes.headers['Access-Control-Max-Age'] = '86400';
            proxyRes.headers['Access-Control-Allow-Private-Network'] = 'true';
            proxyRes.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Type, Date, Server, Authorization';

            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });

          proxy.on('error', (err, _req, res) => {
            console.log('Backend API proxy error:', err);
            if (res && !res.headersSent) {
              res.writeHead(500, {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
              });
              res.end('Proxy error');
            }
          });
        },
      },
      // Proxy for weather API (current + 7-day forecast)
      '/api/weather': {
        target: 'https://weather-cropeye.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://weather-cropeye.up.railway.app');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] =
              'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] =
              'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With';
            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });
        },
      },
      // Proxy for forecast weather API (alerts + 24h/48h predictions)
      '/api/forecast-weather': {
        target: 'https://currentforecast-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/forecast-weather/, ''),
      },
      // Soil NPK / required-n / analyze-npk (cropeye-grapes-main-production)
      '/api/grapes-main': {
        target: 'https://cropeye-grapes-main-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/grapes-main/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader(
              'Origin',
              'https://cropeye-grapes-main-production.up.railway.app'
            );
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] =
              'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] =
              'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With';
            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });
          proxy.on('error', (err, _req, res) => {
            if (res && !res.headersSent) {
              res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
              res.end('Proxy error');
            }
          });
        },
      },
      // Proxy for field analysis API (port 9000)
      '/api/field-analysis': {
        target: 'https://cropeye-grapes-sef-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/field-analysis/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            proxyReq.setHeader('Origin', 'https://cropeye-grapes-sef-production.up.railway.app');
          });

          proxy.on('proxyRes', (proxyRes, req, _res) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD';
            proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, Accept-Language, Origin, X-Requested-With';
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'false';
            proxyRes.headers['Access-Control-Max-Age'] = '86400';
            proxyRes.headers['Access-Control-Allow-Private-Network'] = 'true';

            if (req.method === 'OPTIONS') {
              proxyRes.statusCode = 200;
            }
          });
        },
      },
    },
  },
}));
