// import './App.css'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'
import { createTheme, MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const theme = createTheme({

});

const queryClient = new QueryClient();

function App() {

  return (
    <QueryClientProvider client={queryClient}>

      <MantineProvider theme={theme}>
        <Router>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/creators" element={<Creators />} />
              <Route path="/sets" element={<Dashboard />} />
              <Route path="/tools" element={<Dashboard />} />
              <Route path="/settings" element={<Dashboard />} />
            </Route>
          </Routes>
        </Router>
      </MantineProvider>

    </QueryClientProvider>
  )
}

export default App
