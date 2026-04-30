import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import apiClient from '../api';

const socket = io('http://localhost:5000');

const statusColor = (status) => {
    if (status === 'critical') return 'border-red-500 bg-red-50';
    if (status === 'warning') return 'border-amber-400 bg-amber-50';
    return 'border-emerald-400 bg-emerald-50';
};

const statusBadge = (status) => {
    if (status === 'critical') return 'bg-red-100 text-red-700';
    if (status === 'warning') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
};

const priorityStyle = (priority) => {
    if (priority === 'critical') return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', row: 'border-red-200' };
    if (priority === 'warning') return { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', row: 'border-amber-200' };
    return { dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700', row: 'border-gray-100' };
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [shelves, setShelves] = useState([]);
    const [stats, setStats] = useState({ total: 0, critical: 0, restock: 0 });
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [restockList, setRestockList] = useState([]);

    const fetchShelves = async () => {
        try {
            const res = await apiClient.get('/shelves');
            const data = res.data;
            setShelves(data);
            setStats({
                total: data.length,
                critical: data.filter(s => s.status === 'critical').length,
                restock: data.filter(s => s.status !== 'ok').length,
            });
        } catch (err) {
            console.error('Failed to fetch shelves:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchShelves();
        const interval = setInterval(fetchShelves, 30000);

        // WebSocket — listen for real-time alerts
        socket.on('restock_alert', (data) => {
            // add alert — never auto-dismiss
            setAlerts(prev => {
                const exists = prev.find(a => a.product_id === data.product_id);
                if (exists) {
                    return prev.map(a => a.product_id === data.product_id ? { ...a, ...data } : a);
                }
                return [data, ...prev];
            });

            // update restock priority list
            setRestockList(prev => {
                const filtered = prev.filter(r => r.product_id !== data.product_id);
                const entry = {
                    product_id: data.product_id,
                    product_name: data.product_name,
                    priority: data.priority,
                    hours_until_stockout: data.hours_until_stockout,
                    predicted_daily_demand: data.predicted_daily_demand,
                    recommended_qty: Math.ceil(data.predicted_daily_demand * 3),
                };
                const updated = [entry, ...filtered];
                updated.sort((a, b) => {
                    const order = { critical: 0, warning: 1, ok: 2 };
                    return order[a.priority] - order[b.priority] || a.hours_until_stockout - b.hours_until_stockout;
                });
                return updated;
            });

            // refresh shelf heatmap
            fetchShelves();
        });

        return () => {
            clearInterval(interval);
            socket.off('restock_alert');
        };
    }, []);

    const handleDemoScan = async () => {
        setScanning(true);
        setScanResult(null);
        try {
            const imgRes = await fetch('/shelf_demo.jpg');
            const blob = await imgRes.blob();
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
            const res = await apiClient.post('/detect/scan/shelf_05', { imageBase64: base64 });
            setScanResult(res.data);
            await fetchShelves();
        } catch (err) {
            console.error('Demo scan failed:', err);
            setScanResult({ error: 'Scan failed — is FastAPI running on port 8000?' });
        } finally {
            setScanning(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <p className="text-gray-400 animate-pulse">Loading shelf data...</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">System Overview</h2>
                <button
                    onClick={handleDemoScan}
                    disabled={scanning}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
                >
                    {scanning ? (
                        <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>Scanning...</>
                    ) : <>🎯 Demo Scan</>}
                </button>
            </div>

            {/* Scan Result Banner */}
            {scanResult && (
                <div className={`p-4 rounded-xl border text-sm font-medium ${scanResult.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                    {scanResult.error ? `❌ ${scanResult.error}` : `✅ Scan complete — ${scanResult.total_gaps} gap(s) detected on shelf_05.`}
                </div>
            )}

            {/* Persistent Alert Banner — never vanishes */}
            {alerts.length > 0 && (
                <div className="space-y-2">
                    {alerts.map((alert) => (
                        <div
                            key={alert.product_id}
                            className={`flex items-center justify-between p-4 rounded-xl border font-medium text-sm ${alert.priority === 'critical'
                                    ? 'bg-red-50 border-red-400 text-red-800'
                                    : 'bg-amber-50 border-amber-400 text-amber-800'
                                }`}
                        >
                            <span>
                                {alert.priority === 'critical' ? '🔴' : '🟡'}{' '}
                                <strong>{alert.product_name}</strong> on {alert.shelf_id} —
                                Stockout in <strong>{alert.hours_until_stockout?.toFixed(1)}h</strong>.
                                Demand: {alert.predicted_daily_demand?.toFixed(1)} units/day.
                            </span>
                            <button
                                onClick={() => setAlerts(prev => prev.filter(a => a.product_id !== alert.product_id))}
                                className="ml-4 text-gray-400 hover:text-gray-600 text-lg font-bold flex-shrink-0"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Shelves</span>
                    <span className="text-4xl font-bold text-blue-600 mt-2 block">{stats.total}</span>
                    <span className="text-sm text-gray-400 mt-1 block">Currently monitored</span>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Critical Alerts</span>
                    <span className="text-4xl font-bold text-red-500 mt-2 block">{stats.critical}</span>
                    <span className="text-sm text-gray-400 mt-1 block">Immediate attention needed</span>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Restock Needed</span>
                    <span className="text-4xl font-bold text-amber-500 mt-2 block">{stats.restock}</span>
                    <span className="text-sm text-gray-400 mt-1 block">Shelves below threshold</span>
                </div>
            </div>

            {/* Shelf Heatmap */}
            <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Shelf Status Heatmap</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {shelves.map((shelf) => (
                        <div
                            key={shelf.id}
                            onClick={() => navigate('/shelves')}
                            className={`cursor-pointer p-4 rounded-xl border-2 transition-all hover:shadow-md ${statusColor(shelf.status)}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-sm font-semibold text-gray-700 leading-tight">{shelf.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${statusBadge(shelf.status)}`}>
                                    {shelf.status}
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-3xl font-black text-gray-800">{shelf.occupancy_pct}%</span>
                                <p className="text-xs text-gray-400 mt-1">occupancy</p>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                {shelf.last_scanned
                                    ? `Scanned: ${new Date(shelf.last_scanned).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                    : 'Not yet scanned'}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Restock Priority List */}
            {restockList.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">🔁 Restock Priority List</h3>
                    <div className="space-y-3">
                        {restockList.map((item, index) => {
                            const style = priorityStyle(item.priority);
                            return (
                                <div
                                    key={item.product_id}
                                    className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-4 shadow-sm ${style.row}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-400 font-bold text-sm w-5">{index + 1}</span>
                                        <span className={`h-3 w-3 rounded-full flex-shrink-0 ${style.dot}`}></span>
                                        <div>
                                            <p className="font-semibold text-gray-800 capitalize">{item.product_name}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Demand: {item.predicted_daily_demand?.toFixed(1)} units/day
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${style.badge}`}>
                                            {item.priority}
                                        </span>
                                        <p className="text-sm font-bold text-blue-600 mt-1">
                                            Reorder: {item.recommended_qty} units
                                        </p>
                                        <p className="text-xs text-red-500 font-semibold mt-0.5">
                                            Stockout in {item.hours_until_stockout?.toFixed(1)}h
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;