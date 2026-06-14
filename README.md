# MAGERIN - Custom Browser Automation Extension

Magerin adalah sebuah ekstensi Google Chrome (Manifest V3) berbasis **Robotic Process Automation (RPA)** yang dirancang untuk merekam, mengelola, dan mengeksekusi otomatisasi tugas lintas halaman secara cerdas. Ekstensi ini dilengkapi dengan antarmuka modern, fitur *Smart Wait*, serta integrasi pemetaan data dinamis berbasis file CSV.

---

## 🌌 UI/UX Theme Design: Glassmorphic Dark

Ekstensi ini mengusung estetika desain **Glassmorphic Dark UI** yang modern, bersih, dan futuristik dengan karakteristik visual sebagai berikut:
* **Base Palette:** Menggunakan warna **Biru Dongker (Deep Navy Blue)** sebagai latar belakang utama untuk memberikan kesan premium dan ramah di mata (*low eye-strain*).
* **Accent Color:** Perpaduan gradasi warna **Ungu (Neon Purple)** pada tombol aksi aktif, indikator perekaman, dan elemen *hover*.
* **Glassmorphism Effect:** Lapisan UI menggunakan efek *backdrop-filter: blur()* transparan menyerupai kaca buram dengan garis tepi (*border*) tipis yang elegan.
* **Layout Opsi:** * *Side Panel Mode:* Ukuran vertikal ramping proporsional seukuran layar *mobile*.
    * *Floating Mode:* Memiliki opsi jendela mengapung seukuran handphone yang bisa digeser (*draggable*) di atas halaman web.

---

## 🚀 Fitur Utama (Core Features)

### 1. Scenario Management (Record, Edit, Delete, & Save)
* **Real-time Recording:** Rekam setiap interaksi browser (klik, pengisian form, navigasi halaman) secara otomatis tanpa perlu menulis kode.
* **Granular Action Editing:** Kamu bisa mengedit parameter dari setiap aksi yang telah direkam secara spesifik (misalnya mengubah target CSS Selector atau mengubah teks input).
* **Action Deletion:** Hapus langkah-langkah atau aksi yang tidak sengaja terekam tanpa harus mengulang rekaman dari awal.
* **Scenario Storage:** Simpan skenario yang telah selesai dibuat ke dalam penyimpanan lokal ekstensi agar bisa digunakan kembali kapan saja.

### 2. Dynamic CSV Upload
* Mendukung pengunggahan file `.csv` langsung ke dalam panel ekstensi. Data dari CSV ini nantinya akan digunakan sebagai sumber variabel (*data-driven*) untuk mengisi formulir atau melakukan aksi berulang secara massal.

### 3. Smart Form-to-CSV Mapping
* Setiap elemen form yang diklik atau disimpan di dalam daftar aksi dapat dimodifikasi secara dinamis.
* Tersedia fitur **Dropdown Kolom CSV** di setiap aksi form, memungkinkan kamu menghubungkan (*mapping*) secara langsung: *“Elemen Form X akan otomatis diisi oleh data dari Kolom A di CSV, Elemen Form Y oleh Kolom B, dst.”*

### 4. Smart Wait Engine (Anti-Skip)
* Ekstensi tidak menggunakan jeda waktu statis (*hardcoded timeout*) yang berisiko membuat otomatisasi gagal saat internet lambat.
* Menggunakan sistem **Smart Wait** berbasis *polling* / *MutationObserver*. Ekstensi akan menahan proses eksekusi (menunggu) sampai elemen target benar-benar muncul dan siap berinteraksi (Contoh: Menunggu tombol *Skip Iklan* di YouTube muncul terlebih dahulu sebelum mengkliknya, bukan langsung melewati aksi tersebut).

### 5. Advanced Loop & Range Control
* Kontrol penuh terhadap perulangan otomatisasi berdasarkan baris data CSV.
* Kamu bisa menentukan batas jangkauan (*range*) baris yang akan dieksekusi untuk setiap sesi perulangan (misalnya: atur ekstensi hanya berjalan dari baris ke-1 sampai baris ke-5 saja). Jumlah perulangan otomatis akan menyesuaikan dengan jumlah baris yang ditentukan.

### 6. Smart Scroll (Horizontal & Vertical)
* Menyediakan aksi otomatisasi khusus untuk melakukan *scrolling* halaman, baik ke arah bawah maupun ke samping.
* Fitur ini sangat berguna untuk melewati validasi halaman web tertentu—seperti halaman ketentuan layanan (*Terms & Conditions*)—di mana tombol "Accept/Setuju" baru akan aktif atau muncul setelah user melakukan *scroll* sampai ke bagian paling bawah halaman.

---

## 🛠️ Struktur Teknologi

* **Manifest Version:** 3
* **Front-end UI:** HTML5, CSS3 (Glassmorphism & Flexbox/Grid), JavaScript (ES6+)
* **Core Engine:** * `background.js` (Service Worker untuk manajemen state dan antrean CSV)
    * `content.js` (DOM Injection, Event Listeners Recorder, & Execution Engine)

---

## 📦 Cara Pemasangan (Langkah Pengembangan)

1. Clone atau download repositori ini dalam bentuk ZIP, lalu ekstrak ke komputermu.
2. Buka browser Google Chrome dan akses halaman `chrome://extensions/`.
3. Aktifkan **Developer Mode** di pojok kanan atas.
4. Klik tombol **Load Unpacked** di pojok kiri atas.
5. Pilih folder tempat kamu mengekstrak proyek ekstensi ini.
6. Buka ikon ekstensi atau aktifkan *Side Panel* untuk mulai menggunakan GhostHands.