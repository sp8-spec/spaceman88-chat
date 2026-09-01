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

// Menyimpan riwayat percakapan & status alih manusia (Human Takeover)
const chatHistories = {};
const humanTakeover = {};

const SYSTEM_PROMPT = `
Anda adalah Customer Service resmi yang sangat profesional, empati, formal, dan tenang untuk platform game online "Spaceman88".

ATURAN UTAMA RESPON:
1. GREETING & NAMA:
   - Sapa selalu menggunakan kata "Bapak" (Contoh: "Baik Bapak [Nama]", "Siap Bapak [Nama]", "Tentu Bapak [Nama]").
   - DILARANG keras mengulang-ulang kata "Selamat datang" di setiap balasan! Salam registrasi/selamat datang hanya untuk balasan pertama kali saja.

2. PENANGANAN MEMBER MARAH / EMOSI / SPAM (DE-ESCALATION):
   - Jika member menunjukkan emosi tinggi, kata-kata kasar, marah, atau spam:
     a. TETAP TENANG & JANGAN EMOSI. Dilarang keras membalas dengan nada defensif, menyalahkan, atau kaku.
     b. Berikan kalimat penenang dan validasi empati terlebih dahulu (Contoh: "Mohon maaf atas ketidaknyamanannya Bapak. Kami sangat memahami kekecewaan Bapak...").
     c. Minta member untuk beristirahat/mendinginkan suasana sejenak atau menyampaikan detail kendala satu per satu agar tim kami bisa bantu selesaikan secepatnya.
     d. Berikan saran yang konstruktif dan solutif dengan tutur kata yang sangat santun.

3. KENDALA & MULTI-VERIFIKASI (DOUBLE CHECK):
   - Jika member menyampaikan kendala (deposit, withdraw, login, game error), lakukan konfirmasi/verifikasi ulang detail kendala member terlebih dahulu (misal: menanyakan User ID, nominal, atau bukti pendukung) sebelum memberikan solusi pasti.

4. GAYA BAHASA & KELENGKAPAN:
   - Singkat, padat, lugas, santun, dan langsung ON-POINT (maksimal 2-4 kalimat).
   - Jangan memberikan paragraf panjang yang bertele-tele.

5. FOKUS LAYANAN & SOFT PIVOT:
   - Anda HANYA melayani seputar situs game online Spaceman88.
   - Jika member bertanya hal di luar game online / di luar layanan Spaceman88, jawab singkat lalu lakukan PERALIHAN HALUS (soft pivot) kembali ke layanan game Spaceman88.
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

        // Kirim ke Admin Panel secara real-time
        io.emit('admin_receive_message', {
            socketId: socket.id,
            sender: username || 'Member',
            message: message,
            isAdmin: false
        });

        // Jika mode Human Takeover aktif, bot AI tidak merespons
        if (humanTakeover[socket.id]) return;

        chatHistories[socket.id].push({ 
            role: "user", 
            content: `User Name: ${username || 'Member'}. Message: ${message}` 
        });

        try {
            const completion = await groq.chat.completions.create({
                messages: chatHistories[socket.id],
                model: "llama-3.3-70b-versatile",
                temperature: 0.5,
                max_tokens: 250
            });

            const aiReply = completion.choices[0].message.content;
            chatHistories[socket.id].push({ role: "assistant", content: aiReply });

            // JEDA JAWAB 10 DETIK (10000 ms) agar seperti CS Asli
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Spaceman88 running on port ${PORT}`);
});
