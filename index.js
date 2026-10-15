const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

const userSessions = {};

// Google Sheet Web App URL
const SHEET_URL = "https://script.google.com/macros/s/AKfycbxlrk5xgFpZjkOnqOhX0R-lzwAaoUKgiN_eNTSJTBisEnEzxHikyGUUdWoz70f9aW4i0w/exec";

// 🍕 MENU ITEMS WITH UNIQUE KEYWORDS
const MENU_ITEMS = {
    '1': { name: 'Chicken Fajita', price: 1400, keywords: ['fajita'] },
    '2': { name: 'Pepperoni Pasta', price: 1500, keywords: ['pasta', 'pepperoni'] },
    '3': { name: 'Cheese Lover', price: 1300, keywords: ['cheese', 'lover'] },
    '4': { name: 'Chicken Tikka Pizza', price: 1450, keywords: ['tikka'] },
    '5': { name: 'BBQ Supreme Pizza', price: 1600, keywords: ['bbq', 'supreme'] },
    '6': { name: 'Garlic Bread (4 Pcs)', price: 450, keywords: ['garlic', 'bread'] },
    '7': { name: 'Zinger Burger', price: 550, keywords: ['zinger', 'burger'] },
    '8': { name: 'Cold Drink (1.5 Ltr)', price: 250, keywords: ['drink', 'cold', 'pepsi', 'coke'] }
};

const numberWords = {
    'one': 1, 'aik': 1, '1': 1,
    'two': 2, 'do': 2, '2': 2,
    'three': 3, 'teen': 3, '3': 3,
    'four': 4, 'char': 4, '4': 4,
    'five': 5, 'paanch': 5, '5': 5
};

function getFormattedMenu() {
    let menuText = `🍕 *Welcome to Pizza Point!* 🍕\n\n*Hamara Menu:*\n`;
    for (const key in MENU_ITEMS) {
        menuText += `${key}️⃣ *${MENU_ITEMS[key].name}* - Rs ${MENU_ITEMS[key].price}\n`;
    }
    menuText += `\n👉 Aap likh sakte hain (maslan: *2 fajita aur 1 drink*):`;
    return menuText;
}

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ 24/7 Cloud Ready Pizza Bot Active!');
});

