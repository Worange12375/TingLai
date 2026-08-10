// Web Audio 封装：播放 / 录音 / 波形可视化（MVP 基础）
export async function playAudio(url: string): Promise<void> {
  const audio = new Audio(url)
  await audio.play()
}

// 录音：用 MediaRecorder + getUserMedia 实现（占位骨架）
export function createRecorder(): {
  start: () => Promise<void>
  stop: () => Promise<Blob>
} {
  let mediaRecorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []

  return {
    async start() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream)
      chunks = []
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
      mediaRecorder.start()
    },
    async stop() {
      return new Promise<Blob>((resolve) => {
        if (!mediaRecorder) return resolve(new Blob())
        mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))
        mediaRecorder.stop()
      })
    },
  }
}
