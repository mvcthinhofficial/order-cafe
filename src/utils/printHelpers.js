/**
 * Tạo HTML cho đơn in bếp dựa trên cấu hình settings
 * ☞ Không dùng font-style:italic vì in nhiệt dễ mất chữ
 */
export function generateKitchenTicketHTML(order, cartItem, recipeDetails, settings) {
    const isK58 = settings?.kitchenPaperSize === 'K58';
    const baseSize = settings?.kitchenFontSize || 14;
    const lineGap = settings?.kitchenLineGap || 1.5;
    const paperWidth = isK58 ? '200px' : '300px';

    const tableName = order.tagNumber || order.tableName || 'GIAO ĐI';
    const sizeLabel = typeof cartItem.size === 'string' ? cartItem.size : cartItem.size?.label;

    return `
        <div style="font-family: Arial, Helvetica, sans-serif; width: ${paperWidth}; margin: 0 auto; color: #000; line-height: ${lineGap};">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: ${baseSize + 4}px; font-weight: 900; text-transform: uppercase;">BẾP: ${tableName}</h3>
                <div style="font-size: ${baseSize + 1}px; margin-top: 4px; font-weight: 700;">
                    Q: ${order.queueNumber} - ID: ${order.id.slice(-4)}
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <h2 style="font-size: ${baseSize + 8}px; font-weight: 900; margin: 0; text-transform: uppercase; line-height: 1.2;">
                    ${cartItem.item?.name} ${sizeLabel ? `(${sizeLabel})` : ''} x${cartItem.count}
                </h2>
            </div>
            
            <div style="font-size: ${baseSize + 1}px; border-left: 4px solid #000; padding-left: 8px; margin-bottom: 12px;">
                ${recipeDetails.map(d => `<div style="margin-bottom: 3px; font-weight: 600;">${d}</div>`).join('')}
            </div>
            
            <div style="border-top: 1px dashed #000; padding-top: 8px; font-size: ${baseSize + 1}px;">
                <div style="font-weight: 700;">Đường: ${cartItem.sugar || 'Bình thường'}</div>
                <div style="font-weight: 700;">Đá: ${cartItem.ice || 'Bình thường'}</div>
                ${cartItem.addons?.length > 0 ? `
                    <div style="margin-top: 4px; font-weight: 700;">
                        <b>Topping:</b> ${cartItem.addons.map(a => typeof a === 'string' ? a : a.label).join(', ')}
                    </div>
                ` : ''}
                ${cartItem.note || order.note ? `
                    <div style="margin-top: 8px; font-weight: 900; border: 1px solid #000; padding: 5px; text-transform: uppercase;">
                        LUU Y: ${cartItem.note || order.note}
                    </div>
                ` : ''}
            </div>
            
            <div style="margin-top: 15px; text-align: center; font-size: ${baseSize - 2}px; font-weight: 600;">
                ${new Date(order.timestamp).toLocaleTimeString('vi-VN')}
            </div>
        </div>
    `;
}

/**
 * Tạo HTML cho đơn in bếp (gộp chung tất cả các món vào 1 bill)
 */
