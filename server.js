require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
const server = http.createServer(app);

// PERBAIKAN: Menambahkan maxHttpBufferSize (10MB) agar Socket.io mengizinkan pengiriman file gambar base64
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024
});

// Inisialisasi Groq API Key dari file .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.static('public'));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const rooms = {};
const archivedRooms = {}; // Penyimpanan untuk arsip chat

// Objek untuk laporan analytics harian (Total masuk, Missed chat, Kategori)
let analyticsData = {
  totalChatsToday: 0,
  missedChatsToday: 0,
  missedCategories: { 'Deposit/WD': 0, 'Kendala Akun': 0, 'Game/RTP': 0, 'Lainnya': 0 },
  dailyStats: {} // Format: { "YYYY-MM-DD": { total: 0, missed: 0 } }
};

// SYSTEM PROMPT CS Virtual Spaceman88 (Formal & Premium)
const SYSTEM_PROMPT = `
Anda adalah Customer Service Virtual resmi dari Spaceman88, sebuah platform hiburan daring eksklusif dan terkemuka.

Informasi & Kebijakan Layanan:
1. Jam Operasional: Layanan pendaftaran, transaksi deposit, dan penarikan dana (withdraw) beroperasi 24 jam nonstop setiap hari.
2. Ketentuan Transaksi:
   - Minimal Deposit: Rp 5.000 (Mendukung Bank Transfer BCA, Mandiri, BRI, BNI, E-Wallet DANA/OVO/Gopay/LinkAja, serta QRIS ).
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
- Selalu gunakan sapaan "Bapak" (contoh: "Selamat datang Bapak [Username]", "Ada yang dapat kami bantu Bapak?","Halo bapak").
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
   - Jika ada member konfirmasi ingin reset sandi, bantu arahkan untuk mengisi form data seperti nama penerima rekening, jenis rekening, dan nomor rekening, jika member sudah memberikan jangan kamu reset bantu alihkan ke CS human
   - Jika member bertanya hal di luar game online / di luar layanan Spaceman88, jawab singkat lalu lakukan PERALIHAN HALUS (soft pivot) kembali ke layanan game Spaceman88.
   - Jangan memberikan link web apapun kepada member kecuali link berikut RTP : https://heylink.site/RtpGacor-Spaceman88,  Link Alternatif : https://heylink.site/RtpGacor-Spaceman88, Link Data analyst/jam gacor :https://tinyurl.com/aiprediksigacorsp88, AI PREDIKSI SCORE : https://builddelightfulthings.com/, Link Speedtest / Cek kecepatan jaringan : https://speedtest-spaceman88.great-site.net/,
   - Jika ada member ingin claim bonus bantu konfirmasi terlebih dahulu untuk bonus apa yang ingin member claim dan jangan menjanjikan berikan bonus kepada member berikut bonus yang tersedia di Spaceman88 : Berikut untuk bonus lengkap SPACEMAN88:
🟢 Bonus New member 100% Sportbook
🟢 SPECIAL EVENT MISTERY BOX
🟢 Bonus New member 20% (ALL SLOT)
🟢 Bonus Redepo Sultan 10%
🟢 Bonus Redepo Sultan 15%
🟢 Bonus Redepo Sultan 20%
🟢 Bonus Redepo Sultan 25%
🟢 Bonus Cashback harian
🟢 Bonus Rollingan mingguan
🟢 Bonus Scatter Mahjong 1&2
🟢 Bonus APK
🟢 BONUS GARANSI KEKALAHAN PG SOFT MAHJONG WAYS 

Masing-masing bonus memiliki syarat & ketentuan yang berlaku.
   - Jangan terlalu fokus kepada kendala yang member pilih di awal sebelum masuk contoh : jika member masuk dengan click kendala Transaksi depo/wd dan pada sesi belum berakhir member bertanya hal lain seputar permainan slot online atau apapun yang berkaitan dengan Game slot online yang kita sediakan di jawab / di layanin hingga member bener bener puas
   - Jika member tidak ada konfirmasi kembali selama 2 s/d 3 menit bantu untuk berikan kata kata soft closing dan jika tidak ada balasan kembali setelah 1 menit bantu kasih kata kata closingan
   - expresikan diri kamu dengan interaktif dan cerdas dalam ngesolve problem member 
   - Jangan pernah sekalipun kasar dengan member ataupun mengusir member berikan layanan customer service terbaik serta eksklusif
   - Jangan mengulang - ngulang jawaban yang di berikan untuk member
`;

