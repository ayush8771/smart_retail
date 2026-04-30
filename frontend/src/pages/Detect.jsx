import { useState } from 'react';
import apiClient from '../api';

const Detect = () => {
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);
    const [logs, setLogs] = useState([]);
    const [selectedShelf, setSelectedShelf] = useState('shelf_05');
    const [imagePreview, setImagePreview] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);

    const shelves = [
        { id: 'shelf_01', name: 'Aisle 1 - Snacks' },
        { id: 'shelf_02', name: 'Aisle 2 - Sports' },
        { id: 'shelf_03', name: 'Aisle 3 - Personal Care' },
        { id: 'shelf_04', name: 'Aisle 4 - Masala' },
        { id: 'shelf_05', name: 'Aisle 5 - Noodles' },
        { id: 'shelf_06', name: 'Aisle 6 - Oils & Health' },
        { id: 'shelf_07', name: 'Aisle 7 - Beverages' },
    ];

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
            setImageBase64(reader.result.split(',')[1]);
        };
        reader.readAsDataURL(file);
    };

    const handleDemoImage = async () => {
        try {
            const res = await fetch('/shelf_demo.jpg');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setImagePreview(url);
            const b64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
            setImageBase64(b64);
            addLog('Demo image loaded ✅');
        } catch {
            addLog('❌ Failed to load demo image — make sure shelf_demo.jpg is in frontend/public/');
        }
    };

    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    };

    const handleScan = async () => {
        if (!imageBase64) {
            addLog('❌ No image selected. Upload an image or load demo image first.');
            return;
        }
        setScanning(true);
        setResult(null);
        addLog(`Sending image to YOLO for ${selectedShelf}...`);

        try {
            const res = await apiClient.post(`/detect/scan/${selectedShelf}`, {
                imageBase64
            });
            const data = res.data;
            setResult(data);

            addLog(`✅ Scan complete — ${data.total_gaps} gap(s) detected`);

            if (data.total_gaps === 0) {
                addLog('Shelf appears fully stocked');
            } else {
                data.gap_alerts?.forEach(alert => {
                    addLog(`🔴 GAP: ${alert.product_name} | ${alert.priority?.toUpperCase()} | ${alert.hours_until_stockout}h left`);
                    addLog(`   Prophet forecast: ${alert.predicted_daily_demand} units/day demand`);
                    addLog(`   Alert pushed to Node → WebSocket → Dashboard`);
                });
            }
        } catch (err) {
            addLog(`❌ Error: ${err.response?.data?.error || err.message}`);
            addLog('Check: Is FastAPI running on port 8000?');
        } finally {
            setScanning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Camera Diagnostics</h2>
                <span className="text-xs text-gray-400 font-mono bg-gray-100 px-3 py-1 rounded-full">
                    YOLO + Prophet Pipeline
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left — Controls */}
                <div className="space-y-4">

                    {/* Shelf selector */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Shelf</label>
                        <select
                            value={selectedShelf}
                            onChange={e => setSelectedShelf(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {shelves.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Image upload */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
                        <label className="block text-sm font-semibold text-gray-700">Shelf Image</label>

                        <div className="flex gap-2">
                            <label className="flex-1 cursor-pointer bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-lg px-4 py-3 text-center text-sm text-gray-500 transition-colors">
                                📁 Upload Image
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                            </label>
                            <button
                                onClick={handleDemoImage}
                                className="flex-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
                            >
                                🎯 Load Demo Image
                            </button>
                        </div>

                        {imagePreview && (
                            <img
                                src={imagePreview}
                                alt="Shelf preview"
                                className="w-full rounded-lg border border-gray-200 object-cover max-h-48"
                            />
                        )}
                    </div>

                    {/* Scan button */}
                    <button
                        onClick={handleScan}
                        disabled={scanning || !imageBase64}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl font-semibold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        {scanning ? (
                            <>
                                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Running YOLO + Prophet...
                            </>
                        ) : (
                            '🔍 Run Detection Scan'
                        )}
                    </button>

                    {/* Result summary */}
                    {result && (
                        <div className={`rounded-xl border p-4 text-sm ${result.total_gaps > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                            <p className="font-bold text-gray-800 mb-2">
                                {result.total_gaps > 0 ? `🔴 ${result.total_gaps} Gap(s) Detected` : '✅ Shelf Fully Stocked'}
                            </p>
                            {result.gap_alerts?.map((alert, i) => (
                                <div key={i} className="mt-2 p-2 bg-white rounded-lg border border-red-100">
                                    <p className="font-semibold text-gray-800 capitalize">{alert.product_name}</p>
                                    <p className="text-gray-500 text-xs mt-0.5">
                                        Priority: <span className={`font-bold uppercase ${alert.priority === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>{alert.priority}</span>
                                        {' · '}Stockout in {alert.hours_until_stockout}h
                                        {' · '}Demand: {alert.predicted_daily_demand}/day
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right — Live Logs */}
                <div className="bg-gray-950 rounded-xl shadow-sm overflow-hidden flex flex-col h-[500px]">
                    <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Pipeline Logs</span>
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
                        {logs.length === 0 ? (
                            <p className="text-gray-600">Waiting for scan...</p>
                        ) : (
                            logs.map((log, i) => (
                                <p key={i} className={`leading-relaxed ${log.includes('❌') ? 'text-red-400' :
                                        log.includes('🔴') ? 'text-red-300' :
                                            log.includes('✅') ? 'text-emerald-400' :
                                                log.includes('Prophet') ? 'text-blue-300' :
                                                    'text-gray-400'
                                    }`}>
                                    {log}
                                </p>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Detect;