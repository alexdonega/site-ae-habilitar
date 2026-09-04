import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import GrupoVip from './GrupoVip.jsx'
import Dash from './Dash.jsx'
import Dashboard from './Dashboard.jsx'
import MetaAds from './MetaAds.jsx'
import Mensagens from './Mensagens.jsx'
import MensagensEditar from './MensagensEditar.jsx'
import Criativos from './Criativos.jsx'
import CriativosEditar from './CriativosEditar.jsx'
import Imagens from './Imagens.jsx'
import ImagensEditar from './ImagensEditar.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/mega-oferta" element={<GrupoVip />} />
                <Route path="/grupo-vip" element={<Navigate to="/mega-oferta" replace />} />
                {/* Dashboard de leads (antiga /dash). */}
                <Route path="/lead" element={<Dash />} />
                <Route path="/dash" element={<Navigate to="/lead" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/meta-ads" element={<MetaAds />} />
                <Route path="/mensagens" element={<Mensagens />} />
                <Route path="/mensagens/novo" element={<MensagensEditar />} />
                <Route path="/mensagens/:id" element={<MensagensEditar />} />
                <Route path="/criativos" element={<Criativos />} />
                <Route path="/criativos/novo" element={<CriativosEditar />} />
                <Route path="/criativos/:id" element={<CriativosEditar />} />
                <Route path="/imagens" element={<Imagens />} />
                <Route path="/imagens/produto/novo" element={<ImagensEditar tipo="produto" />} />
                <Route path="/imagens/produto/:id" element={<ImagensEditar tipo="produto" />} />
                <Route path="/imagens/foto/novo" element={<ImagensEditar tipo="foto" />} />
                <Route path="/imagens/foto/:id" element={<ImagensEditar tipo="foto" />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
)
