io.on('connection', (socket) => {
  
  // Pelanggan bergabung ke ruang obrolan privat masing-masing
  socket.on('join_room', ({ roomId, username, category }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        isHumanTakeover: false, 
        history: [], 
        username: username || 'Member Baru', 
        category: category || 'Umum',
        createdAt: new Date().toISOString().split('T')[0],
        hasResponded: false,
        memberStatus: 'stay' // <-- Menambahkan status default member: 'stay'
      };
      
      // Hitung statistik chat masuk harian
      const today = new Date().toISOString().split('T')[0];
      analyticsData.totalChatsToday++;
      if (!analyticsData.dailyStats[today]) analyticsData.dailyStats[today] = { total: 0, missed: 0 };
      analyticsData.dailyStats[today].total++;
    } else {
      if (username) rooms[roomId].username = username;
      if (category) rooms[roomId].category = category;
      // Pastikan status tetap stay jika member menyambung ulang
      if (!rooms[roomId].memberStatus) rooms[roomId].memberStatus = 'stay';
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

  // Arsipkan Sesi Chat (Oleh Admin / Member) - Menggunakan event 'archive_room' atau 'close_room'
  socket.on('close_room', ({ roomId }) => {
    if (rooms[roomId]) {
      // Ubah status member menjadi closed sebelum diarsipkan
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

  // Kompatibilitas jika fungsi arsip terpanggil via string langsung
  socket.on('archive_room', (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].memberStatus = 'closed';
      archivedRooms[roomId] = {
        ...rooms[roomId],
        closedAt: new Date().toLocaleString()
      };
      delete rooms[roomId];
      io.emit('update_room_list', rooms);
      io.emit('update_archive_list', archivedRooms);
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

    } else (err) => {
      // Penanganan error tetap aman
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
