import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

// ── Alert Card with auto-dismiss ─────────────────────────────────────────────
const AlertCard = ({ alert, onIgnore, onRestock }) => {
    const [visible, setVisible] = useState(true);
    const [timeLeft, setTimeLeft] = useState(8);
    const timerRef = useRef(null);

    useEffect(() => {
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setVisible(false);
                    setTimeout(() => onIgnore(alert.id), 300);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    if (!visible) return null;

    return (
        <div className={`pointer-events-auto p-4 rounded-xl shadow-2xl border-l-4 bg-white transition-all duration-300 ${alert.type === 'critical' ? 'border-red-500' : 'border-amber-500'
            }`}>
            <div className="flex justify-between items-start">
                <div>
                    <h4 className={`font-bold text-sm uppercase tracking-wide ${alert.type === 'critical' ? 'text-red-600' : 'text-amber-600'
                        }`}>
                        {alert.type === 'critical' ? '🔴 Stockout Imminent' : '🟡 Low Stock Warning'}
                    </h4>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">{alert.time} · {alert.shelfId}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xl font-black ${alert.type === 'critical' ? 'text-red-500' : 'text-amber-500'
                        }`}>{alert.hoursLeft}h</span>
                    <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{timeLeft}s</span>
                </div>
            </div>
            <p className="text-gray-700 text-sm mt-2 leading-relaxed">{alert.message}</p>
            <div className="mt-3 flex gap-2">
                <button onClick={() => { setVisible(false); setTimeout(() => onIgnore(alert.id), 300); }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg text-xs font-semibold">
                    Ignore
                </button>
                <button onClick={() => { setVisible(false); setTimeout(() => onRestock(alert.id), 300); }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-xs font-semibold">
                    Restock Now
                </button>
            </div>
        </div>
    );
};

// ── Wishlist Toast ────────────────────────────────────────────────────────────
const WishlistToast = ({ toast, onDismiss }) => {
    const [visible, setVisible] = useState(true);
    const timerRef = useRef(null);

    useEffect(() => {
        timerRef.current = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
        }, 6000);
        return () => clearTimeout(timerRef.current);
    }, []);

    if (!visible) return null;

    return (
        <div className="pointer-events-auto p-4 rounded-xl shadow-2xl border-l-4 border-purple-500 bg-white">
            <div className="flex justify-between items-start">
                <h4 className="font-bold text-sm text-purple-700 uppercase tracking-wide">
                    🛒 Wishlist Request
                </h4>
                <button onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
                    className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            <p className="text-gray-700 text-sm mt-1">
                <span className="font-semibold">{toast.user_name}</span> wants{' '}
                <span className="font-semibold text-purple-700">{toast.product_name}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Check Wishlist tab to review</p>
        </div>
    );
};

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout = () => {
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState([]);
    const [wishlistToasts, setWishlistToasts] = useState([]);
    const [wishlistCount, setWishlistCount] = useState(0);
    const [systemStatus, setSystemStatus] = useState('Connecting...');

    useEffect(() => {
        // fetch initial unnotified wishlist count
        fetch('http://localhost:5000/api/wishlist/count')
            .then(r => r.json())
            .then(d => setWishlistCount(d.count || 0))
            .catch(() => { });

        socket.on('connect', () => setSystemStatus('Online'));
        socket.on('disconnect', () => setSystemStatus('Offline'));

        // restock alert from YOLO + Prophet
        socket.on('restock_alert', (data) => {
            setAlerts(prev => [{
                id: Date.now() + Math.random(),
                type: data.priority,
                shelfId: data.shelf_id,
                productName: data.product_name,
                hoursLeft: Number(data.hours_until_stockout).toFixed(1),
                message: `AI Forecast: ${data.product_name} will run out in ~${Number(data.hours_until_stockout).toFixed(1)}h. (Demand: ${Number(data.predicted_daily_demand).toFixed(1)}/day)`,
                time: new Date(data.forecasted_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }, ...prev]);
        });

        // wishlist notification from customer
        socket.on('wishlist:new', (data) => {
            setWishlistCount(data.count || 0);
            setWishlistToasts(prev => [{
                id: Date.now() + Math.random(),
                user_name: data.user_name,
                product_name: data.product_name,
            }, ...prev]);
        });

        return () => {
            socket.off('restock_alert');
            socket.off('wishlist:new');
        };
    }, []);

    const handleIgnore = (id) => setAlerts(prev => prev.filter(a => a.id !== id));
    const handleRestock = (id) => { setAlerts(prev => prev.filter(a => a.id !== id)); navigate('/restock'); };
    const dismissToast = (id) => setWishlistToasts(prev => prev.filter(t => t.id !== id));

    const navItems = [
        { path: '/', label: 'Dashboard' },
        { path: '/shelves', label: 'Shelf Management' },
        { path: '/restock', label: 'Restock Queue' },
        { path: '/wishlist', label: 'Wishlist', badge: wishlistCount },
        { path: '/analytics', label: 'Analytics' },
    ];

    const handleWishlistClick = async () => {
        // clear badge when manager opens wishlist
        setWishlistCount(0);
        await fetch('http://localhost:5000/api/wishlist/mark-notified', { method: 'PATCH' });
    };

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans relative">

            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 shadow-sm flex flex-col z-10">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-2xl font-bold text-blue-700 tracking-tight">Smart Retail</h1>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={item.path === '/wishlist' ? handleWishlistClick : undefined}
                            className={({ isActive }) =>
                                `flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`
                            }
                        >
                            <span>{item.label}</span>
                            {item.badge > 0 && (
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center animate-pulse">
                                    {item.badge}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4 flex items-center justify-between z-10">
                    <h2 className="text-lg font-medium text-gray-700">Manager Portal</h2>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 ${systemStatus === 'Online'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        <span className={`h-2 w-2 rounded-full ${systemStatus === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                        AI Engine: {systemStatus}
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-8">
                    <Outlet />
                </div>
            </main>

            {/* Restock Alerts */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none"
                style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {wishlistToasts.map(t => (
                    <WishlistToast key={t.id} toast={t} onDismiss={dismissToast} />
                ))}
                {alerts.map(alert => (
                    <AlertCard key={alert.id} alert={alert} onIgnore={handleIgnore} onRestock={handleRestock} />
                ))}
            </div>
        </div>
    );
};

export default Layout;