import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const Dashboard = () => {
    const [socketStatus, setSocketStatus] = useState('Connecting...');

    useEffect(() => {
        // Establish connection to the backend Socket.io server
        const socket = io('http://localhost:5000');

        socket.on('connect', () => {
            setSocketStatus('Connected');
        });

        socket.on('disconnect', () => {
            setSocketStatus('Disconnected');
        });

        // Clean up the connection when the component unmounts
        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">System Overview</h2>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${socketStatus === 'Connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                    <span className={`h-2 w-2 rounded-full ${socketStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    Live Server: {socketStatus}
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Metric Card 1 */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Shelves</span>
                    <span className="text-4xl font-bold text-blue-600 mt-2">12</span>
                    <span className="text-sm text-gray-400 mt-2">Currently monitored</span>
                </div>

                {/* Metric Card 2 */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Restock Alerts</span>
                    <span className="text-4xl font-bold text-amber-500 mt-2">3</span>
                    <span className="text-sm text-gray-400 mt-2">Requires immediate attention</span>
                </div>

                {/* Metric Card 3 */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Today's Detections</span>
                    <span className="text-4xl font-bold text-indigo-600 mt-2">1,204</span>
                    <span className="text-sm text-gray-400 mt-2">Items processed</span>
                </div>
            </div>

            {/* Placeholder for future charts or live feeds */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-64 flex items-center justify-center">
                <p className="text-gray-400 text-lg font-medium">Activity graph loading...</p>
            </div>
        </div>
    );
};

export default Dashboard;