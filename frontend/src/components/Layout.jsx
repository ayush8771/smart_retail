import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const Layout = () => {
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState([]);
    const [systemStatus, setSystemStatus] = useState('Connecting...');

    useEffect(() => {
        // 1. Establish the Global Background Connection
        const socket = io('http://localhost:5000');

        socket.on('connect', () => setSystemStatus('Online'));
        socket.on('disconnect', () => setSystemStatus('Offline'));

        // 2. Listen for the exact events emitted by your backend/lib/socket.js
        const handleNewAlert = (data, type) => {
            const newAlert = {
                id: Date.now() + Math.random(), // Unique ID for the UI
                type: type, // 'critical' or 'warning'
                shelfId: data.shelfId,
                message: data.message,
                occupancy: data.occupancy_pct,
                time: new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            // Push the new alert to the screen
            setAlerts((prev) => [newAlert, ...prev]);
        };

        socket.on('alert:critical', (data) => handleNewAlert(data, 'critical'));
        socket.on('alert:warning', (data) => handleNewAlert(data, 'warning'));

        return () => {
            socket.disconnect();
        };
    }, []);

    // --- Action Handlers ---
    const handleIgnore = (alertId) => {
        // Dismiss the notification from the screen
        setAlerts((prev) => prev.filter(alert => alert.id !== alertId));
    };

    const handleRestock = (alertId) => {
        // Dismiss the notification AND instantly route the manager to the Shelf Management page
        // where the AI has already queued up the specific restock task!
        setAlerts((prev) => prev.filter(alert => alert.id !== alertId));
        navigate('/shelves');
    };

    const navItems = [
        { path: '/', label: 'Dashboard' },
        { path: '/shelves', label: 'Shelf Management' },
        { path: '/detect', label: 'Camera Diagnostics' }, // Renamed slightly since it's just for testing now
        { path: '/analytics', label: 'Analytics' },
    ];

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans relative">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white border-r border-gray-200 shadow-sm flex flex-col z-10">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-2xl font-bold text-blue-700 tracking-tight">Smart Retail</h1>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `block px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main Workspace Area */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Top Header */}
                <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4 flex items-center justify-between z-10">
                    <h2 className="text-lg font-medium text-gray-700">Manager Portal</h2>
                    <div className="flex items-center gap-4">
                        {/* Background AI Status Indicator */}
                        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 ${systemStatus === 'Online' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                            <span className={`h-2 w-2 rounded-full ${systemStatus === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                            AI Background Engine: {systemStatus}
                        </div>
                    </div>
                </header>

                {/* Dynamic Page Content */}
                <div className="flex-1 overflow-auto p-8 relative">
                    <Outlet />
                </div>
            </main>

            {/* --- NEW: Global Floating Alert Overlay --- */}
            <div className="absolute bottom-8 right-8 z-50 flex flex-col gap-4 max-w-sm w-full pointer-events-none">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className={`pointer-events-auto p-5 rounded-xl shadow-2xl border-l-4 animate-slide-up ${alert.type === 'critical'
                            ? 'bg-white border-red-500'
                            : 'bg-white border-amber-500'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className={`font-bold text-sm uppercase tracking-wide ${alert.type === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                                    {alert.type === 'critical' ? 'Stockout Imminent' : 'Low Stock Warning'}
                                </h4>
                                <p className="font-mono text-xs text-gray-400 mt-1">{alert.time} • Shelf {alert.shelfId}</p>
                            </div>
                            <span className={`text-lg font-black ${alert.type === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                                {alert.occupancy}%
                            </span>
                        </div>

                        <p className="text-gray-700 text-sm mt-3 font-medium leading-relaxed">
                            {alert.message}
                        </p>

                        <div className="mt-4 flex gap-3">
                            <button
                                onClick={() => handleIgnore(alert.id)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold transition-colors"
                            >
                                Ignore
                            </button>
                            <button
                                onClick={() => handleRestock(alert.id)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                            >
                                Restock Now
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Layout;