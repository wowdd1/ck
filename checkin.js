let domain = "这里填机场域名";
let user = "user1,user2,user3";
let pass = "pass1,pass2,pass3";
let 签到结果;
let BotToken = '';
let ChatID = '';

export default {
    // HTTP 请求处理函数保持不变
    async fetch(request, env, ctx) {
        await initializeVariables(env);
        const url = new URL(request.url);
        if (url.pathname == "/tg") {
            await sendMessage();
        } else if (url.pathname == "/checkin" ) { // 使用 pass[0] 作为路径
            await checkin();
        }
        return new Response(签到结果, {
            status: 200,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
    },

    // 定时任务处理函数
    async scheduled(controller, env, ctx) {
        console.log('Cron job started');
        try {
            await initializeVariables(env);
            await checkin();
            console.log('Cron job completed successfully');
        } catch (error) {
            console.error('Cron job failed:', error);
            签到结果 = `定时任务执行失败: ${error.message}`;
            await sendMessage(签到结果);
        }
    },
};

async function initializeVariables(env) {
    domain = env.JC || env.DOMAIN || domain;
    user = env.ZH || env.USER || user;
    pass = env.MM || env.PASS || pass;
    if (!domain.includes("//")) domain = `https://${domain}`;
    BotToken = env.TGTOKEN || BotToken;
    ChatID = env.TGID || ChatID;

    // 将 user 和 pass 转换为数组
    user = user.split(',');
    pass = pass.split(',');

    // 确保 user 和 pass 数组长度一致
    if (user.length !== pass.length) {
        throw new Error('用户和密码数组长度不一致');
    }

    签到结果 = `地址: ${domain.substring(0, 9)}****${domain.substring(domain.length - 5)}\nTG推送: ${BotToken !== '' && ChatID !== ''}`;
}

async function sendMessage(msg = "") {
    const 账号信息 = `地址: ${domain}\n账号: ${user.map(u => `${u.substring(0, 1)}****${u.substring(u.length - 5)}`).join(', ')}\n密码: <tg-spoiler>${pass.map(p => `${p.substring(0, 1)}****${p.substring(p.length - 1)}`).join(', ')}</tg-spoiler>`;
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const formattedTime = beijingTime.toISOString().slice(0, 19).replace('T', ' ');
    console.log(msg);
    if (BotToken !== '' && ChatID !== '') {
        const url = `https://api.telegram.org/bot${BotToken}/sendMessage?chat_id=${ChatID}&parse_mode=HTML&text=${encodeURIComponent("执行时间: " + formattedTime + "\n" + 账号信息 + "\n\n" + msg)}`;
        return fetch(url, {
            method: 'get',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.72'
            }
        });
    }
}

// checkin 函数修改
async function checkin() {
    try {
        if (!domain || !user || !pass) {
            throw new Error('必需的配置参数缺失');
        }

        let allResults = [];

        for (let i = 0; i < user.length; i++) {
            const currentUser = user[i];
            const currentPass = pass[i];

            // 登录请求
            const loginResponse = await fetch(`${domain}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Origin': domain,
                    'Referer': `${domain}/auth/login`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'DNT': '1',
                },
                body: new URLSearchParams({
                    host: domain,
                    email: currentUser,
                    passwd: currentPass,
                    code: "",
                }).toString(),
            });

            // 获取 Cookie
            const cookieHeader = loginResponse.headers.get('set-cookie');
            if (!cookieHeader) {
                throw new Error('未收到Cookie');
            }

            console.log('Received cookies:', cookieHeader);
            const cookies = cookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

            // 等待确保登录状态
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 签到请求
            const checkinResponse = await fetch(`${domain}/user/checkin`, {
                method: 'POST',
                headers: {
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/json',
                    'Origin': domain,
                    'Referer': `${domain}/user`,
                    'X-Requested-With': 'XMLHttpRequest'
                },
            });

            console.log('Checkin Response Status:', checkinResponse.status);

            const responseText = await checkinResponse.text();
            console.log('Checkin Raw Response:', responseText);

            try {
                const checkinResult = JSON.parse(responseText);
                console.log('Checkin Result:', checkinResult);

                let resultMessage;
                if (checkinResult.ret === 1 || checkinResult.ret === 0) {
                    resultMessage = `🎉 签到结果 🎉\n账号: ${currentUser.substring(0, 1)}****${currentUser.substring(currentUser.length - 5)}\n${checkinResult.msg || (checkinResult.ret === 1 ? '签到成功' : '签到失败')}`;
                } else {
                    resultMessage = `🎉 签到结果 🎉\n账号: ${currentUser.substring(0, 1)}****${currentUser.substring(currentUser.length - 5)}\n${checkinResult.msg || '签到结果未知'}`;
                }

                allResults.push(resultMessage);
            } catch (e) {
                if (responseText.includes('登录')) {
                    throw new Error('登录状态无效，请检查Cookie处理');
                }
                throw new Error(`解析签到响应失败: ${e.message}\n\n原始响应: ${responseText}`);
            }
        }

        // 合并所有签到结果
        签到结果 = allResults.join('\n\n');

        await sendMessage(签到结果);
        return 签到结果;

    } catch (error) {
        console.error('Checkin Error:', error);
        签到结果 = `签到过程发生错误: ${error.message}`;
        await sendMessage(签到结果);
        return 签到结果;
    }
}
