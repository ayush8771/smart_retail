import { useState, useEffect } from 'react';
import apiClient from '../api';

const Shelves = () => {
    const [shelves, setShelves] = useState([]);
    const [restockTasks, setRestockTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processingId, setProcessingId] = useState(null);

    const [isShelfModalOpen, setIsShelfModalOpen] = useState(false);
    const [editingShelf, setEditingShelf] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Updated form state to match your Prisma database schema
    const [formData, setFormData] = useState({
        id: '',
        name: ''
    });

    const fetchData = async () => {
        try {
            const [shelvesRes, restockRes] = await Promise.all([
                apiClient.get('/shelves').catch(() => ({ data: [] })),
                apiClient.get('/restock').catch(() => ({ data: [] }))
            ]);
            setShelves(shelvesRes.data || []);
            setRestockTasks(restockRes.data || []);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError('Failed to load data. Ensure the backend is running.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleResolveTask = async (taskId) => {
        setProcessingId(taskId);
        try {
            await apiClient.patch(`/restock/${taskId}/resolve`);
            await fetchData();
        } catch (err) {
            alert('Error resolving task.');
        } finally {
            setProcessingId(null);
        }
    };

    const openAddModal = () => {
        setEditingShelf(null);
        setFormData({ id: '', name: '' });
        setIsShelfModalOpen(true);
    };

    const openEditModal = (shelf) => {
        setEditingShelf(shelf);
        setFormData({ id: shelf.id, name: shelf.name || '' });
        setIsShelfModalOpen(true);
    };

    const closeShelfModal = () => {
        setIsShelfModalOpen(false);
        setEditingShelf(null);
    };

    const handleShelfSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingShelf) {
                await apiClient.put(`/shelves/${editingShelf.id}`, formData);
            } else {
                await apiClient.post('/shelves', formData);
            }
            await fetchData();
            closeShelfModal();
        } catch (err) {
            console.error('Failed to save shelf:', err);
            alert('Error saving shelf. Check backend terminal for required fields.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="text-gray-500 font-medium animate-pulse">Loading inventory data...</div>;
    if (error) return <div className="text-red-500 font-medium bg-red-50 p-4 rounded-lg border border-red-200">{error}</div>;

    return (
        <div className="space-y-8 relative">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Shelf Management</h2>
                <button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                    + Add New Shelf
                </button>
            </div>

            {/* Restock Queue Panel */}
            {restockTasks.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </span>
                        <h3 className="text-lg font-bold text-amber-900">Pending Restock Tasks ({restockTasks.length})</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {restockTasks.map((task) => (
                            <div key={task.id} className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-semibold text-gray-800">{task.product}</span>
                                        <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {task.priority || 'Alert'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600">Shelf: <span className="font-medium text-gray-800">{task.shelf_name || task.shelf_id}</span></p>
                                    <div className="mt-3 p-2 bg-gray-50 rounded-md border border-gray-100">
                                        <p className="text-xs text-gray-500">Recommended action:</p>
                                        <p className="text-sm font-medium text-blue-700">Add {task.restock_qty} units</p>
                                    </div>
                                </div>
                                <button onClick={() => handleResolveTask(task.id)} disabled={processingId === task.id} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-70">
                                    {processingId === task.id ? 'Resolving...' : 'Mark as Restocked'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Table Update to Match Database Schema */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-semibold text-gray-700">All Active Shelves</h3>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shelf ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Occupancy</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {shelves.length === 0 ? (
                            <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No shelves found.</td></tr>
                        ) : (
                            shelves.map((shelf) => (
                                <tr key={shelf.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{shelf.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{shelf.name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{shelf.occupancy_pct}%</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${shelf.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {shelf.status === 'ok' ? 'Healthy' : 'Needs Attention'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                        <button onClick={() => openEditModal(shelf)} className="text-blue-600 hover:text-blue-900">Edit</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* The Create/Edit Modal */}
            {isShelfModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-semibold text-gray-800">
                                {editingShelf ? 'Edit Shelf Details' : 'Register New Shelf'}
                            </h3>
                            <button onClick={closeShelfModal} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleShelfSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shelf ID</label>
                                <input
                                    type="text"
                                    required
                                    disabled={!!editingShelf}
                                    value={formData.id}
                                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                    className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 outline-none"
                                    placeholder="e.g., A1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shelf Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g., Snacks Aisle"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={closeShelfModal} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-70">
                                    {isSubmitting ? 'Saving...' : 'Save Shelf'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Shelves;