import speciesData from '../data/species.sample.json'

export default function Learn() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-leaf-800">听籁 · 物种知识库</h2>
      <p className="text-leaf-700">浏览团队自建的物种科普卡（数据见 src/data/species.sample.json）。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {speciesData.map((s: any) => (
          <div key={s.id} className="rounded-xl2 bg-white border border-leaf-200 p-4 shadow-sm">
            <div className="font-semibold text-leaf-800">
              {s.name_zh} <span className="text-sm text-leaf-500">{s.name_en}</span>
            </div>
            <div className="text-sm text-leaf-700 mt-1">📍 {s.habitat}</div>
            <div className="text-sm text-leaf-700">🔖 {s.protection_level}</div>
            <div className="text-sm text-leaf-600 mt-2">{s.fun_fact}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
