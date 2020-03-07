const fetch = require('node-fetch')
const puppeteer = require('puppeteer');
const fs = require('fs');
const email = process.argv[2] || process.env.DCARD_EMAIL;
const password = process.argv[3] || process.env.DCARD_PASSWORD;
const tokenFilePath = 'DCARD_TOKEN';
const greeting = '早';

let access_token = process.env.DCARD_TOKEN;

(async() => {
    if (access_token === undefined) {
        if (fs.existsSync(tokenFilePath)) {
            console.log(`讀取到舊有登入紀錄，開始執行抽卡程式。`);
            access_token = fs.readFileSync(tokenFilePath, 'utf-8');
        } else {
            console.log(`查無登入紀錄，嘗試自動登入...`);
            if (email === undefined || password === undefined)
                return console.error(`無登入資訊，可以嘗試這樣執行指令：\nnode dcard.js xxxxx@xxx.edu.tw password`);
            const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
            const page = await browser.newPage();

            console.log(`[Dcard 登入] 連線頁面...`);
            await page.goto('https://www.dcard.tw/signup');

            await page.type(`input[type='email']`, email);
            await page.type(`input[type='password']`, password);
            console.log(`[Dcard 登入] 嘗試登入...`);
            await page.evaluate(() => {
                document.querySelectorAll(`button`).forEach(elem => { if (elem.innerText === '註冊 / 登入') elem.click(); })
            });
            await page.waitForNavigation();

            console.log(`[Dcard 登入] 開始攔截登入封包...`);
            await page.setRequestInterception(true);

            let found = false;
            page.on('request', request => {
                const headers = request.headers();
                if (found === false && headers !== undefined && headers.authorization !== undefined) {
                    found = true;
                    console.log(`[Dcard 登入] 攔截到登入資訊，存檔中...`);
                    access_token = headers.authorization;
                    try {
                        fs.writeFileSync(tokenFilePath, access_token, 'utf-8')
                    } catch (err) {
                        console.error(`[Dcard 登入] 存檔失敗 ${err}`);
                    }
                }
                request.continue({ headers });
            });
            await page.click(`a[title='抽卡']`);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            console.log(`[Dcard 登入] 完成`);
            await browser.close();
        }
    } else {
        console.log(`使用環境設定...`);
    }

    let header = {
        'Host': 'www.dcard.tw',
        'Cookie': '__cfduid=d5fae599f599246899d943a21011df03e1583551959',
        'Cookie2': '$Version=1',
        'Accept-Encoding': '*',
        'Connection': 'Keep-Alive',
        'User-Agent': "Dcard-Android/5.1.1; Dalvik/1.6.0 (Linux; U; Android 4.4.2; SM-G7109 Build/KOT49H)",
        'Authorization': `${access_token}`
    }
    try {
        let today = await fetch("https://www.dcard.tw/v2/dcard", { method: "GET", headers: header }).then(res => res.json());
        let dcard = today.dcard;
        console.log(`[Dcard 抽卡] ${dcard.school} ${dcard.department} ${dcard.gender == 'M' ? "男同學" : "女同學"}`);
        if (today.accept === false) {
            await fetch("https://www.dcard.tw/v2/dcard/accept", { method: "POST", headers: header, body: JSON.stringify({ firstMessage: greeting }) }).then(res => res.json());
            console.log(`[Dcard 抽卡] 成功送出邀請！`);
        } else {
            console.log(`[Dcard 抽卡] 今日已送出邀請`);
        }
    } catch (e) {
        console.error(`access Dcard error ${e}`);
    }
})();