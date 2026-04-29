import { useState, useEffect } from 'react';
import apiClient from '../api';
import { io } from 'socket.io-client'; // NEW: Imported Socket.io

const Detect = () => {
    const [isFeedActive, setIsFeedActive] = useState(false);
    const [detections, setDetections] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // If the user hasn't initialized the feed, do nothing.
        if (!isFeedActive) return;

        // 1. Fetch the recent history first
        const fetchDetections = async () => {
            setLoading(true);
            try {
                const response = await apiClient.get('/detect');
                setDetections(response.data || []);
            } catch (err) {
                console.error('Error fetching detections:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDetections();

        // 2. Establish the Live Socket Connection
        const socket = io('http://localhost:5000');

        // NOTE: 'detection:new' is the event name we are listening for. 
        // If your backend emits a different name (like 'new_detection' or 'item_detected'), update it here!
        socket.on('detection:new', (newItem) => {
            // Instantly prepend the new item to the top of our list
            setDetections((prevDetections) => [newItem, ...prevDetections]);
        });

        // 3. Clean up the connection when the feed is stopped or component unmounts
        return () => {
            socket.disconnect();
        };
    }, [isFeedActive]);

    // The initial state: Hide the diagnostic/detection panel until triggered
    if (!isFeedActive) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <div className="bg-gray-100 p-6 rounded-full">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <h2 className="text-xl font-medium text-gray-700">Camera Feed Offline</h2>
                <p className="text-gray-500 max-w-md text-center">Start the live camera feed to begin monitoring shelf interactions and product detection.</p>
                <button
                    onClick={() => setIsFeedActive(true)}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                >
                    Initialize Video Feed
                </button>
            </div>
        );
    }

    // The active state: Video feed alongside the detection panel
    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Live Detection</h2>
                <button
                    onClick={() => setIsFeedActive(false)}
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-red-200"
                >
                    Stop Feed
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Video Feed Placeholder */}
                <div className="lg:col-span-2 bg-black rounded-xl overflow-hidden relative shadow-md flex items-center justify-center min-h-[400px]">
                    <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1.5 rounded-md text-sm font-mono flex items-center gap-2">
                        <span className="animate-pulse h-2 w-2 bg-red-500 rounded-full"></span>
                        CAM-01 / AISLE-A
                    </div>
                    <p className="text-gray-500 font-mono tracking-widest">CONNECTING TO VIDEO STREAM...</p>
                </div>

                {/* Detection Logs Panel */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden h-[500px]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700">Live Feed Logs</h3>
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <p className="text-sm text-gray-500 text-center py-4">Syncing detection logs...</p>
                        ) : detections.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">Listening for activity...</p>
                        ) : (
                            detections.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors bg-white shadow-sm">
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{item.productName || item.name || 'Unknown Item'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Confidence: {item.confidence ? (item.confidence * 100).toFixed(1) + '%' : 'N/A'}
                                        </p>
                                    </div>
                                    <span className="text-xs font-mono text-gray-400">
                                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Detect;