import { useState, useEffect } from 'react';
import apiClient from '../api';

const priorityStyle = (priority) => {
    if (priority === 'critical') return { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', row: 'border-red-200' };
    if (priority === 'warning') return { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', row: 'border-amber-200' };
    return { dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700', row: 'border-gray-100' };
};

const Restock = () => {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [resolving, setResolving] = useState(null);

    const fetchQueue = async () => {
        try {
            const res = await apiClient.get('/restock');
            setQueue(res.data);
        } catch (err) {
            console.error('Failed to fetch restock queue:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleResolve = async (id) => {
        setResolving(id);
        try {
            await apiClient.patch(`/restock/${id}/resolve`);
            setQueue(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error('Failed to resolve:', err);
        } finally {
            setResolving(null);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <p className="text-gray-400 animate-pulse">Loading restock queue...</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Restock Queue</h2>
                <span className="bg-gray-100 text-gray-600 text-sm font-semibold px-3 py-1 rounded-full">
                    {queue.length} item{queue.length !== 1 ? 's' : ''}
                </span>
            </div>

            {queue.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="text-gray-500 font-medium">All shelves are fully stocked!</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {queue.map((item) => {
                        const style = priorityStyle(item.priority);
                        return (
                            <div
                                key={item.id}
                                className={`bg-white rounded-xl border p-5 flex items-center justify-between gap-4 shadow-sm ${style.row}`}
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <span className={`h-3 w-3 rounded-full flex-shrink-0 ${style.dot}`}></span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-gray-800 capitalize">{item.product}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${style.badge}`}>
                                                {item.priority}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400 mt-0.5">
                                            {item.shelf_name || item.shelf_id} · Zone: {item.zone}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">{item.reason}</p>
                                    </div>
                                </div>

                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-700">
                                        Reorder: <span className="text-blue-600">{item.restock_qty} units</span>
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Stockout in <span className="font-semibold text-red-500">{item.days_to_stockout}d</span>
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleResolve(item.id)}
                                    disabled={resolving === item.id}
                                    className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    {resolving === item.id ? '...' : '✓ Done'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Restock;