---
name: loyalty_voucher_integration
description: >
  Tích hợp Loyalty Voucher với hệ thống Promotions. Voucher tạo từ tab Khách Hàng
  phải được lưu đúng schema, filter theo specificPhone, deactivate singleUse,
  và hiển thị hint trong mọi giỏ hàng (POS, Kiosk, BillView).
---

# Skill: Loyalty Voucher ↔ Promotions Integration

## 1. Root Cause của các lỗi phổ biến

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Voucher tạo ra không hoạt động | `send-voucher` không lưu `type: 'PROMO_CODE'` và `code` vào JSON `data` | Xây full promoObj trước khi INSERT |
| Engine không nhận ra code | Voucher thiếu `type` field | Thêm `type: 'PROMO_CODE'` vào promoObj |
| Voucher không hiện cho đúng khách | Thiếu `specificPhone` filter trong engine | Thêm param `currentCustomerPhone` vào function |
| In-memory promotions không cập nhật | loyaltyRoute INSERT thẳng vào DB không qua `promotions` array | Gọi `reloadPromotions()` sau INSERT |

## 2. Schema Voucher chuẩn

```javascript
const promoObj = {
    id: promoId,
    name: `Voucher ${code}`,
    description: `${reason} — Dành riêng cho ${cust.name}`,
    type: 'PROMO_CODE',         // BẮT BUỘC
    code,                       // BẮT BUỘC — uppercase
    discountType,               // 'PERCENT' | 'FIXED'
    discountValue,
    minOrderValue: 0,
    maxDiscount: 0,
    applicableItems: ['ALL'],
    isActive: true,
    singleUse: true,            // Dùng 1 lần rồi deactivate
    specificPhone: cust.phone || null,
    specificCustomerId: cust.id,
    startDate: ts.split('T')[0],
    endDate: expiresAt,         // 'YYYY-MM-DD'
    ignoreGlobalDisable: true,  // Không bị tắt bởi global disable
    createdAt: ts,
};

// INSERT phải lưu TOÀN BỘ object vào field 'data':
db.prepare('INSERT INTO promotions (id, name, description, isActive, data) VALUES (?, ?, ?, 1, ?)')
  .run(promoId, promoObj.name, promoObj.description, JSON.stringify(promoObj));
```

## 3. Inject reloadPromotions vào loyaltyRoutes

**server.cjs:**
```javascript
const reloadPromotions = () => {
    promotions = db.prepare('SELECT * FROM promotions').all().map(row => JSON.parse(row.data || '{}'));
};
app.use('/api/loyalty', loyaltyRoutes({ db, activeTokens, log, getCurrentISOString, reloadPromotions }));
```

**loyaltyRoutes.cjs:**
```javascript
const { db, activeTokens, log, getCurrentISOString, reloadPromotions } = context;
// Sau INSERT:
if (reloadPromotions) reloadPromotions();
```

## 4. PromotionEngine — filter specificPhone

```javascript
// Signature thêm param cuối:
export const calculateCartWithPromotions = (cart, promotions, promoCodeInput, menu = [], selectedPromoId = null, enablePromotions = true, currentCustomerPhone = null) => {

// Trong loop activePromos.forEach:
if (promo.type === 'PROMO_CODE') {
    if (!promoCodeInput || !promoCodeInput.trim()) return;
    isPromoCodeMatched = promo.code === promoCodeInput.trim().toUpperCase();
    if (!isPromoCodeMatched) return;
    // Filter specificPhone:
    if (promo.specificPhone && currentCustomerPhone) {
        if (promo.specificPhone !== currentCustomerPhone) return;
    } else if (promo.specificPhone && !currentCustomerPhone) {
        return; // Voucher cá nhân nhưng không biết khách → từ chối
    }
}
```

## 5. hasActivePromoCode — detect voucher cá nhân

```javascript
// Đặt SAU useState loyaltyProfile để tránh TDZ
const hasActivePromoCode = (promotions || []).some(p => {
    if (!p.isActive || p.type !== 'PROMO_CODE') return false;
    if (p.startDate && new Date(`${p.startDate}T00:00:00`).getTime() > Date.now()) return false;
    if (p.endDate   && new Date(`${p.endDate}T23:59:59`).getTime()   < Date.now()) return false;
    // Voucher cá nhân: chỉ hiện khi đúng khách
    if (p.specificPhone) return p.specificPhone === (loyaltyProfile?.phone || null);
    const ids = p.applicableItems || [];
    if (ids.length === 0 || ids.includes('ALL')) return true;
    return cart.some(c => ids.includes(c.item?.id));
});

const personalVoucher = (promotions || []).find(p =>
    p.isActive && p.type === 'PROMO_CODE' && p.specificPhone
    && p.specificPhone === loyaltyProfile?.phone
    && p.endDate && new Date(`${p.endDate}T23:59:59`).getTime() >= Date.now()
);
```

## 6. SingeUse deactivation — server.cjs POST /api/order

```javascript
// Sau khi tạo order thành công:
if (promo && promo.singleUse === true) {
    promo.isActive = false;
    db.prepare('UPDATE promotions SET isActive = 0, data = ? WHERE id = ?')
      .run(JSON.stringify(promo), promo.id);
}
```

## 7. UI Hint Pattern

```jsx
{/* Trong giỏ hàng — khi hasActivePromoCode && personalVoucher */}
{personalVoucher && !promoCodeInput && (
    <div onClick={() => setPromoCodeInput(personalVoucher.code)}
         className="cursor-pointer bg-amber-50 border border-amber-200 px-3 py-1.5"
         style={{ borderRadius: 'var(--radius-badge)' }}>
        🎁 Khách có voucher: <strong>{personalVoucher.code}</strong>
        — {personalVoucher.discountValue}% giảm
        <span className="ml-auto underline text-brand-600">Tap để điền</span>
    </div>
)}
```

## 8. Checklist khi tạo tính năng voucher-adjacent mới

- [ ] promoObj có đủ `type: 'PROMO_CODE'` và `code` ?
- [ ] INSERT lưu toàn bộ object vào field `data` (không phải fields rời) ?
- [ ] Gọi `reloadPromotions()` sau INSERT ?
- [ ] Engine nhận `currentCustomerPhone` và filter đúng ?
- [ ] `hasActivePromoCode` đặt SAU useState loyaltyProfile (tránh TDZ) ?
- [ ] Deactivate `singleUse` voucher sau khi dùng ?
