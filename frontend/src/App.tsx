// import './App.css'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/dashboard/dashboard'
import Creators from './pages/creators/creators'
import { createTheme, MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
    colors: {
     'ocean': ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0',
      '#0D47A1'],
    },
    components: {
       Container: {
         defaultProps: {
           size: 'xl',
         },
       },
       Title: {
         styles: {
           root: { color: '#1a1a1a', letterSpacing: '-0.5px' },
         },
       },
     },
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
