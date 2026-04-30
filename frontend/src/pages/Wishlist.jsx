import { useState, useEffect } from 'react';
import apiClient from '../api';

const DEMO_PRODUCTS = [
    { id: 'prod_01', name: 'act2 popcorn' },
    { id: 'prod_02', name: 'cricket ball' },
    { id: 'prod_03', name: 'dove intense repair shampoo' },
    { id: 'prod_04', name: 'everest label' },
    { id: 'prod_05', name: 'everest sambhar masala' },
    { id: 'prod_06', name: 'glutamine powder' },
    { id: 'prod_07', name: 'noodles 4 pack' },
    { id: 'prod_08', name: 'parachute advanced gold coconut oil' },
    { id: 'prod_09', name: 'parachute label' },
    { id: 'prod_10', name: 'patanjali atta noodles' },
    { id: 'prod_11', name: 'patanjali label' },
    { id: 'prod_12', name: 'patanjali noodles chatpata masala' },
    { id: 'prod_13', name: 'patanjali noodles chatpata masala 4 pack' },
    { id: 'prod_14', name: 'patanjali noodles yummy masala' },
    { id: 'prod_15', name: 'rasayana ayurvedic chai' },
    { id: 'prod_16', name: 'royal dry fruits badam giri' },
    { id: 'prod_17', name: 'royal label' },
];

const DEMO_USERS = ['Rahul', 'Priya', 'Anjali', 'Kiran', 'Suresh', 'Meena', 'Arjun'];

const Wishlist = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(DEMO_PRODUCTS[0].id);
    const [selectedUser, setSelectedUser] = useState(DEMO_USERS[0]);
    const [successMsg, setSuccessMsg] = useState('');
    const [customerNotifs, setCustomerNotifs] = useState([]);

    // restock date picker state
    const [restockTarget, setRestockTarget] = useState(null); // { itemId, productName, userName }
    const [restockDate, setRestockDate] = useState('');
    const [restocking, setRestocking] = useState(false);

    const fetchWishlist = async () => {
        try {
            const res = await apiClient.get('/wishlist');
            setItems(res.data);
        } catch (err) {
            console.error('Failed to fetch wishlist:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchWishlist(); }, []);

    const handleAdd = async () => {
        setAdding(true);
        setSuccessMsg('');
        try {
            await apiClient.post('/wishlist', {
                product_id: selectedProduct,
                user_name: selectedUser
            });
            const productName = DEMO_PRODUCTS.find(p => p.id === selectedProduct)?.name;
            setSuccessMsg(`✅ ${selectedUser} added ${productName} to wishlist — manager notified!`);
            await fetchWishlist();
        } catch (err) {
            console.error('Failed to add wishlist item:', err);
        } finally {
            setAdding(false);
        }
    };

    const handleIgnore = async (id) => {
        try {
            await apiClient.delete(`/wishlist/${id}`);
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (err) {
            console.error('Failed to ignore wishlist item:', err);
        }
    };

    const openRestockPicker = (item) => {
        setRestockTarget({
            itemId: item.id,
            productName: item.product?.name || item.product_id,
            userName: item.user_name
        });
        // default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setRestockDate(tomorrow.toISOString().split('T')[0]);
    };

    const handleRestockSubmit = async () => {
        if (!restockDate || !restockTarget) return;
        setRestocking(true);
        try {
            const formatted = new Date(restockDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            // simulate customer notification inside the demo panel
            const notif = {
                id: Date.now(),
                user_name: restockTarget.userName,
                productName: restockTarget.productName,
                date: formatted
            };
            setCustomerNotifs(prev => [notif, ...prev]);

            // remove from wishlist after scheduling
            await apiClient.delete(`/wishlist/${restockTarget.itemId}`);
            setItems(prev => prev.filter(i => i.id !== restockTarget.itemId));

            setRestockTarget(null);
            setRestockDate('');
        } catch (err) {
            console.error('Restock submit failed:', err);
        } finally {
            setRestocking(false);
        }
    };

    // group by product for demand summary
    const demandMap = {};
    items.forEach(item => {
        const name = item.product?.name || item.product_id;
        demandMap[name] = (demandMap[name] || 0) + 1;
    });
    const demandList = Object.entries(demandMap).sort((a, b) => b[1] - a[1]);

    // min date = today
    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Customer Wishlist</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full font-mono">
                    {items.length} request{items.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Demand Summary */}
            {demandList.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-purple-800 mb-3 uppercase tracking-wide">
                        📊 Most Requested Products
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {demandList.map(([name, count]) => (
                            <span key={name}
                                className="bg-white border border-purple-200 text-purple-700 text-sm font-semibold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                                {name}
                                <span className="bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                    {count}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Demo Panel */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                    🎯 Demo — Simulate Customer Wishlist Request
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Customer</label>
                        <select
                            value={selectedUser}
                            onChange={e => setSelectedUser(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {DEMO_USERS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Product (Out of Stock)</label>
                        <select
                            value={selectedProduct}
                            onChange={e => setSelectedProduct(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {DEMO_PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handleAdd}
                            disabled={adding}
                            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                            {adding ? 'Adding...' : '+ Add to Wishlist'}
                        </button>
                    </div>
                </div>

                {/* Manager added success */}
                {successMsg && (
                    <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                        {successMsg}
                    </p>
                )}

                {/* Customer notifications from manager restock confirmations */}
                {customerNotifs.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                            📬 Customer Notifications
                        </p>
                        {customerNotifs.map(notif => (
                            <div key={notif.id}
                                className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                                <span className="h-7 w-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {notif.user_name[0]}
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-blue-800">
                                        Hi {notif.user_name}! 👋
                                    </p>
                                    <p className="text-sm text-blue-700 mt-0.5">
                                        <span className="font-semibold capitalize">{notif.productName}</span> will
                                        be back in stock by{' '}
                                        <span className="font-bold">{notif.date}</span>.
                                        We'll keep it ready for you!
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Wishlist Items */}
            {loading ? (
                <p className="text-gray-400 animate-pulse text-center py-8">Loading wishlist...</p>
            ) : items.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <p className="text-4xl mb-3">🛒</p>
                    <p className="text-gray-500 font-medium">No wishlist requests yet</p>
                    <p className="text-gray-400 text-sm mt-1">Use the demo panel above to simulate a customer request</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-semibold text-gray-700 text-sm">All Requests</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <span className="h-8 w-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                                        {item.user_name?.[0] || 'C'}
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800 capitalize">
                                            {item.product?.name || item.product_id}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {item.user_name} · {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Restock button */}
                                    <button
                                        onClick={() => openRestockPicker(item)}
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        📅 Re-Stock
                                    </button>
                                    {/* Ignore button */}
                                    <button
                                        onClick={() => handleIgnore(item.id)}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Ignore
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Restock Date Picker Modal */}
            {restockTarget && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">Schedule Restock</h3>
                        <p className="text-sm text-gray-500">
                            Set expected restock date for{' '}
                            <span className="font-semibold text-gray-800 capitalize">
                                {restockTarget.productName}
                            </span>
                        </p>
                        <p className="text-xs text-gray-400">
                            Customer: <span className="font-semibold">{restockTarget.userName}</span> will be notified
                        </p>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                Expected Restock Date
                            </label>
                            <input
                                type="date"
                                min={today}
                                value={restockDate}
                                onChange={e => setRestockDate(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => { setRestockTarget(null); setRestockDate(''); }}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRestockSubmit}
                                disabled={restocking || !restockDate}
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
                            >
                                {restocking ? 'Confirming...' : 'Confirm & Notify'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Wishlist;