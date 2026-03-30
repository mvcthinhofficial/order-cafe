/**
 * promotionEngine.js — Bộ máy tính khuyến mãi
 *
 * Loại KM hiện có:
 *  - PROMO_CODE          : Mã giảm giá (khách phải nhập mã)
 *  - COMBO_GIFT          : Tặng quà khi đơn >= X nghìn đồng (tự động)
 *  - HAPPY_HOUR          : Giảm giá / tặng quà trong khung giờ vàng (tự động)
 *  - BUY_X_GET_Y         : Mua X tặng Y (tự động)
 *  - ORDER_DISCOUNT      : Giảm thẳng hóa đơn khi đạt ngưỡng (tự động, không cần mã)
 *  - DISCOUNT_ON_CATEGORY: Giảm giá theo danh mục sản phẩm (tự động)
 */
export const calculateCartWithPromotions = (cart, promotions, promoCodeInput, menu = [], selectedPromoId = null, enablePromotions = true) => {
    // Tính tổng tiền gốc (loại bỏ các items đã là quà tặng)
    const nonGiftCart = cart.filter(c => !c.isGift);
    let baseTotal = nonGiftCart.reduce((s, c) => s + (c.totalPrice * c.count), 0);

    // Nếu cart rỗng, hoặc không có promo
    if (!nonGiftCart || nonGiftCart.length === 0 || !promotions || !Array.isArray(promotions)) {
        return {
            totalOrderPrice: Math.max(0, baseTotal),
            baseTotal,
            discount: 0,
            validPromo: null,
            giftMessages: [],
            suggestedGifts: [],
            giftsRemaining: 0,
            availablePromotions: [],
            processedCart: cart || []
        };
    }

    const availablePromotions = [];

    // ─── LỌC PROMO THEO NGÀY VÀ TRẠNG THÁI ─────────────────────────────────
    const nowTime = Date.now();
    const activePromos = promotions.filter(p => {
        if (!p.isActive) return false;

        // Cờ: Bỏ qua tắt khuyến mãi chung
        if (!enablePromotions && !p.ignoreGlobalDisable) return false;

        // Giới hạn trong ngày
        if (p.dailyLimit && p.dailyLimit > 0) {
            const todayStr = new Date(Date.now()).toISOString().split('T')[0];
            const usageToday = (p.usageHistory && p.usageHistory[todayStr]) ? p.usageHistory[todayStr] : 0;
            if (usageToday >= p.dailyLimit) {
                return false; // Đã hết lượt dùng trong ngày
            }
        }

        if (p.startDate) {
            const start = new Date(`${p.startDate}T00:00:00`).getTime();
            if (nowTime < start) return false;
        }
        if (p.endDate) {
            const end = new Date(`${p.endDate}T23:59:59`).getTime();
            if (nowTime > end) return false;
        }
        return true;
    });

    // ─── HÀM TIỆN ÍCH ───────────────────────────────────────────────────────
    const formatK = (val) => new Intl.NumberFormat('vi-VN').format(val * 1000);

    // Lấy giờ hiện tại theo múi giờ Việt Nam (UTC+7)
    const getNowVNMinutes = () => {
        const now = new Date(Date.now());
        return now.getUTCHours() * 60 + now.getUTCMinutes();
    };

    // Tính total cho các món thuộc danh sách ID hoặc category
    const calcApplicableTotal = (ids, categoryFilter) => {
        if (categoryFilter) {
            return nonGiftCart
                .filter(c => c.item.category === categoryFilter)
                .reduce((s, c) => s + c.totalPrice * c.count, 0);
        }
        if (!ids || ids.length === 0 || ids.includes('ALL')) return baseTotal;
        return nonGiftCart.filter(c => ids.includes(c.item.id)).reduce((s, c) => s + c.totalPrice * c.count, 0);
    };

    // Đếm số lượng món trong giỏ (loại trừ quà tặng)
    const countApplicableItems = (ids) => {
        if (!ids || ids.length === 0 || ids.includes('ALL')) {
            return nonGiftCart.reduce((s, c) => s + c.count, 0);
        }
        return nonGiftCart.filter(c => ids.includes(c.item.id)).reduce((s, c) => s + c.count, 0);
    };

    // ─── HÀM PHÂN PHỐI QUÀ TẶNG ─────────────────────────────────────────────
    const applyGiftItems = (promo, totalAllowedGifts) => {
        let simGifts = {}; // { itemId: count }
        let appliedGiftDiscount = 0;
        let totalItemsGranted = 0;
        let finalGiftsRemaining = 0;
        const msgList = [];

        if (totalAllowedGifts > 0 && promo.giftItems && promo.giftItems.length > 0) {
            let cartCopy = nonGiftCart.map(c => ({ ...c, remainCount: c.count }));
            let eligibleInCart = cartCopy.filter(c => promo.giftItems.includes(c.item.id) && c.remainCount > 0);
            // Tặng món có giá BASE rẻ nhất trước (bảo vệ lợi nhuận)
            // Dùng item.price (giá cơ bản), không dùng totalPrice có size/addon
            eligibleInCart.sort((a, b) => parseFloat(a.item.price) - parseFloat(b.item.price));

            let giftsLeft = totalAllowedGifts;
            for (let match of eligibleInCart) {
                if (giftsLeft <= 0) break;
                const take = Math.min(match.remainCount, giftsLeft);
                simGifts[match.item.id] = (simGifts[match.item.id] || 0) + take;
                // Giảm theo giá BASE (không có size/addon)
                const baseItemPrice = parseFloat(match.item.price);
                appliedGiftDiscount += baseItemPrice * take;
                match.remainCount -= take;
                giftsLeft -= take;
                totalItemsGranted += take;
            }
            finalGiftsRemaining = giftsLeft;
        }

        return { simGifts, appliedGiftDiscount, totalItemsGranted, finalGiftsRemaining };
    };

    // Tạo thông điệp cho quà tặng
    const buildGiftMessages = (conditionStr, simGifts, totalItemsGranted, giftsRemaining, promo) => {
        const msgList = [];
        if (totalItemsGranted > 0) {
            const givenNames = [];
            Object.keys(simGifts).forEach(gid => {
                const gConf = menu.find(m => m.id === gid);
                const name = gConf ? gConf.name : 'món quà';
                givenNames.push(`${simGifts[gid]}x ${name}`);
            });
            msgList.push(`${conditionStr}: Tặng ${givenNames.join(', ')} miễn phí 🎁`);
        }
        if (giftsRemaining > 0) {
            const giftNames = (promo.giftItems || []).map(gid => {
                const g = menu.find(m => m.id === gid);
                return g ? g.name : null;
            }).filter(Boolean);
            const nameStr = giftNames.length > 0 ? ` (${giftNames.join(', ')})` : '';
            msgList.push(`${conditionStr}: Bạn còn được tặng thêm ${giftsRemaining} phần${nameStr} — hãy thêm vào giỏ`);
        }
        return msgList;
    };

    // ─── HÀM SIMULATE MỖI PROMO ─────────────────────────────────────────────
    const simulatePromo = (promo, isPromoCodeMatched) => {
        let simDiscount = 0;
        let simGifts = {};
        let isValid = false;
        let totalAllowedGifts = 0;
        let msgList = [];
        let conditionStr = 'Điều kiện đạt';

        // ── PROMO_CODE ───────────────────────────────────────────────────────
        if (promo.type === 'PROMO_CODE') {
            // Chỉ áp dụng nếu khách đã nhập đúng mã — KHÔNG tự động
            if (!isPromoCodeMatched) return;
            if (baseTotal < (promo.minOrderValue || 0)) return;

            const applicableTotal = calcApplicableTotal(promo.applicableItems);
            if (applicableTotal > 0) {
                isValid = true;
                if (promo.discountType === 'PERCENT') {
                    simDiscount = applicableTotal * ((promo.discountValue || 0) / 100);
                    if (promo.maxDiscount && promo.maxDiscount > 0 && simDiscount > promo.maxDiscount) {
                        simDiscount = promo.maxDiscount;
                    }
                } else {
                    simDiscount = Math.min(promo.discountValue || 0, applicableTotal);
                }
                if (simDiscount > 0) {
                    msgList.push(`Mã ${promo.code}: Giảm ${formatK(simDiscount)}đ`);
                }
            }
        }

        // ── HAPPY_HOUR ───────────────────────────────────────────────────────
        else if (promo.type === 'HAPPY_HOUR') {
            // FIX: đọc đúng field validHours thay vì startTime/endTime
            const validHours = promo.validHours || [];
            const startStr = validHours[0] || promo.startTime || '00:00';
            const endStr   = validHours[1] || promo.endTime   || '23:59';

            const nowMin = getNowVNMinutes();
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);
            const startMin = sh * 60 + (sm || 0);
            const endMin   = eh * 60 + (em || 0);

            if (nowMin >= startMin && nowMin <= endMin) {
                if (baseTotal >= (promo.minOrderValue || 0)) {
                    const applicableTotal = calcApplicableTotal(promo.applicableItems);
                    if (applicableTotal > 0) {
                        isValid = true;
                        conditionStr = `Khung giờ vàng ${startStr}–${endStr}`;

                        // Giảm giá theo % hoặc tiền
                        if ((promo.discountValue || 0) > 0) {
                            if (promo.discountType === 'PERCENT') {
                                simDiscount = applicableTotal * (promo.discountValue / 100);
                                if (promo.maxDiscount && promo.maxDiscount > 0 && simDiscount > promo.maxDiscount) {
                                    simDiscount = promo.maxDiscount;
                                }
                            } else {
                                simDiscount = Math.min(promo.discountValue, applicableTotal);
                            }
                            if (simDiscount > 0) msgList.push(`${conditionStr}: Giảm ${formatK(simDiscount)}đ`);
                        }

                        // Quà tặng
                        if (promo.giftItems && promo.giftItems.length > 0) {
                            totalAllowedGifts = promo.giftQuantity || 1;
                        }
                    }
                }
            }
        }

        // ── COMBO_GIFT ───────────────────────────────────────────────────────
        else if (promo.type === 'COMBO_GIFT') {
            if (baseTotal >= (promo.minOrderValue || 0)) {
                isValid = true;
                conditionStr = `Đơn đạt ${formatK(promo.minOrderValue || 0)}đ`;
                if (promo.giftItems && promo.giftItems.length > 0) {
                    totalAllowedGifts = promo.giftQuantity || 1;
                }
            }
        }

        // ── BUY_X_GET_Y ──────────────────────────────────────────────────────
        else if (promo.type === 'BUY_X_GET_Y') {
            const buyQty  = promo.requiredQuantity || 1;
            const giftQty = promo.giftQuantity || 1;
            const totalBuyCount = countApplicableItems(promo.applicableItems);

            // Kiểm tra đủ số lượng VÀ đủ giá trị đơn tối thiểu (nếu có)
            const meetsQty      = totalBuyCount >= buyQty;
            const meetsMinOrder = baseTotal >= (promo.minOrderValue || 0);

            if (meetsQty && meetsMinOrder && promo.giftItems && promo.giftItems.length > 0) {
                isValid = true;
                // Chỉ tặng 1 lần duy nhất per đơn hàng (không nhân lên theo số lần đủ điều kiện)
                totalAllowedGifts = giftQty;
                conditionStr = `Mua ${buyQty}+ món${promo.minOrderValue ? ` (trên ${formatK(promo.minOrderValue)}đ)` : ''} được tặng`;
            }
        }

        // ── ORDER_DISCOUNT (mới) ─────────────────────────────────────────────
        else if (promo.type === 'ORDER_DISCOUNT') {
            if (baseTotal >= (promo.minOrderValue || 0)) {
                isValid = true;
                if (promo.discountType === 'PERCENT') {
                    simDiscount = baseTotal * ((promo.discountValue || 0) / 100);
                    if (promo.maxDiscount && promo.maxDiscount > 0 && simDiscount > promo.maxDiscount) {
                        simDiscount = promo.maxDiscount;
                    }
                } else {
                    simDiscount = Math.min(promo.discountValue || 0, baseTotal);
                }
                conditionStr = `Đơn đạt ${formatK(promo.minOrderValue || 0)}đ`;
                if (simDiscount > 0) {
                    msgList.push(`${conditionStr}: Giảm ngay ${formatK(simDiscount)}đ`);
                }
            }
        }

        // ── DISCOUNT_ON_CATEGORY (mới) ───────────────────────────────────────
        else if (promo.type === 'DISCOUNT_ON_CATEGORY') {
            const targetCategory = promo.targetCategory || '';
            if (!targetCategory) return;
            const categoryTotal = nonGiftCart
                .filter(c => c.item.category === targetCategory)
                .reduce((s, c) => s + c.totalPrice * c.count, 0);

            if (categoryTotal > 0 && baseTotal >= (promo.minOrderValue || 0)) {
                isValid = true;
                if (promo.discountType === 'PERCENT') {
                    simDiscount = categoryTotal * ((promo.discountValue || 0) / 100);
                    if (promo.maxDiscount && promo.maxDiscount > 0 && simDiscount > promo.maxDiscount) {
                        simDiscount = promo.maxDiscount;
                    }
                } else {
                    simDiscount = Math.min(promo.discountValue || 0, categoryTotal);
                }
                conditionStr = `Danh mục ${targetCategory}`;
                if (simDiscount > 0) {
                    msgList.push(`${conditionStr}: Giảm ${formatK(simDiscount)}đ`);
                }
            }
        }

        // ─── Xử lý quà tặng (HAPPY_HOUR, COMBO_GIFT, BUY_X_GET_Y) ──────────
        if (isValid && totalAllowedGifts > 0) {
            const { simGifts: g, appliedGiftDiscount, totalItemsGranted, finalGiftsRemaining }
                = applyGiftItems(promo, totalAllowedGifts);

            // Kiểm tra lại điều kiện giá đơn tối thiểu SAU KHI đã trừ đi phần quà tặng
            // (Đảm bảo giá trị phần còn lại mà khách thực trả vẫn đạt điều kiện)
            if (promo.minOrderValue && (baseTotal - appliedGiftDiscount < promo.minOrderValue)) {
                return; // Thu hồi kết quả hợp lệ, hủy khuyến mãi này
            }

            simGifts = g;
            simDiscount += appliedGiftDiscount;

            const giftMsgs = buildGiftMessages(conditionStr, simGifts, totalItemsGranted, finalGiftsRemaining, promo);
            msgList.push(...giftMsgs);

            const totalBeneficialValue = simDiscount + appliedGiftDiscount;
            if (totalBeneficialValue > 0 || msgList.length > 0) {
                availablePromotions.push({
                    promo,
                    totalValue: totalBeneficialValue,
                    discountResult: simDiscount - appliedGiftDiscount, // phần giảm tiền (không kể quà)
                    giftsMap: simGifts,
                    giftDiscountTotal: appliedGiftDiscount,
                    messages: msgList.length > 0 ? msgList : [`Áp dụng: ${promo.name}`],
                    suggestedGifts: finalGiftsRemaining > 0 ? (promo.giftItems || []) : [],
                    giftsRemaining: finalGiftsRemaining
                });
            }
            return;
        }

        // Promo không có quà (chỉ giảm tiền)
        if (isValid && (simDiscount > 0 || msgList.length > 0)) {
            availablePromotions.push({
                promo,
                totalValue: simDiscount,
                discountResult: simDiscount,
                giftsMap: {},
                giftDiscountTotal: 0,
                messages: msgList.length > 0 ? msgList : [`Áp dụng: ${promo.name}`],
                suggestedGifts: [],
                giftsRemaining: 0
            });
        }
    };

    // ─── ĐÁNH GIÁ TẤT CẢ PROMOTIONS ─────────────────────────────────────────
    activePromos.forEach(promo => {
        let isPromoCodeMatched = false;
        if (promo.type === 'PROMO_CODE') {
            // Chỉ kiểm tra nếu user đã nhập mã
            if (!promoCodeInput || !promoCodeInput.trim()) return; // bỏ qua, chờ user nhập
            isPromoCodeMatched = promo.code === promoCodeInput.trim().toUpperCase();
            if (!isPromoCodeMatched) return; // mã không khớp → bỏ qua
        }
        simulatePromo(promo, isPromoCodeMatched);
    });

    // ─── CHỌN PROMOTION TỐT NHẤT ─────────────────────────────────────────────
    let activePromoResult = null;
    if (availablePromotions.length > 0) {
        if (selectedPromoId) {
            activePromoResult = availablePromotions.find(ap => ap.promo.id === selectedPromoId)
                              || availablePromotions[0];
        } else {
            availablePromotions.sort((a, b) => b.totalValue - a.totalValue);
            activePromoResult = availablePromotions[0];
        }
    }

    // ─── XÂY DỰNG processedCart ──────────────────────────────────────────────
    let processedCart = [];
    let finalDiscount = 0;
    let finalGiftMessages = [];
    let finalValidPromo = null;
    let finalSuggestedGifts = [];
    let finalGiftsRemaining = 0;

    if (activePromoResult) {
        finalValidPromo = activePromoResult.promo;
        finalDiscount = activePromoResult.discountResult;

        let remainGifts = { ...activePromoResult.giftsMap };
        let giftDiscountTotal = 0;
        let tempCart = nonGiftCart.map(c => ({ ...c }));

        // Tách các dòng quà tặng ra khỏi cart gốc
        // Quà tặng luôn ở SIZE CƠ BẢN (price = item.price), không có size upgrade và không có add-on
        Object.keys(remainGifts).forEach(giftId => {
            let needToGift = remainGifts[giftId];
            const matches = tempCart.filter(c => c.item.id === giftId)
                                    .sort((a, b) => parseFloat(a.item.price) - parseFloat(b.item.price));
            for (let match of matches) {
                if (needToGift <= 0) break;
                const take = Math.min(match.count, needToGift);
                match.count -= take;
                needToGift -= take;
                const basePrice = parseFloat(match.item.price);
                giftDiscountTotal += basePrice * take;
                processedCart.push({
                    ...match,
                    id: `gift-${match.id}-${Date.now()}-${Math.random()}`,
                    originalCartItemId: match.id, // Lưu ID gốc để có thể trừ xóa
                    count: take,
                    isGift: true,
                    // Đặt lại: size cơ bản, không add-on
                    size: null,
                    addons: [],
                    originalPrice: basePrice,
                    totalPrice: 0,
                    note: '(Quà Tặng — Size cơ bản)'
                });
            }
        });

        // Thêm các item còn lại (không phải quà)
        tempCart.forEach(c => { if (c.count > 0) processedCart.push(c); });

        finalDiscount += giftDiscountTotal;
        finalGiftMessages = activePromoResult.messages;
        finalSuggestedGifts = activePromoResult.suggestedGifts || [];
        finalGiftsRemaining = activePromoResult.giftsRemaining || 0;
    } else {
        processedCart = [...cart];
    }

    return {
        totalOrderPrice: Math.max(0, baseTotal - finalDiscount),
        baseTotal,
        discount: finalDiscount,
        validPromo: finalValidPromo,
        giftMessages: finalGiftMessages,
        suggestedGifts: finalSuggestedGifts,
        giftsRemaining: finalGiftsRemaining,
        availablePromotions,
        processedCart
    };
};
