/*
 * Plugin: Spotify Downloader via spotmate.online
 * Support: CommonJS & ESM
 * Author: Paduka Kyuu
 * License: MIT
 *
 * Instalasi:
 * npm install axios tough-cookie axios-cookiejar-support
 */

const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = async (m, conn) => {
    const { Reply, text, command, isCreator, isPremium, checkLimit, addLimit, isRegistered } = conn;

    if (!["spotmate", "spm", "spdlmate"].includes(command)) return;

    if (!isRegistered(m.sender) && !isCreator)
        return Reply(global.mess.verifikasi);

    if (checkLimit && checkLimit(m.sender, isPremium, isCreator))
        return Reply(global.mess.limit);

    if (!text) return Reply(`Contoh: .${command} https://open.spotify.com/track/xxx`);
    if (!text.includes("open.spotify.com/")) return Reply("❌ Link Spotify tidak valid!");

    const BASE_URL = "https://spotmate.online";
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));
    const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

    await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
    Reply("⏳ Sedang mengambil lagu dari Spotify...");

    try {
        await client.get(`${BASE_URL}/`, {
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8' },
            timeout: 10000
        });

        const mainRes = await client.get(`${BASE_URL}/en1`, {
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8' },
            timeout: 10000
        });

        const html = mainRes.data;
        let csrfToken = null;

        const patterns = [
            /X-Csrf-Token["']?\s*:\s*["']([a-zA-Z0-9]+)["']/,
            /csrfToken["']?\s*=\s*["']([a-zA-Z0-9]+)["']/,
            /"csrfToken"\s*:\s*"([a-zA-Z0-9]+)"/,
            /<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/
        ];

        for (const pat of patterns) {
            const match = html.match(pat);
            if (match) {
                csrfToken = match[1];
                break;
            }
        }

        if (!csrfToken) {
            if (mainRes.headers['x-csrf-token']) {
                csrfToken = mainRes.headers['x-csrf-token'];
            } else {
                throw new Error("Gagal mendapatkan CSRF token.");
            }
        }

        const trackPayload = { spotify_url: text.trim() };
        const trackRes = await client.post(`${BASE_URL}/getTrackData`, trackPayload, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'X-Csrf-Token': csrfToken,
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/en1`
            },
            timeout: 30000
        });

        const trackData = trackRes.data;
        if (!trackData || typeof trackData !== 'object' || !trackData.id) {
            throw new Error("Gagal mengambil data lagu.");
        }

        const convertPayload = { urls: text.trim() };
        const convertRes = await client.post(`${BASE_URL}/convert`, convertPayload, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'X-Csrf-Token': csrfToken,
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/en1`
            },
            timeout: 60000
        });

        const convertData = convertRes.data;
        if (!convertData || typeof convertData !== 'object' || !convertData.url) {
            throw new Error("Gagal mendapatkan link download.");
        }

        await conn.sendMessage(m.chat, {
            audio: { url: convertData.url },
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: m });

        if (addLimit) addLimit(m.sender, isPremium, isCreator);

    } catch (err) {
        console.error("[SPOTMATE ERROR]", err.message);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        Reply(`❌ Gagal: ${err.message}`);
    }
};

module.exports.command = ['spotmate', 'spm', 'spdlmate'];
module.exports.tags = ['downloader'];
module.exports.help = ['spotmate <link spotify> - Download lagu Spotify'];