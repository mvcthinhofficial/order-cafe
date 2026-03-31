/**
 * Tạo HTML cho đơn in bếp dựa trên cấu hình settings
 */
export function generateKitchenTicketHTML(order, cartItem, recipeDetails, settings) {
    const isK58 = settings?.kitchenPaperSize === 'K58';
    const baseSize = settings?.kitchenFontSize || 14;
    const lineGap = settings?.kitchenLineGap || 1.5;
    const paperWidth = isK58 ? '200px' : '300px';

    const tableName = order.tagNumber || order.tableName || 'GIAO ĐI';
    const sizeLabel = typeof cartItem.size === 'string' ? cartItem.size : cartItem.size?.label;

    return `
        <div style="font-family: Arial, sans-serif; width: ${paperWidth}; margin: 0 auto; color: #000; line-height: ${lineGap};">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: ${baseSize + 2}px; font-weight: 900; text-transform: uppercase;">BẾP: ${tableName}</h3>
                <div style="font-size: ${baseSize}px; margin-top: 4px; font-weight: bold;">
                    Q: ${order.queueNumber} - ID: ${order.id.slice(-4)}
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <h2 style="font-size: ${baseSize + 6}px; font-weight: 900; margin: 0; text-transform: uppercase; line-height: 1.1;">
                    ${cartItem.item?.name} ${sizeLabel ? `(${sizeLabel})` : ''} x${cartItem.count}
                </h2>
            </div>
            
            <div style="font-size: ${baseSize}px; border-left: 3px solid #000; padding-left: 8px; margin-bottom: 12px;">
                ${recipeDetails.map(d => `<div style="margin-bottom: 2px;">${d}</div>`).join('')}
            </div>
            
            <div style="border-top: 1px dashed #000; padding-top: 8px; font-size: ${baseSize}px;">
                <div style="font-weight: bold;">Đường: ${cartItem.sugar || 'Bình thường'}</div>
                <div style="font-weight: bold;">Đá: ${cartItem.ice || 'Bình thường'}</div>
                ${cartItem.addons?.length > 0 ? `
                    <div style="margin-top: 4px;">
                        <b>Topping:</b> ${cartItem.addons.map(a => typeof a === 'string' ? a : a.label).join(', ')}
                    </div>
                ` : ''}
                ${cartItem.note || order.note ? `
                    <div style="margin-top: 6px; font-style: italic; font-weight: bold; border: 1px solid #000; padding: 4px;">
                        LƯU Ý: ${cartItem.note || order.note}
                    </div>
                ` : ''}
            </div>
            
            <div style="margin-top: 15px; text-align: center; font-size: ${baseSize - 4}px; opacity: 0.8;">
                ${new Date(order.timestamp).toLocaleTimeString('vi-VN')}
            </div>
        </div>
    `;
}

/**
 * ── Shared Receipt Generator ──
 */
