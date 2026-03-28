import './App.css'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'

function App() {

  return (
      <Router>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/creators" element={<Creators />} />
          </Route>
        </Routes>
      </Router>
  )
}

export default App
