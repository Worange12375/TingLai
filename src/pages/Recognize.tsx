export default function Recognize() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-leaf-800">识籁 · 声音识别</h2>
      <p className="text-leaf-700">
        上传或录制自然声音，调用 BirdNET / ThinkSound 识别物种，返回 Top-3 结果与中文科普卡。
      </p>
      <div className="rounded-xl2 border-2 border-dashed border-leaf-300 p-10 text-center text-leaf-600">
        🎤 录音 / 上传区域（待实现：接入 src/lib/recognize.ts）
      </div>
    </div>
  )
}
