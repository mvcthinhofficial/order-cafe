module.exports = function(context) {
    const router = require('express').Router();
    const { 
        crypto, activeTokens, settings, staff, roles, log, 
        hashPassword, verifyPassword, saveData, isRemote, getRolePermissions 
    } = context;

    // Sinh mã khôi phục ngẫu nhiên (Ví dụ: ADMIN-A1B2C3D4)
    const generateRecoveryCode = () => {
        return 'ADMIN-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    };

    // 1. Phục hồi khẩn cấp / Đăng nhập dự phòng
    router.post('/login-recovery-code', (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Vui lòng nhập Mã khôi phục.' });

        if (isRemote(req)) {
            log(`[SECURITY] Chặn truy cập Mã khôi phục từ Remote.`);
            return res.status(403).json({ success: false, message: 'Tính năng Khôi phục không khả dụng khi truy cập từ xa để đảm bảo bảo mật. Vui lòng thực hiện trong mạng LAN.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const SESSION_TTL_RECOVERY = 2 * 60 * 60 * 1000; 

        if (settings.adminRecoveryCode && code.trim().toUpperCase() === settings.adminRecoveryCode.toUpperCase()) {
            const roleName = 'Quản lý';
            // Cấp quyền Admin hạn chế để bắt buộc đổi cấu hình
            activeTokens.set(token, { role: 'ADMIN', name: 'Quản lý', permissions: [], roleName, expiresAt: Date.now() + SESSION_TTL_RECOVERY, isRecovery: true });
            log(`Admin logged in via recovery code`);
            return res.json({ success: true, token, role: 'ADMIN', name: 'Quản lý', permissions: [], roleName, requirePasswordChange: true });
        }

        const s = staff.find(st => st.recoveryCode && st.recoveryCode.toUpperCase() === code.trim().toUpperCase());
        if (s) {
            const roleObj = roles.find(r => r.id === s.roleId);
            const roleName = roleObj ? roleObj.name : s.role;
            const permissions = getRolePermissions ? getRolePermissions(s.roleId, roleName) : [];
            activeTokens.set(token, { role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName, expiresAt: Date.now() + SESSION_TTL_RECOVERY, isRecovery: true });
            log(`Staff ${s.name} logged in via recovery code`);
            return res.json({ success: true, token, role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName, requirePasswordChange: true });
        }

        return res.status(404).json({ success: false, message: 'Mã khôi phục không chính xác.' });
    });

    // 2. Thay đổi thông tin Admin Tên Đăng Nhập & Mật khẩu
    router.post('/admin/credentials', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);

        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

        const { oldPassword, newUsername, newPassword, isRecoveryReset } = req.body;

        // Nếu người dùng đang reset qua mã khôi phục
        if (isRecoveryReset) {
            if (!user.isRecovery) {
                return res.status(403).json({ success: false, message: 'Thao tác không hợp lệ' });
            }
        } else {
            // Đổi mật khẩu bình thường cần kiểm tra pass cũ
            if (!verifyPassword(oldPassword, settings.adminPassword)) {
                return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác' });
            }
        }

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
        }
        if (!newUsername || newUsername.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập mới phải có ít nhất 3 ký tự' });
        }

        settings.adminUsername = newUsername.trim();
        settings.adminPassword = hashPassword(newPassword);
        
        // Tạo mã khôi phục phụ mới tinh
        const newRecoveryCode = generateRecoveryCode();
        settings.adminRecoveryCode = newRecoveryCode;
        
        saveData();
        log(`Admin credentials changed. New recovery code generated.`);
        
        // Hủy token khôi phục nếu có để ép họ đăng nhập lại bằng thông tin mới
        if (isRecoveryReset) {
            activeTokens.delete(token);
        }

        res.json({ 
            success: true, 
            message: 'Cập nhật tài khoản và mật khẩu thành công. LƯU LẠI MÃ KHÔI PHỤC MỚI!', 
            recoveryCode: newRecoveryCode 
        });
    });

    return router;
};
