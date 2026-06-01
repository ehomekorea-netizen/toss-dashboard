// Vercel Serverless Function (api/analyze.js)
// 이 백엔드 코드는 Vercel 서버에서 실행되며, API 키를 브라우저에 노출하지 않고 안전하게 보관합니다.
const https = require('https');

// 모든 Node.js 버전에서 호환되는 native https 모듈 기반의 Promise POST 요청 함수
function post(url, payload) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(payload);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Invalid JSON response from Google API'));
                    }
                } else {
                    reject(new Error(`Google API responded with status ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

module.exports = async (req, res) => {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const { totalAmount, data } = req.body;
        
        // Vercel 환경 변수에서 안전하게 API 키 로드
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'Vercel 대시보드에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' 
            });
        }

        const topCategories = data.slice(0, 4).map(c => `${c.name} (${c.percent}%, ${c.total.toLocaleString()}원)`).join(', ');
        const prompt = `사용자의 이번 달 총 지출액은 ${totalAmount.toLocaleString()}원입니다. 지출 비중이 가장 높은 상위 4개 카테고리는 ${topCategories} 입니다. 당신은 친절하고 전문적인 재무 상담사입니다. 이 데이터를 바탕으로 사용자의 이번 달 소비 습관을 분석하고, 잘한 점과 개선할 점, 그리고 다음 달을 위한 절약 팁을 3~4문장으로 짧고 다정하게 요약해 주세요.`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const systemInstruction = "당신은 최고의 재무 분석가입니다. 마크다운 기호를 쓰지말고 자연스러운 평문으로 작성하세요. ";
        const payload = {
            contents: [{ parts: [{ text: systemInstruction + prompt }] }]
        };

        const result = await post(apiUrl, payload);
        res.status(200).json(result);
    } catch (error) {
        console.error('Serverless Function Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
