/// <reference types="vite/client" />
// Vite 客户端类型声明：提供 import.meta.env / import.meta.glob 的类型。
// 同时把项目用到的自定义环境变量登记在这里，改名或拼错会在 tsc 阶段就报错。

interface ImportMetaEnv {
  /**
   * 识别服务基地址（不含 /api/recognize 路径）。
   * - 生产：留空 "" → 走同源相对路径，由 nginx 反代到容器 8000
   * - 开发：默认 http://localhost:8000
   */
  readonly VITE_RECOGNIZE_API?: string
  /**
   * 兼容部署文档的写法：直接写「站 base」，代码会自动去掉末尾 /api 再拼 /api/recognize。
   * 例如填 https://tinglai.dushiofcourses.cn/api → 归一化为 https://tinglai.dushiofcourses.cn
   * → 最终请求 https://tinglai.dushiofcourses.cn/api/recognize。优先级低于 VITE_RECOGNIZE_API。
   */
  readonly VITE_API_BASE_URL?: string
  /** 兼容老配置：直接写完整识别 endpoint，优先级高于 VITE_RECOGNIZE_API / VITE_API_BASE_URL */
  readonly VITE_BIRDNET_ENDPOINT?: string
  /** 识别请求超时（毫秒），默认 30000 */
  readonly VITE_RECOGNIZE_TIMEOUT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