client.on('message', async (msg) => {
    const from = msg.from;
    const body = msg.body.trim().toLowerCase();

    // Fresh Session Reset
    if (!userSessions[from] || body === 'reset' || body === 'cancel' || body === 'menu' || body === 'hi' || body === 'hello') {
        userSessions[from] = {
            step: 'AWAITING_ITEM',
            cart: [],
            pendingItems: [],
            tempItem: null,
            customerPhone: '',
            address: '',
            itemsSummary: '',
            totalBill: 0
        };
        await msg.reply(getFormattedMenu());
        return;
    }

    const currentStep = userSessions[from].step;

    // Step 1: Precise Keyword Matching
    if (currentStep === 'AWAITING_ITEM') {
        let textLower = body;
        let detectedItems = [];

        for (const key in MENU_ITEMS) {
            let item = MENU_ITEMS[key];
            let matchedKeyword = item.keywords.find(kw => textLower.includes(kw));

            if (textLower.includes(key) || matchedKeyword) {
                let qty = null;
                let searchTarget = matchedKeyword || key;

                let regexBefore = new RegExp(`(one|two|three|four|five|aik|do|teen|char|paanch|\\d+)\\s*(?:x)?\\s*.*${searchTarget}`, 'i');
                let matchBefore = textLower.match(regexBefore);

                if (matchBefore && matchBefore[1]) {
                    let val = matchBefore[1].toLowerCase();
                    qty = numberWords[val] || parseInt(val);
                } else {
                    let regexAfter = new RegExp(`${searchTarget}.*?(one|two|three|four|five|aik|do|teen|char|paanch|\\d+)`, 'i');
                    let matchAfter = textLower.match(regexAfter);

                    if (matchAfter && matchAfter[1]) {
                        let val = matchAfter[1].toLowerCase();
                        qty = numberWords[val] || parseInt(val);
                    } else {
                        qty = null; 
                    }
                }

                detectedItems.push({
                    name: item.name,
                    price: item.price,
                    qty: qty
                });
            }
        }

        if (detectedItems.length === 0) {
            let selected = null;
            if (MENU_ITEMS[body]) {
                selected = MENU_ITEMS[body];
            } else {
                for (const key in MENU_ITEMS) {
                    if (MENU_ITEMS[key].keywords.some(kw => body.includes(kw))) {
                        selected = MENU_ITEMS[key];
                        break;
                    }
                }
            }

            if (selected) {
                userSessions[from].tempItem = selected;
                userSessions[from].step = 'AWAITING_QTY';
                await msg.reply(`Aap ne select kiya: *${selected.name}* (Rs ${selected.price})\n\n🔢 Iski **Quantity** likh kar bhejein:`);
            } else {
                await msg.reply(`⚠️ Samajh nahi aaya. Baraye meherbani menu se number (1-8) ya item ka naam likhein:\n\n` + getFormattedMenu());
            }
            return;
        }

        let completeItems = [];
        let missingQtyItems = [];

        detectedItems.forEach(di => {
            if (di.qty !== null && di.qty > 0) {
                completeItems.push({
                    name: di.name,
                    price: di.price,
                    qty: di.qty,
                    subtotal: di.price * di.qty
                });
            } else {
                missingQtyItems.push(di);
            }
        });

        completeItems.forEach(ci => userSessions[from].cart.push(ci));

        if (missingQtyItems.length > 0) {
            userSessions[from].pendingItems = missingQtyItems;
            userSessions[from].step = 'AWAITING_MISSING_QTY';

            let firstMissing = missingQtyItems[0];
            await msg.reply(`✅ Kuch items add ho gaye hain.\n\n⚠️ Lekin aapne *${firstMissing.name}* ki quantity nahi batayi.\n🔢 Baraye meherbani iski **Quantity** likh kar bhejein:`);
        } else {
            userSessions[from].step = 'ASK_MORE';
            let summaryMsg = `✅ Cart mein add ho gaya:\n`;
            completeItems.forEach(ci => {
                summaryMsg += `• ${ci.qty}x ${ci.name} (Rs ${ci.subtotal})\n`;
            });
            await msg.reply(summaryMsg + `\nKya aap mazeed kuch add karna chahte hain?\n👉 **Yes** likhein menu dekhne ke liye.\n👉 **No** likhein order finalize karne ke liye.`);
        }
        return;
    }

    // Step 1.1: Resolve Missing Quantities
    if (currentStep === 'AWAITING_MISSING_QTY') {
        const qty = parseInt(body);
        if (isNaN(qty) || qty <= 0) {
            await msg.reply(`⚠️ Baraye meherbani koi sahi number (maslan 1, 2) quantity ke tor par likhein.`);
            return;
        }

        let pendingList = userSessions[from].pendingItems;
        let currentItem = pendingList.shift();

        userSessions[from].cart.push({
            name: currentItem.name,
            price: currentItem.price,
            qty: qty,
            subtotal: currentItem.price * qty
        });

        if (pendingList.length > 0) {
            userSessions[from].pendingItems = pendingList;
            let nextItem = pendingList[0];
            await msg.reply(`✅ Thik hai! Ab batayein *${nextItem.name}* ki kitni **Quantity** chahiye?`);
        } else {
            userSessions[from].step = 'ASK_MORE';
            await msg.reply(`✅ Sabhi items ki quantity update ho gayi hai!\n\nKya aap mazeed kuch add karna chahte hain?\n👉 **Yes** likhein menu dekhne ke liye.\n👉 **No** likhein order finalize karne ke liye.`);
        }
        return;
    }

    // Step 2: Explicit Quantity Selection
    if (currentStep === 'AWAITING_QTY') {
        const qty = parseInt(body);
        if (isNaN(qty) || qty <= 0) {
            await msg.reply(`⚠️ Baraye meherbani koi sahi number (maslan 1, 2) quantity ke tor par likhein.`);
            return;
        }

        const item = userSessions[from].tempItem;
        const subtotal = item.price * qty;

        userSessions[from].cart.push({
            name: item.name,
            price: item.price,
            qty: qty,
            subtotal: subtotal
        });

        userSessions[from].step = 'ASK_MORE';

        await msg.reply(`✅ *${qty}x ${item.name}* cart mein add ho gaya!\n\nKya aap mazeed kuch add karna chahte hain?\n👉 **Yes** likhein menu dekhne ke liye.\n👉 **No** likhein order finalize karne ke liye.`);
        return;
    }

    // Step 3: Ask More Items
    if (currentStep === 'ASK_MORE') {
        if (body.includes('yes') || body.includes('han') || body.includes('aur')) {
            userSessions[from].step = 'AWAITING_ITEM';
            await msg.reply(getFormattedMenu());
        } else {
            userSessions[from].step = 'AWAITING_PHONE';
            await msg.reply(`📞 Baraye meherbani apna **Mobile Number** likh kar bhejein:`);
        }
        return;
    }

    // Step 4: Get Phone Number
    if (currentStep === 'AWAITING_PHONE') {
        userSessions[from].customerPhone = body;
        userSessions[from].step = 'AWAITING_ADDRESS';

        await msg.reply(`📍 Ab apna **Delivery Address** likh kar bhejein:`);
        return;
    }

    // Step 5: Get Address & Ask for Final Order Confirmation
    if (currentStep === 'AWAITING_ADDRESS') {
        userSessions[from].address = body;
        const session = userSessions[from];

        let totalBill = 0;
        let itemsSummary = '';
        session.cart.forEach((cartItem) => {
            totalBill += cartItem.subtotal;
            itemsSummary += `\n• ${cartItem.qty}x ${cartItem.name} (Rs ${cartItem.subtotal})`;
        });

        session.totalBill = totalBill;
        session.itemsSummary = itemsSummary;
        session.step = 'AWAITING_FINAL_CONFIRMATION';

        const summaryPrompt = `📝 *Aapka Order Summary:*
------------------------------------${itemsSummary}
------------------------------------
💰 *Total Bill:* Rs ${totalBill}
📞 *Phone:* ${session.customerPhone}
📍 *Address:* ${session.address}

❓ *Kya aap apna order confirm karna chahte hain?*
👉 Reply **YES** order confirm karne ke liye.
👉 Reply **NO** order cancel karke dobara menu par jane ke liye.`;

        await msg.reply(summaryPrompt);
        return;
    }

    // Step 6: Final Confirmation Handling
    if (currentStep === 'AWAITING_FINAL_CONFIRMATION') {
        if (body.includes('yes') || body.includes('haan') || body.includes('ha') || body.includes('y')) {
            const session = userSessions[from];

            try {
                await fetch(SHEET_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: session.customerPhone,
                        item: session.itemsSummary.trim(),
                        price: `Rs ${session.totalBill}`,
                        address: session.address
                    })
                });
                console.log('✅ Confirmed order saved to Google Sheet!');
            } catch (error) {
                console.error('❌ Error saving to Google Sheet:', error);
            }

            const confirmationText = `🎉 *Order Successfully Confirm Ho Gaya!* 🎉\n\n` +
                `🛵 Aapka order 30-40 minutes mein deliver ho jaye ga!\n` +
                `💳 *Payment:* Cash on Delivery\n\n` +
                `Shukriya! Dobara order ke liye *Menu* likhein.`;

            userSessions[from] = { step: 'AWAITING_ITEM', cart: [], pendingItems: [] };
            await msg.reply(confirmationText);

        } else if (body.includes('no') || body.includes('nahi') || body.includes('n') || body.includes('cancel')) {
            userSessions[from] = { step: 'AWAITING_ITEM', cart: [], pendingItems: [] };
            await msg.reply(`❌ Order cancel kar diya gaya hai. Purana sab data saaf kar diya hai, aaiye naya order banate hain:\n\n` + getFormattedMenu());
        } else {
            await msg.reply(`⚠️ Baraye meherbani order confirm karne ke liye sirf **YES** ya cancel karne ke liye **NO** likhein.`);
        }
        return;
    }
});

client.initialize();