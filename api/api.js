const fetch = require('node-fetch');
const puppeteer = require('puppeteer');

const header = {
    'Host': 'www.dcard.tw',
    'Cookie': '__cfduid=d5fae599f599246899d943a21011df03e1583551959',
    'Cookie2': '$Version=1',
    'Accept-Encoding': '*',
    'Connection': 'Keep-Alive',
    'User-Agent': "Dcard-Android/5.1.1; Dalvik/1.6.0 (Linux; U; Android 4.4.2; SM-G7109 Build/KOT49H)",
    'Authorization': ``
}
/**
 * 模擬使用瀏覽器登入 Dcard
 * 
 * @async
 * @param {string} email Dcard 信箱
 * @param {string} password Dcard 密碼
 * @return {Promise<string>} Dcard API Token
 */
async function login(email, password) {
    let access_token = "";
    try {
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(10 * 1000);
        await page.goto('https://www.dcard.tw/signup');
        await page.type(`input[type='email']`, email);
        await page.type(`input[type='password']`, password);
        await page.evaluate(() => {
            document.querySelectorAll(`button`).forEach(elem => { if (elem.innerText === '註冊 / 登入') elem.click(); })
        });
        await page.waitForNavigation();
        await page.setRequestInterception(true);
        let found = false;
        page.on('request', request => {
            const headers = request.headers();
            if (found === false && headers !== undefined && headers.authorization !== undefined) {
                found = true;
                access_token = headers.authorization;
            }
            request.continue({ headers });
        });
        await page.click(`a[title='抽卡']`);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await browser.close();
    } catch (e) {
        console.error(e);
        throw new Error('puppeteer error');
    }
    if (access_token === "") throw new Error('登入失敗，請檢查帳號密碼是否正確？');
    return access_token;
}

/**
 * 
 * responce avalible keys:
 * - matched: ['department', 'gender']
 * - wishCountdown: 3
 * - wishes: 
 *     - gender: 'different'
 *     - school: 'mine'
 *     - department: 'other'
 * - accept: true
 * - bothAccept: true
 * - memberId: 2602810
 * - matchedAt: '2020-03-09T00:00:00.000Z'
 * - dcard: 
 *     - gender: 'F'
 *     - department: '護理系'
 *     - school: '長庚科技大學'
 *     - grade: ''
 *     - talent: ''
 *     - club: '熱舞 志工'
 *     - lecture: '英文'
 *     - lovedCountry: '台灣'
 *     - trouble: ''
 *     - wantToTry: '自己一個人去旅行！自己一個人去做很多很多事'
 *     - exchange: ''
 *     - workExperience: ''
 *     - bloodType: ''
 *     - avatar: 'https://photos.dcard.tw/memberPhotos/2db57835-0c89-47fe-8453-c83650b736ea'
 * 
 * if there is error (1317 代表三日未抽卡):
 * - dcard: null
 * - error: 1317
 * - reason: 'system'
 * 
 * @async
 * @param {string} token Dcard API Token
 * @return {Promise<Object>} responce
 */
async function draw(token) {
    if (token === undefined)
        throw new Error('token 不能為空');

    let hc = JSON.parse(JSON.stringify(header)); hc.Authorization = token;

    try {
        let today = await fetch("https://www.dcard.tw/v2/dcard", { method: "GET", headers: hc }).then(res => res.json());
        if (today.dcard === null)
            throw new Error('抽卡發生問題（可能是太久沒登入）');
        return today;
    } catch (e) {
        throw new Error('Dcard API 存取被拒');
    }
}

/**
 * 
 * result: { bothAccept: true }
 * 
 * @async
 * @param {string} token Dcard API Token
 * @param {string} greeting 訊息
 * @return {Promise<Object>} result
 */
async function accept(token, greeting = 'Good morning.') {
    try {
        let hc = JSON.parse(JSON.stringify(header)); hc.Authorization = token;
        let result = await fetch("https://www.dcard.tw/v2/dcard/accept", { method: "POST", headers: hc, body: JSON.stringify({ firstMessage: greeting }) }).then(res => res.json());
        return result;
    } catch (e) {
        throw new Error('Dcard API 存取被拒');
    }
}

module.exports.login = login;
module.exports.draw = draw;
module.exports.accept = accept;