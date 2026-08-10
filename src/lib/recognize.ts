// 识别 API 封装：优先 BirdNET，ThinkSound 备选
// CORS 兜底：用 CloudStudio / Vercel serverless 函数代理请求
export interface RecognizeResult {
  species: string
  confidence: number
}

export async function recognizeAudio(_blob: Blob): Promise<RecognizeResult[]> {
  // MVP 接入点：
  // 1. BirdNET API: https://birdnet.cornell.edu/api/
  // 2. ThinkSound（阿里云推荐模型）
  // 返回 Top-3 物种 + 置信度，再查本地 species.json 补中文科普卡
  console.log('recognizeAudio: 待接入识别 API', _blob)
  return []
}
