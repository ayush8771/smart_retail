import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // This applies your Tailwind CSS styling
import App from './App.jsx'; // This loads our router and Layout

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);