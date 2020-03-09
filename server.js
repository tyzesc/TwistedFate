const Dcard = require('./api/api');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const config = {
    savetime: 15,
    checktime: 300,
    usersPath: 'users.json',
    logWithFile: true,
    logFilePath: 'logs.log'
}

let users = {};

if (fs.existsSync(config.usersPath)) {
    readfileLock = true;
    log(`載入現有用戶資料中... ${config.usersPath}`);
    users = JSON.parse(fs.readFileSync(config.usersPath).toString());
}

if (config.logWithFile) {
    log(`Log 將儲存至 ${config.logFilePath}`);
}

const bot = new TelegramBot(process.env.TWISTEDFATE_TELEGRAM_TOKEN, { polling: true });

let protectLock = {};
bot.on('message', async msg => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const text = msg.text;
    if (text.startsWith('/dcard')) {
        // 防止洗頻連續登入
        if (protectLock[chatId] === undefined)
            protectLock[chatId] = new Date();
        else {
            if ((new Date()) - protectLock[chatId] < 10 * 1000)
                return bot.sendMessage(chatId, `請勿在十秒內重複登入`);
            else
                protectLock[chatId] = new Date();
        }

        let email = text.split(' ')[1];
        let password = text.split(' ')[2];
        let user = users[chatId];
        if (user === undefined) { user = users[chatId] = { token: "", platform: "tg", lastupdate: getTodayDateIntLike() } };

        if (user.token === "")
            return bot.sendMessage(chatId, `首次使用請輸入\n\`/dcard xxxxx@xxx.edu.tw password\``, { parse_mode: 'MarkdownV2' });

        if (email !== undefined && password !== undefined) {
            let header = '小精靈正前往 Dcard 送信';
            let footer = '之後，機器人將替您每日抽卡！\n\n#交朋友這種小事';

            let count = 0;
            let max = 5;
            let msg = await bot.sendMessage(chatId, `${header}\n${footer}`);
            let interval = setIntervalImmediately(() => {
                try {
                    let loadings = "[";
                    loadings += "　".repeat(count * 2);
                    loadings += "ᗣ";
                    loadings += "　".repeat((max - count) * 2);
                    loadings += "] Dcard總部";
                    bot.editMessageText(`${header}\n\n${loadings}\n\n${footer}`, { chat_id: chatId, message_id: msg.message_id });
                    count++;
                } catch (e) { }
            }, 1000);

            try {
                user.token = await Dcard.login(email, password);
                if (user.token !== "")
                    bot.editMessageText('登入成功，機器人將替您每日抽卡！\n請放心，您的帳號密碼不會儲存在伺服器上。\n開源程式碼：https://github.com/tyzesc/TwistedFate\n\n#交朋友這種小事', { chat_id: chatId, message_id: msg.message_id });
            } catch (e) {
                return bot.editMessageText('登入失敗，請檢查帳號密碼是否正確？', { chat_id: chatId, message_id: msg.message_id });
            } finally {
                clearInterval(interval);
            }
        }

        try {
            let result = await Dcard.draw(user.token);
            sendTo(chatId, result.dcard);
        } catch (e) {
            return bot.sendMessage(chatId, e.message);
        }
    } else {
        return bot.sendMessage(chatId, `首次使用請輸入\n\`/dcard xxxxx@xxx.edu.tw password\``, { parse_mode: 'MarkdownV2' });
    }
});

bot.on('callback_query', async query => {
    let id = query.from.id;
    let data = query.data;
    if (data === "accept") {
        bot.editMessageReplyMarkup({}, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        let user = users[id];
        if (user === undefined || user.token === "")
            return bot.sendMessage(id, '登入憑證過期，請先執行 `/dcard xxxxx@xxx.edu.tw password`', { parse_mode: 'MarkdownV2' })
        Dcard.accept(user.token)
            .then(result => {
                if (result.bothAccept === true) {
                    bot.sendMessage(id, `對方也想和你成為卡友！\n\n#交朋友這種小事`);
                } else {
                    bot.sendMessage(id, `願對方和你有相同默契，\n有緣之人必將心有靈犀。\n\n#交朋友這種小事`);
                }
            }).catch(err => {
                bot.sendMessage(id, err.message);
            });
    }
});

setIntervalImmediately(async () => {
    log(`儲存用戶紀錄 ${Object.keys(users).length}筆`, false);
    fs.writeFileSync(config.usersPath, JSON.stringify(users), 'utf-8');
}, config.savetime * 1000);

setIntervalImmediately(async () => {
    log(`檢查所有用戶抽卡紀錄`, false);
    console.log(Object.keys(users).length);
    for (let id in users) {
        let user = users[id];
        if (user.token === "") continue;
        if (user.platform === 'tg') {
            log(`嘗試登入 ${id} ${user.token}`, false);
            let nowtime = getTodayDateIntLike();
            if (user.lastupdate >= nowtime) continue;
            Dcard.draw(user.token)
                .then(result => sendTo(id, result.dcard))
                .catch(e => bot.sendMessage(id, e.message));
        }
    }
}, config.checktime * 1000);

function getTodayDateIntLike() {
    let d = new Date();
    return parseInt(`${d.getFullYear()}${("0" + (d.getMonth() + 1)).slice(-2)}${("0" + d.getDate()).slice(-2)}`);
}

function getNowTimeString() {
    let d = new Date();
    return `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${("0" + d.getDate()).slice(-2)} ${("0" + d.getHours()).slice(-2)}:${("0" + d.getMinutes()).slice(-2)}:${("0" + d.getSeconds()).slice(-2)}`;
}

function setIntervalImmediately(func, interval) {
    func();
    return setInterval(func, interval);
}

function log(msg, savefile) {
    let s = `[${getNowTimeString()}] ${msg}`;
    if (config.logWithFile && savefile != false)
        fs.appendFileSync(config.logFilePath, s + "\n");
    console.log(s);
}

function sendTo(id, dcard) {
    log(`卡友 #${dcard.school} #${dcard.department} #${dcard.gender} ${dcard.avatar}`);
    bot.sendPhoto(id, dcard.avatar, {
        caption: `#${dcard.school} #${dcard.department} #${(dcard.gender === "F" ? "女同學" : "男同學")}`,
        reply_markup: {
            'inline_keyboard': [
                [{ text: `就是${(dcard.gender === "F" ? "妳" : "你")}了！！！`, 'callback_data': 'accept' }]
            ]
        }
    });
    users[id].lastupdate = getTodayDateIntLike();
}