export function generateCombinedKitchenTicketHTML(order, cartItems, settings) {
    const isK58 = settings?.kitchenPaperSize === 'K58';
    const baseSize = settings?.kitchenFontSize || 14;
    const lineGap = settings?.kitchenLineGap || 1.5;
    const paperWidth = isK58 ? '200px' : '300px';

    const tableName = order.tagNumber || order.tableName || 'GIAO ĐI';

    const itemsHTML = cartItems.map((c, i) => {
        const sizeLabel = typeof c.size === 'string' ? c.size : c.size?.label;
        
        // Hợp nhất công thức: item.recipe, size.recipe, addons.recipe
        const recipeDetails = [];
        if (c.item?.recipe) recipeDetails.push(...c.item.recipe.map(r => `${r.ingredientName}: ${r.quantity} ${r.unit}`));
        if (c.size?.recipe) recipeDetails.push(...c.size.recipe.map(r => `${r.ingredientName}: ${r.quantity} ${r.unit}`));
        if (c.addons) {
            c.addons.forEach(a => {
                if (a.recipe) recipeDetails.push(...a.recipe.map(r => `(Topping) ${r.ingredientName}: ${r.quantity} ${r.unit}`));
            });
        }
        
        return `
            <div style="margin-bottom: 16px; border-bottom: 1px dotted #000; padding-bottom: 12px;">
                <h2 style="font-size: ${baseSize + 6}px; font-weight: 900; margin: 0 0 6px 0; text-transform: uppercase; line-height: 1.2;">
                    ${i + 1}. ${c.item?.name} ${sizeLabel ? `(${sizeLabel})` : ''} <span style="font-size: ${baseSize + 8}px; border: 1px solid #000; padding: 2px 6px;">x${c.count}</span>
                </h2>
                
                ${recipeDetails.length > 0 ? `
                <div style="font-size: ${baseSize + 1}px; border-left: 3px solid #000; padding-left: 8px; margin-bottom: 8px;">
                    ${recipeDetails.map(d => `<div style="margin-bottom: 3px; font-weight: 600;">${d}</div>`).join('')}
                </div>
                ` : ''}
                
                <div style="font-size: ${baseSize}px;">
                    <div style="font-weight: 700;">Đường: ${c.sugar || 'Bình thường'}</div>
                    <div style="font-weight: 700;">Đá: ${c.ice || 'Bình thường'}</div>
                    ${c.addons?.length > 0 ? `
                        <div style="margin-top: 4px; font-weight: 700;">
                            <b>Topping:</b> ${c.addons.map(a => typeof a === 'string' ? a : a.label).join(', ')}
                        </div>
                    ` : ''}
                    ${c.note ? `
                        <div style="margin-top: 6px; font-weight: 900; border: 1px solid #000; padding: 4px; text-transform: uppercase;">
                            Ghi chú: ${c.note}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div style="font-family: Arial, Helvetica, sans-serif; width: ${paperWidth}; margin: 0 auto; color: #000; line-height: ${lineGap};">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
                <h3 style="margin: 0 0 4px 0; font-size: ${baseSize + 8}px; font-weight: 900; text-transform: uppercase;">ĐƠN BẾP</h3>
                <h3 style="margin: 0; font-size: ${baseSize + 6}px; font-weight: 900; text-transform: uppercase;">${tableName}</h3>
                <div style="font-size: ${baseSize + 2}px; margin-top: 4px; font-weight: 700;">
                    Q: ${order.queueNumber || ''} - ID: ${order.id?.slice(-4) || ''}
                </div>
            </div>
            
            ${order.note ? `
                <div style="margin-bottom: 12px; font-weight: 900; border: 2px solid #000; padding: 6px; text-transform: uppercase; font-size: ${baseSize + 1}px;">
                    Ghi chú đơn: ${order.note}
                </div>
            ` : ''}
            
            ${itemsHTML}
            
            <div style="margin-top: 10px; text-align: center; font-size: ${baseSize - 2}px; font-weight: 600; padding-top: 10px; border-top: 2px solid #000;">
                ${new Date(order.timestamp).toLocaleTimeString('vi-VN')}
            </div>
        </div>
    `;
}

/**
 * ── Shared Receipt Generator ──
 * Fix: no italic, heavier font weight, fixed table-layout so item name never overlaps price,
 *      borders ≥2px for thermal printing (thin lines vanish on thermal paper).
 */
export function generateReceiptHTML(orderData, cartItems, settings, isReprint = false) {
    const formatVNDReceipt = (val) =>
        new Intl.NumberFormat('vi-VN').format(Math.round(val || 0));

    const isK58 = settings?.receiptPaperSize === 'K58';
    const paperWidth = isK58 ? '200px' : '302px';

    const baseSize = parseInt(settings?.receiptFontSize || (isK58 ? 11 : 12));
    const lh = parseFloat(settings?.receiptLineGap || 1.4);

    // Minimum readable sizes for thermal printer
    const FZ_TINY      = `${Math.max(baseSize, 10)}px`;
    const FZ_SMALL     = `${Math.max(baseSize, 10)}px`;
    const FZ_BASE      = `${Math.max(baseSize + 1, 11)}px`;
    const FZ_SUBTITLE  = `${Math.max(baseSize + 1, 12)}px`;
    const FZ_TITLE     = `${Math.max(baseSize + 2, 13)}px`;

    // Column widths — fixed so long names never push price off screen
    const COL_IDX  = '14px';
    const COL_QTY  = '22px';
    const COL_UNIT = isK58 ? '0px'  : '52px';
    const COL_TOTAL= isK58 ? '55px' : '62px';

    const paperPadding = isK58 ? 'padding: 0 3px;' : 'padding: 0 6px;';
    const mgGroup = `${Math.max(2, Math.round(lh * 3))}px 0`;
    const mgItem  = `${Math.max(1, Math.round(lh * 1.5))}px 0`;

    const fallbackConfig = [
        { id: 'shopName',     enabled: true },
        { id: 'address',      enabled: true },
        { id: 'receiptTitle', enabled: true },
        { id: 'orderInfo',    enabled: true },
        { id: 'customerInfo', enabled: true },
        { id: 'itemsList',    enabled: true },
        { id: 'financials',   enabled: true },
        { id: 'wifi',         enabled: true },
        { id: 'qrCode',       enabled: true },
        { id: 'footer',       enabled: true }
    ];

    const config = settings?.receiptConfig || fallbackConfig;
    let htmlFragments = [];

    const combinedFooter = { qrCodeURL: '', textInfo: '', hasAny: false };

    const totalQty    = (cartItems || []).reduce((sum, c) => sum + (c.count || 1), 0);
    const totalAmount = orderData.price || orderData.totalPrice || 0;
    const preTaxTotal = orderData.preTaxTotal || totalAmount;
    const taxAmount   = orderData.taxAmount || 0;
    const taxRate     = orderData.taxRate || 0;
    const taxMode     = orderData.taxMode || 'NONE';

    // ── Item rows ──────────────────────────────────────────────────────────────
    // Specs: NOT italic, NOT thin — use line breaks instead of inline for readability
    const itemsContent = (cartItems || []).map((c, i) => {
        const specParts = [
            c.size?.label && c.size.label !== 'Mặc định' ? `S:${c.size.label}` : '',
            c.sugar  ? c.sugar              : '',
            c.ice    ? c.ice                : '',
            c.addons?.length > 0 ? `+${c.addons.map(a => a.label).join(',')}` : '',
            c.note   ? `GC:${c.note}`       : ''
        ].filter(Boolean).join(' | ');

        return `
        <tr style="vertical-align: top; border-bottom: 1px solid #bbb;">
            <td style="padding: 3px 0; width: ${COL_IDX}; text-align: left; font-weight: 700; font-size: ${FZ_TINY};">${i + 1}</td>
            <td style="padding: 3px 2px; font-weight: 700; font-size: ${FZ_SMALL}; line-height: 1.3; text-align: left; word-break: break-all; overflow-wrap: break-word;">
                ${c.isGift ? '[KM] ' : ''}${c.item?.name || c.name || 'Mon'}
                ${specParts ? `<div style="font-weight: 600; font-size: ${FZ_TINY}; margin-top: 2px; color: #333; word-break: normal; white-space: normal;">${specParts}</div>` : ''}
            </td>
            <td style="text-align: center; padding: 3px 0; font-weight: 700; font-size: ${FZ_SMALL}; width: ${COL_QTY}; white-space: nowrap;">${c.count}</td>
            ${!isK58 ? `<td style="text-align: right; padding: 3px 0; font-size: ${FZ_TINY}; width: ${COL_UNIT}; white-space: nowrap;">${c.isGift ? '0' : formatVNDReceipt(c.originalPrice || c.totalPrice || c.price)}</td>` : ''}
            <td style="text-align: right; padding: 3px 0; font-weight: 700; font-size: ${FZ_SMALL}; width: ${COL_TOTAL}; white-space: nowrap;">${c.isGift ? '0' : formatVNDReceipt((c.totalPrice || c.price) * c.count)}</td>
        </tr>
        `;
    }).join('') || (orderData.itemName ? `<tr><td colspan="5" style="padding: 4px 0; text-align: left; font-weight:700;">${orderData.itemName}</td></tr>` : '');

    // ── Block renderer ─────────────────────────────────────────────────────────
    config.forEach(block => {
        if (!block.enabled) return;
        switch (block.id) {
            case 'shopName':
                htmlFragments.push(`<div style="margin: 0 0 2px 0; font-size: ${FZ_TITLE}; font-weight: 900; text-transform: uppercase; text-align: center;">${settings?.shopName || 'THE COFFEE HOUSE'}</div>`);
                // Slogan: NOT italic, use normal heavy weight instead
                if (settings?.shopSlogan) htmlFragments.push(`<div style="margin: 0 0 4px 0; font-size: ${FZ_SMALL}; font-weight: 600; text-align: center;">${settings.shopSlogan}</div>`);
                break;

            case 'address':
                if (settings?.taxId || settings?.shopAddress) {
                    const addrDetails = [
                        settings.taxId       ? `MST: ${settings.taxId}` : '',
                        settings.shopAddress ? `DC: ${settings.shopAddress}` : ''
                    ].filter(Boolean).join(' - ');
                    htmlFragments.push(`<div style="font-size: ${FZ_TINY}; font-weight: 600; margin: ${mgItem}; line-height: 1.3; text-align: center;">${addrDetails}</div>`);
                }
                break;

            case 'receiptTitle': {
                const docTitle = settings?.receiptTitle || ((taxMode !== 'NONE') ? 'HOA DON GIA TRI GIA TANG' : 'HOA DON BAN HANG');
                htmlFragments.push(`<div style="font-size: ${FZ_SUBTITLE}; font-weight: 900; margin: ${mgGroup}; text-transform: uppercase; text-align: center; border-bottom: 1px solid black; padding-bottom: 3px;">${docTitle}</div>`);
                break;
            }

            case 'orderInfo': {
                const timeStr = new Date(orderData.timestamp || Date.now()).toLocaleString('vi-VN', {
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit'
                });
                const tableCol = [
                    orderData.tagNumber  ? `BAN: <b>${String(orderData.tagNumber).replace(/^TAG-?/i, '').trim()}</b>` : '',
                    orderData.tableName  ? `BAN: <b>${orderData.tableName}</b>` : ''
                ].filter(Boolean).join(' ');
                const custRow = (orderData.customerName || orderData.customerPhone)
                    ? `<tr><td colspan="2" style="padding: 2px 0; font-size: ${FZ_TINY}; font-weight: 600;">Khach: <b>${orderData.customerName || ''} ${orderData.customerPhone || ''}</b></td></tr>`
                    : '';
                htmlFragments.push(`
                    <table style="width:100%; border-collapse:collapse; font-size:${FZ_TINY}; font-weight:600; margin:${mgGroup};">
                        <tr>
                            <td style="padding:2px 0;">Ngay: ${timeStr}</td>
                            <td style="padding:2px 0; text-align:right; font-weight:700;">SP: <b>${String(orderData.queueNumber || '').padStart(4, '0')}</b></td>
                        </tr>
                        <tr>
                            <td style="padding:2px 0;">TN: Admin</td>
                            <td style="padding:2px 0; text-align:right; font-weight:700;">${tableCol}</td>
                        </tr>
                        ${custRow}
                    </table>`);
                break;
            }

            case 'itemsList': {
                // Separator: 2px solid (thin lines vanish on thermal)
                const headerUnitCol = !isK58 ? `<th style="text-align:right; padding:3px 0; width:${COL_UNIT}; font-size:${FZ_TINY}; white-space:nowrap;">D.Gia</th>` : '';
                const footerUnitCol = !isK58 ? `<td></td>` : '';

                htmlFragments.push(`
                    <div style="border-top: 1px dashed black; margin: ${mgGroup};"></div>
                    <table style="width:100%; text-align:left; border-collapse:collapse; font-size:${FZ_SMALL}; font-weight:700; margin:${mgGroup}; table-layout:fixed;">
                        <colgroup>
                            <col style="width:${COL_IDX};">
                            <col>
                            <col style="width:${COL_QTY};">
                            ${!isK58 ? `<col style="width:${COL_UNIT};">` : ''}
                            <col style="width:${COL_TOTAL};">
                        </colgroup>
                        <thead>
                            <tr style="border-bottom: 1px solid #000;">
                                <th style="padding:3px 0; text-align:left; font-size:${FZ_TINY};">TT</th>
                                <th style="padding:3px 2px; text-align:left;">Ten mon</th>
                                <th style="text-align:center; padding:3px 0; font-size:${FZ_TINY}; white-space:nowrap;">SL</th>
                                ${headerUnitCol}
                                <th style="text-align:right; padding:3px 0; font-size:${FZ_TINY}; white-space:nowrap;">T.Tien</th>
                            </tr>
                        </thead>
                        <tbody>${itemsContent}</tbody>
                        <tfoot>
                            <tr style="border-top: 1px solid #000; font-size:${FZ_BASE};">
                                <td colspan="2" style="padding:4px 2px; text-align:left; font-weight:900; text-transform:uppercase;">TONG:</td>
                                <td style="text-align:center; padding:4px 0; font-weight:900;">${totalQty}</td>
                                ${footerUnitCol}
                                <td style="text-align:right; padding:4px 0; font-weight:900;">${formatVNDReceipt((taxMode !== 'NONE') ? preTaxTotal : totalAmount)}</td>
                            </tr>
                        </tfoot>
                    </table>`);
                break;
            }

            case 'financials': {
                const taxRow = (taxMode !== 'NONE') && taxAmount > 0
                    ? `<tr style="font-weight:600; font-size:${FZ_TINY}; border-bottom: 1px solid #aaa;">
                           <td style="text-align:left; padding:2px 0;">Thue GTGT (${taxRate}%):</td>
                           <td style="text-align:right; padding:2px 0;">${formatVNDReceipt(taxAmount)}</td>
                       </tr>`
                    : '';
                htmlFragments.push(`
                    <div style="border-top: 1px dashed black; margin: ${mgGroup};"></div>
                    <table style="width:100%; border-collapse:collapse; font-size:${FZ_BASE}; font-weight:900; margin:${mgGroup};">
                        ${taxRow}
                        <tr>
                            <td style="text-align:left; padding:4px 0; text-transform:uppercase; font-size:${FZ_SUBTITLE};">THANH TOAN:</td>
                            <td style="text-align:right; padding:4px 0; font-size:${FZ_TITLE}; font-weight:900;">${formatVNDReceipt(totalAmount)}</td>
                        </tr>
                    </table>`);
                break;
            }

            case 'qrCode': {
                const qrUrl = settings?.bankId && settings?.accountNo
                    ? `https://img.vietqr.io/image/${settings.bankId}-${settings.accountNo}-compact2.png?amount=${Math.round(totalAmount)}&addInfo=${encodeURIComponent('DH ' + orderData.id)}&accountName=${encodeURIComponent(settings.accountName || '')}`
                    : '';
                if (qrUrl) { combinedFooter.qrCodeURL = qrUrl; combinedFooter.hasAny = true; }
                // Thêm nhãn MoMo nếu được cấu hình
                if (settings?.momoEnabled && settings?.momoPhone) {
                    combinedFooter.textInfo = `<div style="margin-bottom:4px; text-align:center;"><span style="font-size:${FZ_TINY}; font-weight:900; color:#A50064;">💜 MoMo: ${settings.momoPhone}</span></div>` + combinedFooter.textInfo;
                    combinedFooter.hasAny = true;
                }
                break;
            }


            case 'wifi':
                if (settings?.wifiPass) {
                    combinedFooter.textInfo = `<div style="margin-bottom:5px; text-align:center; border:1px solid #555; padding:3px 5px; display:inline-block; width:100%; box-sizing:border-box;"><span style="font-size:${FZ_SMALL}; font-weight:900;">WIFI: ${settings.wifiPass}</span></div>` + combinedFooter.textInfo;
                    combinedFooter.hasAny = true;
                }
                break;

            case 'footer': {
                const customFooter = settings?.receiptFooter || 'Xin cam on & Hen gap lai!';
                combinedFooter.textInfo += `<div style="font-size:${FZ_TINY}; font-weight:600; text-align:center; line-height:1.3;">Hoa don xuat tu dong.<br/><div style="font-weight:900; font-size:${FZ_SMALL}; margin-top:4px; border-top:1px solid #000; padding-top:4px; display:inline-block; width:90%;">${customFooter.replace(/\n/g, '<br/>')}</div></div>`;
                combinedFooter.hasAny = true;
                break;
            }

            default: break;
        }
    });

    if (combinedFooter.hasAny) {
        const qrTd = combinedFooter.qrCodeURL
            ? `<td style="width:${isK58 ? '45%' : '40%'}; vertical-align:middle; text-align:center; padding-right:4px;">
                   <img src="${combinedFooter.qrCodeURL}" style="width:100%; max-width:90px; height:auto; border:1px solid #ccc; padding:2px; display:inline-block;"/>
                   <div style="font-size:${FZ_TINY}; font-weight:600; margin-top:2px;">Quet de thanh toan</div>
               </td>`
            : '';
        const txtTd = combinedFooter.textInfo
            ? `<td style="width:${combinedFooter.qrCodeURL ? (isK58 ? '55%' : '60%') : '100%'}; vertical-align:middle; text-align:center; padding-left:${combinedFooter.qrCodeURL ? '4px' : '0'};">${combinedFooter.textInfo}</td>`
            : '';
        htmlFragments.push(`<div style="border-top:1px dashed black; margin:${mgGroup};"></div><table style="width:100%; border-collapse:collapse; margin:${mgGroup};"><tr>${qrTd}${txtTd}</tr></table>`);
    }

    return `<div style="font-family: Arial, Helvetica, sans-serif; width: ${paperWidth}; margin: 0 auto; color: black; line-height: ${lh}; text-align: center; box-sizing: border-box; ${paperPadding}">${htmlFragments.join('')}<div style="height: 30px;"></div></div>`;
}
