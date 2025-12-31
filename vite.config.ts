import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'spa',
  plugins: [
    ui({
      ui: {
        colors: {
          neutral: 'zinc',
        },
        // Map default UI component icons to Font Awesome 6
        // Format: i-{collection}:{icon-name} - colon separates collection from icon
        icons: {
          arrowDown: 'i-fa6-solid:arrow-down',
          arrowLeft: 'i-fa6-solid:arrow-left',
          arrowRight: 'i-fa6-solid:arrow-right',
          arrowUp: 'i-fa6-solid:arrow-up',
          caution: 'i-fa6-solid:triangle-exclamation',
          check: 'i-fa6-solid:check',
          chevronDoubleLeft: 'i-fa6-solid:angles-left',
          chevronDoubleRight: 'i-fa6-solid:angles-right',
          chevronDown: 'i-fa6-solid:chevron-down',
          chevronLeft: 'i-fa6-solid:chevron-left',
          chevronRight: 'i-fa6-solid:chevron-right',
          chevronUp: 'i-fa6-solid:chevron-up',
          close: 'i-fa6-solid:xmark',
          copy: 'i-fa6-regular:copy',
          copyCheck: 'i-fa6-solid:clipboard-check',
          dark: 'i-fa6-solid:moon',
          drag: 'i-fa6-solid:grip-vertical',
          ellipsis: 'i-fa6-solid:ellipsis',
          error: 'i-fa6-solid:circle-xmark',
          external: 'i-fa6-solid:arrow-up-right-from-square',
          eye: 'i-fa6-regular:eye',
          eyeOff: 'i-fa6-regular:eye-slash',
          file: 'i-fa6-regular:file',
          folder: 'i-fa6-regular:folder',
          folderOpen: 'i-fa6-regular:folder-open',
          hash: 'i-fa6-solid:hashtag',
          info: 'i-fa6-solid:circle-info',
          light: 'i-fa6-solid:sun',
          loading: 'i-fa6-solid:spinner',
          menu: 'i-fa6-solid:bars',
          minus: 'i-fa6-solid:minus',
          panelClose: 'i-fa6-solid:chevron-left',
          panelOpen: 'i-fa6-solid:chevron-right',
          plus: 'i-fa6-solid:plus',
          reload: 'i-fa6-solid:rotate-right',
          search: 'i-fa6-solid:magnifying-glass',
          stop: 'i-fa6-solid:stop',
          success: 'i-fa6-solid:circle-check',
          system: 'i-fa6-solid:desktop',
          tip: 'i-fa6-solid:lightbulb',
          upload: 'i-fa6-solid:upload',
          warning: 'i-fa6-solid:triangle-exclamation',
        },
        input: {
          slots: {
            root: 'w-full',
          },
        },
        formField: {
          slots: {
            root: 'w-full',
          },
        },
      },
    }),
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  css: {
    devSourcemap: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vue core ecosystem
          if (id.includes('node_modules/vue/') || id.includes('node_modules/@vue/')) {
            return 'vue-vendor'
          }
          if (id.includes('node_modules/vue-router/')) {
            return 'vue-router'
          }
          if (id.includes('node_modules/pinia/')) {
            return 'pinia'
          }
          // Icon JSON data (these are large)
          if (id.includes('@iconify-json/fa6-solid')) {
            return 'icons-solid'
          }
          if (id.includes('@iconify-json/fa6-regular')) {
            return 'icons-regular'
          }
          if (id.includes('@iconify-json/fa6-brands')) {
            return 'icons-brands'
          }
          // Iconify runtime
          if (id.includes('@iconify/')) {
            return 'iconify'
          }
          // Capacitor
          if (id.includes('@capacitor/')) {
            return 'capacitor'
          }
          // Radix Vue (UI primitives)
          if (id.includes('reka-ui') || id.includes('radix-vue')) {
            return 'ui-primitives'
          }
          // TipTap editor (if used)
          if (id.includes('@tiptap/') || id.includes('prosemirror')) {
            return 'editor'
          }
        },
      },
      plugins: [
        visualizer({
          filename: 'dist/stats.html',
          open: false,
          gzipSize: true,
        }),
      ],
    },
  },
})