export function generateReceiptHTML(orderData, cartItems, settings, isReprint = false) {
    const formatVNDReceipt = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0).replace('₫', '').trim();

    const isK58 = settings?.receiptPaperSize === 'K58';
    const paperWidth = isK58 ? '200px' : '302px';

    const baseSize = parseInt(settings?.receiptFontSize || (isK58 ? 10 : 12));
    const lh = parseFloat(settings?.receiptLineGap || 1.4);

    const FZ_TINY = `${baseSize}px`;
    const FZ_SMALL = `${baseSize}px`;
    const FZ_BASE = `${baseSize}px`;
    const FZ_SUBTITLE = `${baseSize}px`;
    const FZ_TITLE = `${baseSize}px`;

    const paperPadding = isK58 ? 'padding: 0 2px;' : 'padding: 0 5px;';
    const mgGroup = `${Math.max(1, Math.round(lh * 3))}px 0`;
    const mgItem = `${Math.max(0, Math.round(lh * 1.5))}px 0`;

    const fallbackConfig = [
        { id: 'shopName', enabled: true },
        { id: 'address', enabled: true },
        { id: 'receiptTitle', enabled: true },
        { id: 'orderInfo', enabled: true },
        { id: 'customerInfo', enabled: true },
        { id: 'itemsList', enabled: true },
        { id: 'financials', enabled: true },
        { id: 'wifi', enabled: true },
        { id: 'qrCode', enabled: true },
        { id: 'footer', enabled: true }
    ];

    const config = settings?.receiptConfig || fallbackConfig;
    let htmlFragments = [];

    const combinedFooter = { qrCodeURL: '', textInfo: '', hasAny: false };

    const totalQty = (cartItems || []).reduce((sum, c) => sum + (c.count || 1), 0);
    const totalAmount = orderData.price || orderData.totalPrice || 0;
    const preTaxTotal = orderData.preTaxTotal || totalAmount;
    const taxAmount = orderData.taxAmount || 0;
    const taxRate = orderData.taxRate || 0;
    const taxMode = orderData.taxMode || 'NONE';

    const itemsContent = (cartItems || []).map((c, i) => {
        const specs = [
            c.size?.label && c.size.label !== 'Mặc định' ? c.size.label : '',
            c.sugar ? c.sugar : '',
            c.ice ? c.ice : '',
            c.addons?.length > 0 ? `+${c.addons.map(a => a.label).join(', ')}` : '',
            c.note ? `GC: ${c.note}` : ''
        ].filter(Boolean).join(' | ');

        return `
        <tr style="vertical-align: top; border-bottom: 0.5px dotted #aaa;">
            <td style="padding: 2px 0; width: 16px; text-align: left;">${i + 1}</td>
            <td style="padding: 2px 2px; font-weight: bold; line-height: 1.1; text-align: left; word-wrap: break-word; overflow-wrap: break-word;">
                ${c.isGift ? '(KM) ' : ''}${c.item?.name || c.name || 'Món'}
                ${specs ? `<div style="font-weight: normal; font-size: ${FZ_TINY}; margin-top: 1px; color: #444;">${specs}</div>` : ''}
            </td>
            <td style="text-align: center; padding: 2px 0; font-weight: bold; width: 20px;">${c.count}</td>
            ${!isK58 ? `<td style="text-align: right; padding: 2px 0; width: 55px;">${c.isGift ? '0' : formatVNDReceipt(c.originalPrice || c.totalPrice || c.price)}</td>` : ''}
            <td style="text-align: right; padding: 2px 0; font-weight: bold; width: ${isK58 ? '50px' : '65px'};">${c.isGift ? '0' : formatVNDReceipt((c.totalPrice || c.price) * c.count)}</td>
        </tr>
        `;
    }).join('') || (orderData.itemName ? `<tr><td colspan="5" style="padding: 3px 0; text-align: left; font-weight:bold;">${orderData.itemName}</td></tr>` : '');

    config.forEach(block => {
        if (!block.enabled) return;
        switch (block.id) {
            case 'shopName':
                htmlFragments.push(`<div style="margin: 0 0 2px 0; font-size: ${FZ_TITLE}; font-weight: 900; text-transform: uppercase; font-family: 'Arial Black', Impact, sans-serif;">${settings?.shopName || 'THE COFFEE HOUSE'}</div>`);
                if (settings?.shopSlogan) htmlFragments.push(`<div style="margin: 0 0 4px 0; font-size: ${FZ_SMALL}; font-style: italic;">${settings.shopSlogan}</div>`);
                break;
            case 'address':
                if (settings?.taxId || settings?.shopAddress) {
                    const addrDetails = [settings.taxId ? `MST: ${settings.taxId}` : '', settings.shopAddress ? `ĐC: ${settings.shopAddress}` : ''].filter(Boolean).join(' - ');
                    htmlFragments.push(`<div style="font-size: ${FZ_TINY}; margin: ${mgItem}; line-height: 1.2; text-align: center;">${addrDetails}</div>`);
                }
                break;
            case 'receiptTitle':
                const docTitle = settings?.receiptTitle || ((taxMode !== 'NONE') ? 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG' : 'HÓA ĐƠN BÁN HÀNG');
                htmlFragments.push(`<div style="font-size: ${FZ_SUBTITLE}; font-weight: bold; margin: ${mgGroup}; text-transform: uppercase; text-align: center; border-bottom: 2px solid black; padding-bottom: 2px; display: inline-block; width: 100%;">${docTitle}</div>`);
                break;
            case 'orderInfo':
                const timeStr = new Date(orderData.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
                htmlFragments.push(`<table style="width: 100%; border-collapse: collapse; font-size: ${FZ_TINY}; margin: ${mgGroup}; text-align: left;"><tr><td style="padding: 1px 0;">Ngày: ${timeStr}</td><td style="padding: 1px 0; text-align: right;">SP: <b>${String(orderData.queueNumber || '').padStart(4, '0')}</b></td></tr><tr><td style="padding: 1px 0;">TN: Admin</td><td style="padding: 1px 0; text-align: right;">${orderData.tagNumber ? `BÀN: <b>${String(orderData.tagNumber).replace(/^TAG-?/i, '').trim()}</b>` : ''}${orderData.tableName ? `BÀN: <b>${orderData.tableName}</b>` : ''}</td></tr>${(orderData.customerName || orderData.customerPhone) ? `<tr><td colspan="2" style="padding: 1px 0;">Khách: <b>${orderData.customerName || ''} ${orderData.customerPhone || ''}</b></td></tr>` : ''}</table>`);
                break;
            case 'itemsList':
                htmlFragments.push(`<div style="border-top: 1px dashed black; margin: ${mgGroup}; border-bottom: 1px solid black;"></div><table style="width: 100%; text-align: left; border-collapse: collapse; font-size: ${FZ_SMALL}; margin: ${mgGroup}; table-layout: fixed;"><thead><tr style="border-bottom: 1px solid #000;"><th style="padding: 2px 0; width: 16px; text-align: left;">TT</th><th style="padding: 2px 2px; text-align: left;">Tên món</th><th style="text-align: center; padding: 2px 0; width: 20px;">SL</th>${!isK58 ? `<th style="text-align: right; padding: 2px 0; width: 55px;">Đ.Giá</th>` : ''}<th style="text-align: right; padding: 2px 0; width: ${isK58 ? '50px' : '65px'};">T.Tiền</th></tr></thead><tbody>${itemsContent}</tbody><tfoot><tr style="border-top: 1.5px solid #000; font-size: ${FZ_BASE};"><td colspan="2" style="padding: 4px 2px; text-align: left; font-weight: bold; text-transform: uppercase;">Tổng:</td><td style="text-align: center; padding: 4px 0; font-weight: bold;">${totalQty}</td>${!isK58 ? `<td></td>` : ''}<td style="text-align: right; padding: 4px 0; font-weight: bold;">${formatVNDReceipt((taxMode !== 'NONE') ? preTaxTotal : totalAmount)}</td></tr></tfoot></table>`);
                break;
            case 'financials':
                htmlFragments.push(`<div style="border-top: 1px dashed black; margin: ${mgGroup};"></div><table style="width: 100%; border-collapse: collapse; font-size: ${FZ_BASE}; font-weight: bold; margin: ${mgGroup};">${(taxMode !== 'NONE') && taxAmount > 0 ? `<tr style="font-weight: normal; font-size: ${FZ_TINY}; border-bottom: 1px dashed #ccc;"><td style="text-align: left; padding: 2px 0;">Thuế GTGT (${taxRate}%):</td><td style="text-align: right; padding: 2px 0;">${formatVNDReceipt(taxAmount)}</td></tr>` : ''}<tr><td style="text-align: left; padding: 4px 0; text-transform: uppercase;">THANH TOÁN:</td><td style="text-align: right; padding: 4px 0; font-size: ${FZ_TITLE};">${formatVNDReceipt(totalAmount)}</td></tr></table>`);
                break;
            case 'qrCode':
                const qrUrl = settings?.bankId && settings?.accountNo ? `https://img.vietqr.io/image/${settings.bankId}-${settings.accountNo}-compact2.png?amount=${Math.round(totalAmount)}&addInfo=${encodeURIComponent('DH ' + orderData.id)}&accountName=${encodeURIComponent(settings.accountName || '')}` : '';
                if (qrUrl) { combinedFooter.qrCodeURL = qrUrl; combinedFooter.hasAny = true; }
                break;
            case 'wifi':
                if (settings?.wifiPass) { combinedFooter.textInfo = `<div style="margin-bottom: 4px; text-align: center; border: 1px solid #777; padding: 2px; display: inline-block; width: 100%; box-sizing: border-box;"><span style="font-size: ${FZ_TINY}; font-weight: bold;">WIFI: ${settings.wifiPass}</span></div>` + combinedFooter.textInfo; combinedFooter.hasAny = true; }
                break;
            case 'footer':
                const customFooter = settings?.receiptFooter || 'Xin cảm ơn & Hẹn gặp lại!';
                combinedFooter.textInfo += `<div style="font-size: ${FZ_TINY}; text-align: center; line-height: 1.2;">Hóa đơn xuất tự động.<br/><div style="font-weight: bold; font-size: ${FZ_SMALL}; margin-top: 3px; border-top: 1px solid #000; padding-top: 3px; display: inline-block; width: 80%;">${customFooter.replace(/\n/g, '<br/>')}</div></div>`;
                combinedFooter.hasAny = true;
                break;
            default: break;
        }
    });

    if (combinedFooter.hasAny) {
        htmlFragments.push(`<div style="border-top: 1px dashed black; margin: ${mgGroup};"></div><table style="width: 100%; border-collapse: collapse; margin: ${mgGroup};"><tr>${combinedFooter.qrCodeURL ? `<td style="width: ${isK58 ? '45%' : '40%'}; vertical-align: middle; text-align: center; padding-right: 4px;"><img src="${combinedFooter.qrCodeURL}" style="width: 100%; max-width: 90px; height: auto; border: 1px solid #ccc; padding: 2px; display: inline-block;"/><div style="font-size: ${FZ_TINY}; margin-top: 1px; color: #444;">Quét để thanh toán</div></td>` : ''}${combinedFooter.textInfo ? `<td style="width: ${combinedFooter.qrCodeURL ? (isK58 ? '55%' : '60%') : '100%'}; vertical-align: middle; text-align: center; padding-left: ${combinedFooter.qrCodeURL ? '4px' : '0'};">${combinedFooter.textInfo}</td>` : ''}</tr></table>`);
    }

    return `<div style="font-family: Arial, Helvetica, sans-serif; width: ${paperWidth}; margin: 0 auto; color: black; line-height: ${lh}; text-align: center; box-sizing: border-box; ${paperPadding}">${htmlFragments.join('')}<div style="height: 30px;"></div></div>`;
}
