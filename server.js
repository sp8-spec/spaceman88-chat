const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

const chatHistories = {};
const humanTakeover = {};

const SYSTEM_PROMPT = `
Anda adalah Customer Service resmi yang sangat profesional, empati, formal, dan tenang untuk platform game online "Spaceman88".

ATURAN UTAMA RESPON:
1. GREETING & NAMA:
   - Sapa selalu menggunakan kata "Bapak" (Contoh: "Baik Bapak [Nama]", "Siap Bapak [Nama]").
   - DILARANG keras mengulang-ulang kata "Selamat datang" di setiap balasan! Salam registrasi hanya untuk awal chat saja.

2. PENANGANAN MEMBER MARAH / EMOSI / SPAM (DE-ESCALATION):
   - Jika member emosi atau marah:
     a. TETAP TENANG & JANGAN EMOSI. Dilarang membalas defensif.
     b. Berikan kalimat penenang dan validasi empati terlebih dahulu (Contoh: "Mohon maaf atas ketidaknyamanannya Bapak. Kami sangat memahami kekecewaan Bapak...").
     c. Minta member menyampaikan detail kendala satu per satu agar tim kami bisa bantu selesaikan secepatnya.

3. KENDALA & MULTI-VERIFIKASI (DOUBLE CHECK):
   - Konfirmasi/verifikasi ulang detail kendala member terlebih dahulu (User ID, nominal, atau bukti pendukung) sebelum memberikan solusi pasti.

4. GAYA BAHASA & KELENGKAPAN:
   - Singkat, padat, lugas, santun, dan langsung ON-POINT (maksimal 2-4 kalimat).

5. FOKUS LAYANAN & SOFT PIVOT:
   - HANYA melayani seputar situs game online Spaceman88. Jika di luar topik, beri jawaban singkat lalu beralih secara halus kembali ke layanan Spaceman88.
`;

io.on('connection', (socket) => {
    socket.on('join_chat', ({ username, category }) => {
        socket.join(socket.id);
        chatHistories[socket.id] = [
            { role: "system", content: SYSTEM_PROMPT }
        ];
        humanTakeover[socket.id] = false;

        io.emit('new_user_connected', {
            socketId: socket.id,
            username: username || 'Member',
            category: category || 'Umum'
        });
    });

    socket.on('user_message', async (data) => {
        const { message, username } = data;

        io.emit('admin_receive_message', {
            socketId: socket.id,
            sender: username || 'Member',
            message: message,
            isAdmin: false
        });

        if (humanTakeover[socket.id]) return;

        chatHistories[socket.id].push({ 
            role: "user", 
            content: `User Name: ${username || 'Member'}. Message: ${message}` 
        });

        try {
            const completion = await groq.chat.completions.create({
                messages: chatHistories[socket.id],
                model: "openai/gpt-oss-120b",
                temperature: 0.5,
                max_tokens: 250
            });

            const aiReply = completion.choices[0].message.content;
            chatHistories[socket.id].push({ role: "assistant", content: aiReply });

            // Jeda Balas 10 Detik
            setTimeout(() => {
                socket.emit('bot_reply', { message: aiReply });
                
                io.emit('admin_receive_message', {
                    socketId: socket.id,
                    sender: 'CS Spaceman88 (AI)',
                    message: aiReply,
                    isAdmin: true
                });
            }, 10000);

        } catch (error) {
            console.error("Groq Error:", error);
            setTimeout(() => {
                socket.emit('bot_reply', { 
                    message: "Mohon maaf Bapak, sistem kami sedang mengalami sedikit kendala. Mohon tunggu sebentar ya Bapak." 
                });
            }, 10000);
        }
    });

    socket.on('admin_takeover', ({ targetSocketId }) => {
        humanTakeover[targetSocketId] = true;
    });

    socket.on('admin_message', ({ targetSocketId, message }) => {
        io.to(targetSocketId).emit('bot_reply', { message: message });
        
        io.emit('admin_receive_message', {
            socketId: targetSocketId,
            sender: 'CS Spaceman88 (Human)',
            message: message,
            isAdmin: true
        });
    });

    socket.on('disconnect', () => {
        delete chatHistories[socket.id];
        delete humanTakeover[socket.id];
        io.emit('user_disconnected', { socketId: socket.id });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server Spaceman88 running on port ${PORT}`);
});
