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
    // Dùng 127.0.0.1 thay vì localhost để tránh IPv6 DNS resolution delay (~2s trên macOS)
    // macOS có thể thử kết nối ::1 (IPv6) trước khi fallback về 127.0.0.1 (IPv4) → gây lag
    url = 'http://127.0.0.1:3001';
} else {
    // Web Mode & Vite Dev Server: Do đã cấu hình Proxy ở vite.config.js,
    // ta cứ gọi vào chính origin hiện tại. Proxy sẽ tự forward /api sang backend 3001.
    // Cloudflare Tunnel cũng sẽ nhận request và proxy an toàn.
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

