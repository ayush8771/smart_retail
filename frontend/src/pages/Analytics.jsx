import { useState, useEffect } from 'react';
import apiClient from '../api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const Analytics = () => {
    const [analyticsData, setAnalyticsData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const response = await apiClient.get('/analytics/sales');
                if (response.data) {
                    setAnalyticsData(response.data);
                }
            } catch (err) {
                console.error('Error fetching analytics:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, []);

    // --- NEW: CSV Export Function ---
    const handleExportCSV = () => {
        if (!analyticsData) return;

        // 1. Build the CSV string
        let csvContent = "Smart Retail Analytics Report\n\n";

        // Section 1: Weekly Revenue
        csvContent += "--- 7-Day Revenue ---\n";
        csvContent += "Day,Revenue ($)\n";
        analyticsData.weekly.forEach(row => {
            csvContent += `${row.day},${row.sales}\n`;
        });

        csvContent += "\n";

        // Section 2: Top Products
        csvContent += "--- Top 5 Products ---\n";
        csvContent += "Product Name,Units Sold\n";
        analyticsData.top_products.forEach(row => {
            // Wrap the name in quotes to prevent commas in product names from breaking the CSV layout
            const safeName = row.name.replace(/"/g, '""');
            csvContent += `"${safeName}",${row.units}\n`;
        });

        // 2. Create a Blob and trigger the download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        // Set filename to include today's date
        const dateString = new Date().toISOString().split('T')[0];
        link.setAttribute("href", url);
        link.setAttribute("download", `smart_retail_report_${dateString}.csv`);

        // Append, click, and clean up
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <div className="text-gray-500 font-medium animate-pulse">Loading live sales data...</div>;
    if (!analyticsData) return <div className="text-red-500 font-medium bg-red-50 p-4 rounded-lg">Failed to load analytics data.</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Sales & Analytics</h2>
                <div className="flex gap-2">
                    <select className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-3 py-2 outline-none">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                        <option>This Year</option>
                    </select>
                    {/* Wired up the Export Button! */}
                    <button
                        onClick={handleExportCSV}
                        className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {analyticsData.recommendations && analyticsData.recommendations.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-blue-800 font-semibold mb-2">System Insights</h3>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                        {analyticsData.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">7-Day Revenue ($)</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analyticsData.weekly}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend iconType="circle" />
                                <Bar dataKey="sales" name="Revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Products (Units Sold)</h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analyticsData.top_products} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend iconType="circle" />
                                <Bar dataKey="units" name="Units Sold" fill="#10B981" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;