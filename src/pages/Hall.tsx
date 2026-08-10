// 自然大厅 v1：可探索插画场景 + 可点击动物 NPC
// 点击动物 → 播放叫声 + 弹科普卡。MVP 不做实时移动/碰撞（那是游戏引擎活，赛后扩展）。
const animals = [
  { id: 'sparrow', emoji: '🐦', name: '麻雀', x: '20%', y: '60%' },
  { id: 'frog', emoji: '🐸', name: '青蛙', x: '55%', y: '75%' },
  { id: 'cicada', emoji: '🦗', name: '蝉', x: '75%', y: '40%' },
]

export default function Hall() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-leaf-800">自然大厅</h2>
      <p className="text-leaf-700">点击场景中的动物，聆听它的叫声并查看科普卡。</p>
      <div className="relative w-full h-80 rounded-xl2 bg-gradient-to-b from-leaf-100 to-leaf-300 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-leaf-700/40 text-sm">
          🌳 自然场景（插画待 ImageGen 生成替换）
        </div>
        {animals.map((a) => (
          <button
            key={a.id}
            className="absolute text-4xl hover:scale-110 transition transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: a.x, top: a.y }}
            title={a.name}
          >
            {a.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
