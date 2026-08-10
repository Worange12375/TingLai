import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { adminToolPlugin } from './vite-plugin-admin'

export default defineConfig({
  // adminToolPlugin 内部声明了 apply:'serve'，仅在 npm run dev 生效，
  // 生产构建不会注册任何 /__admin 接口。
  plugins: [react(), adminToolPlugin()],
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    // 产物文件名带 hash，不清空输出目录也不会互相覆盖。
    // 保留 emptyOutDir = false 以避免构建时误清空既有产物
    // （部分环境下清目录会直接报错中断构建，这里是硬性保护，勿删）。
    emptyOutDir: false,
    chunkSizeWarningLimit: 900,
  },
})
