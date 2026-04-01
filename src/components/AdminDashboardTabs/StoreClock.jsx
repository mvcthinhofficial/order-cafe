import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const StoreClock = ({ storeTimezoneOffset }) => {
    const [timeStr, setTimeStr] = useState('');

    useEffect(() => {
        // Run immediately once
        const tick = () => {
            const now = new Date();
            const offsetParam = storeTimezoneOffset != null ? storeTimezoneOffset : now.getTimezoneOffset();
            const clientTime = new Date(now.getTime() - (offsetParam * 60 * 1000));
            
            const dd = String(clientTime.getUTCDate()).padStart(2, '0');
            const mm = String(clientTime.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = clientTime.getUTCFullYear();
            const h = String(clientTime.getUTCHours()).padStart(2, '0');
            const m = String(clientTime.getUTCMinutes()).padStart(2, '0');
            const s = String(clientTime.getUTCSeconds()).padStart(2, '0');

            setTimeStr(`${h}:${m}:${s} - ${dd}/${mm}/${yyyy}`);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [storeTimezoneOffset]);

    return <p className="text-[11px] font-black text-brand-600 tracking-widest mt-1 bg-brand-50 px-2 flex items-center justify-center py-0.5 border border-brand-100 min-w-[130px]" style={{ borderRadius: '8px' }}>{timeStr || '--:--:--'}</p>;
};

export default StoreClock;
