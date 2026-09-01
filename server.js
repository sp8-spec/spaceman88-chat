require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Groq = require('groq-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Inisialisasi Groq API Key dari file .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.static('public'));

const rooms = {};

// SYSTEM PROMPT CS Virtual Spaceman88 (Formal & Premium)
const SYSTEM_PROMPT = `
Anda adalah Customer Service Virtual resmi dari Spaceman88, sebuah platform hiburan daring eksklusif dan terkemuka.

Informasi & Kebijakan Layanan:
1. Jam Operasional: Layanan pendaftaran, transaksi deposit, dan penarikan dana (withdraw) beroperasi 24 jam nonstop setiap hari.
2. Ketentuan Transaksi:
   - Minimal Deposit: Rp 10.000 (Mendukung Bank Transfer BCA, Mandiri, BRI, BNI, E-Wallet DANA/OVO/Gopay/LinkAja, serta QRIS tanpa potongan).
   - Minimal Penarikan Dana (Withdraw): Rp 50.000.
   - Kendala Transaksi: Minta pelanggan memberikan Username ID dan bukti transfer resmi agar dapat diproses dengan prioritas tinggi oleh tim keuangan.
3. Promo & Efisiensi Layanan:
   - Bonus Anggota Baru 100%, serta pembagian Cashback & Komisi Mingguan secara otomatis setiap hari Senin.
4. Informasi Permainan:
   - Berikan informasi mengenai tingkat persentase kemenangan (RTP Live) secara objektif dan rekomendasikan provider terpercaya seperti Pragmatic Play dan PG Soft.
5. Keamanan & Perubahan Data Privasi:
   - Perubahan nomor rekening, verifikasi akun sensitif, atau klaim bonus manual wajib diteruskan kepada Customer Service Senior (Manusia).

Tata Bahasa & Standar Pelayanan:
- Wajib menggunakan bahasa Indonesia baku, formal, ramah, dan sangat menghormati pelanggan.
- Selalu gunakan sapaan "Bapak" (contoh: "Selamat datang Bapak [Username]", "Ada yang dapat kami bantu Bapak?").
- Hindari penggunaan kata-kata informal atau gaul seperti "Bosku", "Bro", "Kak", "Gacor", atau "Rungkad".
- Jawablah pertanyaan secara padat, lugas, dan profesional (maksimal 2-3 kalimat).
- DILARANG keras mengulang-ulang kata "Selamat datang" di setiap balasan! Salam registrasi/selamat datang hanya untuk balasan pertama kali saja.

PENANGANAN MEMBER MARAH / EMOSI / SPAM (DE-ESCALATION):
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
  // Pelanggan bergabung ke ruang obrolan
  socket.on('join_room', ({ roomId, username, category }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        isHumanTakeover: false, 
        history: [], 
        username: username || 'Pengguna', 
        category: category || 'Umum' 
      };
    } else {
      if (username) rooms[roomId].username = username;
      if (category) rooms[roomId].category = category;
    }
    socket.emit('room_status', rooms[roomId]);
  });

  // Menerima pesan dari Pelanggan
  socket.on('user_message', async ({ roomId, text }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    const userMsg = { sender: room.username, text, timestamp: new Date() };
    room.history.push(userMsg);
    io.to(roomId).emit('new_message', userMsg);

    // Jika CS Manusia mengambil alih, AI tidak membalas
    if (room.isHumanTakeover) return;

    try {
      const conversationContext = [
        { 
          role: 'system', 
          content: `${SYSTEM_PROMPT}\nData Pelanggan Saat Ini -> Username ID: ${room.username}, Kategori Perihal: ${room.category}` 
        },
        ...room.history.slice(-6).map(m => ({
          role: m.sender === room.username ? 'user' : 'assistant',
          content: m.text
        }))
      ];

      // Memanggil API Groq
      const completion = await groq.chat.completions.create({
        messages: conversationContext,
        model: 'openai/gpt-oss-20b',
        temperature: 0.5,
        max_tokens: 200,
      });

      const aiReplyText = completion.choices[0]?.message?.content || 'Mohon maaf Bapak, terjadi kendala teknis pada sistem kami. Silakan tunggu sejenak, petugas CS kami akan segera melayani Bapak.';
      const aiMsg = { sender: 'CS Spaceman88', text: aiReplyText, timestamp: new Date() };

      room.history.push(aiMsg);
      io.to(roomId).emit('new_message', aiMsg);

    } catch (err) {
      console.error('Error Groq API:', err.message);
      const errorMsg = { sender: 'CS Spaceman88', text: 'Mohon maaf Bapak, sistem respon otomatis sedang mengalami kendala. Petugas CS kami akan segera menyapa Bapak.', timestamp: new Date() };
      io.to(roomId).emit('new_message', errorMsg);
    }
  });

  // Menerima pesan dari Admin (CS Manusia)
  socket.on('admin_message', ({ roomId, text }) => {
    if (!rooms[roomId]) return;
    const adminMsg = { sender: 'CS Spaceman88 (Senior)', text, timestamp: new Date() };
    rooms[roomId].history.push(adminMsg);
    io.to(roomId).emit('new_message', adminMsg);
  });

  // Mengubah status Ambil Alih
  socket.on('toggle_takeover', ({ roomId, isHumanTakeover }) => {
    if (rooms[roomId]) {
      rooms[roomId].isHumanTakeover = isHumanTakeover;
      io.to(roomId).emit('takeover_updated', isHumanTakeover);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Spaceman88 LiveChat running at http://localhost:${PORT}`);
});
