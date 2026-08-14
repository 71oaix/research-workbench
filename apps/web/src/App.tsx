import { useEffect, useState } from 'react'

interface Health {
  status: string
  db: string
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError('后端未连接'))
  }, [])

  const healthText = health
    ? `后端状态: ● ${health.status} / db ${health.db}`
    : error ?? '后端状态: 检测中…'

  return (
    <div className="app">
      <header className="titlebar">研镜 Research Workbench</header>
      <div className="body">
        <aside className="left">
          <h2>工作流列表</h2>
          <p className="placeholder">（占位）</p>
        </aside>
        <main className="center">
          <h1>研镜</h1>
          <p className="subtitle">透明学术调研智能体工作台 · M1 骨架</p>
          <p className={health?.status === 'ok' ? 'health-ok' : 'health-bad'}>{healthText}</p>
        </main>
        <aside className="right">
          <h2>引用 / 证据</h2>
          <p className="placeholder">（占位）</p>
        </aside>
      </div>
    </div>
  )
}
