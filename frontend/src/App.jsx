import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Shelves from './pages/Shelves';
import Detect from './pages/Detect';
import Analytics from './pages/Analytics';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="shelves" element={<Shelves />} />
                    <Route path="detect" element={<Detect />} />
                    <Route path="analytics" element={<Analytics />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;