import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    // 部分沙箱/受控环境禁止删除目录，emptyOutDir 会导致构建中断；
    // 产物文件名带 hash，不清空也不会互相覆盖。
    emptyOutDir: false,
    chunkSizeWarningLimit: 900,
  },
})
