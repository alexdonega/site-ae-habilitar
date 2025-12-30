import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import GrupoVip from './GrupoVip.jsx'
import Login from './Login.jsx'
import Leads from './Leads.jsx'
import LeadDetail from './LeadDetail.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/grupo-vip" element={<GrupoVip />} />
                <Route path="/login" element={<Login />} />
                <Route path="/lead" element={<Leads />} />
                <Route path="/lead/:id" element={<LeadDetail />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
)
