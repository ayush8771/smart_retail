import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Shelves from './pages/Shelves';
import Restock from './pages/Restock';
import Analytics from './pages/Analytics';
import Wishlist from './pages/Wishlist';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="shelves" element={<Shelves />} />
                    <Route path="restock" element={<Restock />} />
                    <Route path="wishlist" element={<Wishlist />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="*" element={<Navigate to="/" />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;