io.on('connection', (socket) => {
  
  // Pelanggan bergabung ke ruang obrolan privat masing-masing (Struktur asli tanpa mengubah parameter join_room)
  socket.on('join_room', async ({ roomId, username, category }) => {
    socket.join(roomId);
    
    let isNewRoom = false;
    if (!rooms[roomId]) {
      isNewRoom = true;
      rooms[roomId] = { 
        isHumanTakeover: false, 
        history: [], 
        username: username || 'Member Baru', 
        category: category || 'Umum',
        createdAt: new Date().toISOString().split('T')[0],
        hasResponded: false,
        memberStatus: 'stay' // Ditambahkan tanpa mengubah logika asli agar kompatibel dengan admin.html
      };
      
      // Hitung statistik chat masuk harian
      const today = new Date().toISOString().split('T')[0];
      analyticsData.totalChatsToday++;
      if (!analyticsData.dailyStats[today]) analyticsData.dailyStats[today] = { total: 0, missed: 0 };
      analyticsData.dailyStats[today].total++;
    } else {
      if (username) rooms[roomId].username = username;
      if (category) rooms[roomId].category = category;
      if (!rooms[roomId].memberStatus) rooms[roomId].memberStatus = 'stay';
    }
    
    // Jika room baru, bot langsung memberikan kata-kata sambutan/sapaan otomatis
    if (isNewRoom) {
      try {
        const welcomePrompt = [
          { 
            role: 'system', 
            content: `${SYSTEM_PROMPT}\nData Pelanggan Saat Ini -> Username ID: ${rooms[roomId].username}, Kategori Perihal: ${rooms[roomId].category}` 
          },
          { 
            role: 'user', 
            content: "Halo, saya baru saja masuk ke live chat." 
          }
        ];

        const completion = await groq.chat.completions.create({
          messages: welcomePrompt,
          model: 'openai/gpt-oss-20b',
          temperature: 0.5,
          max_completion_tokens: 1000,
        });

        const aiReplyText = completion.choices[0]?.message?.content || `Selamat datang Bapak ${rooms[roomId].username}, ada yang bisa kami bantu?`;
        const aiMsg = { sender: 'CS Spaceman88', text: aiReplyText, image: null, timestamp: new Date() };

        rooms[roomId].hasResponded = true;
        rooms[roomId].history.push(aiMsg);
        
        // TAMBAHKAN INI: Agar pesan sapaan langsung disiarkan ke chat room
        io.to(roomId).emit('new_message', aiMsg);
      } catch (err) {
        console.error('Error Welcome AI Groq:', err.message);
      }
    }

    // Kirim riwayat chat spesifik room ini agar tidak hilang saat refresh/reconnect
    socket.emit('load_history', rooms[roomId].history);
    socket.emit('room_status', rooms[roomId]);
    
    // Kirim pembaruan daftar room & analytics ke admin
    io.emit('update_room_list', rooms);
    io.emit('update_analytics', analyticsData);
  });

  // Kirim data analytics saat admin meminta
  socket.on('get_analytics', () => {
    socket.emit('update_analytics', analyticsData);
  });

  // Arsipkan Sesi Chat (Oleh Admin / Member) - Mendukung event 'close_room' dan 'archive_room'
  socket.on('close_room', ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].memberStatus = 'closed';

      // Deteksi Missed Chat jika room ditutup tanpa balasan sama sekali dari sistem/admin
      if (!rooms[roomId].hasResponded) {
        analyticsData.missedChatsToday++;
        const cat = rooms[roomId].category || 'Lainnya';
        if (analyticsData.missedCategories[cat] !== undefined) {
          analyticsData.missedCategories[cat]++;
        } else {
          analyticsData.missedCategories['Lainnya']++;
        }
        
        const today = new Date().toISOString().split('T')[0];
        if (analyticsData.dailyStats[today]) analyticsData.dailyStats[today].missed++;
      }

      archivedRooms[roomId] = {
        ...rooms[roomId],
        closedAt: new Date().toLocaleString()
      };
      delete rooms[roomId];

      io.emit('update_room_list', rooms);
      io.emit('update_archive_list', archivedRooms);
      io.emit('update_analytics', analyticsData);
    }
  });

  socket.on('archive_room', (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].memberStatus = 'closed';
      
      if (!rooms[roomId].hasResponded) {
        analyticsData.missedChatsToday++;
        const cat = rooms[roomId].category || 'Lainnya';
        if (analyticsData.missedCategories[cat] !== undefined) {
          analyticsData.missedCategories[cat]++;
        } else {
          analyticsData.missedCategories['Lainnya']++;
        }
        
        const today = new Date().toISOString().split('T')[0];
        if (analyticsData.dailyStats[today]) analyticsData.dailyStats[today].missed++;
      }

      archivedRooms[roomId] = {
        ...rooms[roomId],
        closedAt: new Date().toLocaleString()
      };
      delete rooms[roomId];

      io.emit('update_room_list', rooms);
      io.emit('update_archive_list', archivedRooms);
      io.emit('update_analytics', analyticsData);
    }
  });

  // Kirim daftar arsip saat admin meminta
  socket.on('get_archives', () => {
    socket.emit('update_archive_list', archivedRooms);
  });

  // Menerima pesan dari Pelanggan (Mendukung Teks dan Gambar)
  socket.on('user_message', async ({ roomId, text, image }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    const userMsg = { 
      sender: room.username, 
      text: text || '', 
      image: image || null, 
      timestamp: new Date() 
    };
    room.history.push(userMsg);
    
    io.to(roomId).emit('new_message', userMsg);
    io.emit('update_room_list', rooms);

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
          content: m.text + (m.image ? ' [Mengirim Gambar]' : '')
        }))
      ];

      // Memanggil API Groq dengan batas max token dinaikkan agar tidak terpotong
      const completion = await groq.chat.completions.create({
        messages: conversationContext,
        model: 'openai/gpt-oss-20b',
        temperature: 0.5,
        max_completion_tokens: 1000,
      });

      const aiReplyText = completion.choices[0]?.message?.content || 'Mohon maaf Bapak, terjadi kendala teknis pada sistem kami.';
      const aiMsg = { sender: 'CS Spaceman88', text: aiReplyText, image: null, timestamp: new Date() };

      room.hasResponded = true; // Menandakan room sudah direspon AI
      room.history.push(aiMsg);
      io.to(roomId).emit('new_message', aiMsg);
      io.emit('update_room_list', rooms);

    } catch (err) {
      console.error('Error Groq API:', err.message);
      const errorMsg = { sender: 'CS Spaceman88', text: 'Mohon maaf Bapak, sistem respon otomatis sedang mengalami kendala.', timestamp: new Date() };
      room.history.push(errorMsg);
      io.to(roomId).emit('new_message', errorMsg);
      io.emit('update_room_list', rooms);
    }
  });

  // Menerima pesan dari Admin (CS Manusia) - Mendukung Teks dan Gambar
  socket.on('admin_message', ({ roomId, text, image }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    const adminMsg = { 
      sender: 'CS Spaceman88 (Senior)', 
      text: text || '', 
      image: image || null, 
      timestamp: new Date() 
    };

    room.hasResponded = true; // Menandakan admin sudah merespon
    room.history.push(adminMsg);
    io.to(roomId).emit('new_message', adminMsg);
    io.emit('update_room_list', rooms);
  });

  // Mengubah status Ambil Alih (Human Takeover)
  socket.on('toggle_takeover', ({ roomId, isHumanTakeover }) => {
    if (rooms[roomId]) {
      rooms[roomId].isHumanTakeover = isHumanTakeover;
      io.to(roomId).emit('takeover_updated', isHumanTakeover);
      io.emit('update_room_list', rooms);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Spaceman88 LiveChat running at http://localhost:${PORT}`);
});
