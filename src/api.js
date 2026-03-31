const protocol = window.location.protocol;
const hostname = window.location.hostname;
const port = window.location.port;

// 1. Kiểm tra môi trường Electron (chạy từ file://) hay Web (http/https)
const isElectronFile = protocol === 'file:';

// 2. Kiểm tra xem có đang chạy trong Electron không (cả file:// lẫn http:// khi dev)
const isElectronRuntime = typeof window !== 'undefined' && 
    (typeof window.require !== 'undefined' || navigator.userAgent.includes('Electron'));

let url;

if (isElectronFile) {
    // Trong Electron app khi load file nội bộ (production), trỏ về backend chạy tại localhost:3001
    url = 'http://localhost:3001';
} else if (isElectronRuntime && import.meta.env.DEV) {
    // Electron DEV mode: load từ Vite (localhost:5173) nhưng backend chạy ở port 3001
    url = `${protocol}//${hostname}:3001`;
} else if (import.meta.env.DEV) {
    // Nếu đang chạy Vite Dev server (npm run dev) từ browser, trỏ về cùng Host nhưng Cổng Backend là 3001
    url = `${protocol}//${hostname}:3001`;
} else {
    // Nếu truy cập qua IP LAN hoặc Cloudflare Tunnel (https://domain.com)
    // thì backend và frontend thường chạy chung origin hoặc được proxy chung
    // window.location.origin sẽ là URL chính xác nhất (ví dụ: https://my-cafe.trycloudflare.com)
    url = window.location.origin;
}

// Global fetch interceptor to inject Authorization token
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    
    // Check if the request is going to our API
    if (typeof resource === 'string' && resource.startsWith(url + '/api')) {
        config = config || {};
        
        // Don't inject token for auth routes
        if (!resource.startsWith(url + '/api/auth/')) {
            const token = localStorage.getItem('authToken');
            if (token) {
                config.headers = {
                    ...config.headers,
                    'Authorization': `Bearer ${token}`
                };
            }
        }
        
        const response = await originalFetch(resource, config);
        
        // Handle global 401 Unauthorized
        if (response.status === 401 && !resource.startsWith(url + '/api/auth/')) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userName');
            
            // Only force redirect to login if the user is on a protected route
            const currentHash = window.location.hash || '';
            if (currentHash.startsWith('#/admin')) {
                window.location.hash = '#/login'; 
            }
        }
        
        return response;
    }
    
    return originalFetch(...args);
};

export const SERVER_URL = url;
export const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
        return imagePath;
    }
    if (imagePath.startsWith('/')) {
        return `${SERVER_URL}${imagePath}`;
    }
    return `${SERVER_URL}/${imagePath}`;
};

export default SERVER_URL;

