import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL);

export function useRestockAlerts() {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        socket.on('restock_alert', (data) => {
            setAlerts(prev => {
                // deduplicate by product_id, keep most recent
                const filtered = prev.filter(a => a.product_id !== data.product_id);
                return [data, ...filtered];
            });
        });
        return () => socket.off('restock_alert');
    }, []);

    return alerts;
}