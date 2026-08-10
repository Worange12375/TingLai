import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    // 产物文件名带 hash，不清空输出目录也不会互相覆盖，
    // 保留 emptyOutDir = false 以避免构建时误操作清空既有产物。
    emptyOutDir: false,
    chunkSizeWarningLimit: 900,
  },
})
