require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Раздаем статику из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Наш WebSocket сервер, куда подключается frontend
const wss = new WebSocket.Server({ server, path: '/ws/yandex/' });

const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;

// Предполагаемый endpoint для Yandex Realtime (OpenAI compatible)
const YANDEX_WS_URL = process.env.YANDEX_WS_URL || 'wss://rest-assistant.api.cloud.yandex.net/v1/realtime/openai?model=gpt%3A%2F%2Fb1g66l00go2r0r9itna7%2Fspeech-realtime-250923%2Flatest';

wss.on('connection', (clientWs) => {
    console.log('✅ Frontend подключен');

    if (!YANDEX_API_KEY) {
        clientWs.send(JSON.stringify({ type: 'error', error: { message: 'Не задан YANDEX_API_KEY на сервере' } }));
        clientWs.close();
        return;
    }

    // Подключаемся к Yandex Realtime API
    const yandexWs = new WebSocket(YANDEX_WS_URL, {
        headers: {
            'Authorization': `Api-Key ${YANDEX_API_KEY}`,
            'x-folder-id': YANDEX_FOLDER_ID
        }
    });

    let isSetup = false;

    yandexWs.on('open', () => {
        console.log('✅ Успешное подключение к серверам Яндекса');
        // Обновляем сессию Яндекса, похожую на то что было в code.txt
        const sessionUpdate = {
            type: "session.update",
            session: {
                instructions: "Ты дружелюбный ассистент JARVIS. Отвечай кратко и приветливо.", 
                audio: {
                    input: {
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.5,
                            silence_duration_ms: 500
                        }
                    },
                    output: {
                        voice: "dasha" // или другая (kirill, anton, etc)
                    }
                }
            }
        };
        yandexWs.send(JSON.stringify(sessionUpdate));

        // Отправляем на фронтенд сигнал о готовности
        clientWs.send(JSON.stringify({ type: 'gemini.setup.complete' }));
    });

    yandexWs.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('📩 От Яндекса:', message.type);
        
        if (message.type === 'response.output_audio.delta' || message.type === 'response.audio.delta') {
            console.log('Audio delta keys:', Object.keys(message));
        }

        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
        }
    });

    yandexWs.on('error', (err) => {
        console.error('❌ Ошибка Яндекса:', err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', error: { message: 'Ошибка связи с Яндексом: ' + err.message } }));
        }
    });

    yandexWs.on('close', () => {
        console.log('❌ Яндекс отключился');
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    // Обработка сообщений от frontend (например, audio.append или ping)
    clientWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'ping') {
            clientWs.send(JSON.stringify({ type: 'pong' }));
            return;
        }

        if (yandexWs.readyState === WebSocket.OPEN) {
            yandexWs.send(data.toString()); // Перенаправляем input_audio_buffer.append и т.п.
        }
    });

    clientWs.on('close', () => {
        console.log('Frontend отключился');
        yandexWs.close();
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🌐 Сервер запущен на http://localhost:${PORT}`);
    console.log(`🎤 Перейдите в браузер для тестирования Yandex Speech Realtime v250923`);
});
