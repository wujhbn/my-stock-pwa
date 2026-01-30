import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // 1. base 必須放在 plugins 的外面 (這裡是正確位置)
  base: '/my-stock-pwa/',

  plugins: [
    react(),
    
    VitePWA({
      // 1. 自動更新模式
      registerType: 'autoUpdate', 
      
      // 2. 包含的靜態檔案
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      // 3. PWA 安裝資訊 (Manifest)
      manifest: {
        name: 'StockMaster 股票分析',
        short_name: 'StockMaster',
        description: '即時台股/美股走勢分析',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },

      // 4. 緩存策略
      workbox: {
        runtimeCaching: [
          {
            // ⚠️ 注意：這裡記得換成你真的有在用的 API 網址關鍵字
            // 例如你用 Yahoo Finance，這裡可能要包含 'yahoo'
            urlPattern: ({ url }) => url.href.includes('api'), 
            handler: 'NetworkOnly', 
          },
          {
            // 針對靜態資源優先讀快取
            urlPattern: ({ request }) => request.destination === 'image' || request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 
              }
            }
          }
        ]
      }
    })
  ],
})