import React from 'react'
import ReactDOM from 'react-dom/client'
// 用 HashRouter：静态托管（任意静态服务器）无需配置 SPA 回退，
// 直接打开或刷新 /#/hall 这类深层链接也不会 404。
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
