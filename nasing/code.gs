var SPREADSHEET_ID = ""; // Biarkan kosong jika script ada di dalam file Spreadsheet

/* ==========================================================================
   BAGIAN 1: API SERVER & LOGIKA OTOMATIS (Backend)
   ========================================================================== */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify(getAllData()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var result = {};
    
    if (params.action === "add") {
      result = addData(params);
    } else if (params.action === "edit") {
      result = editData(params);
    } else if (params.action === "delete") {
      result = deleteData(params.id);
    }
    
    return ContentService.createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  // Menggunakan nama sheet 'DataSilsilah' sesuai request lama Anda, atau buat baru jika belum ada
  var sheet = ss.getSheetByName('DataSilsilah');
  if (!sheet) {
    sheet = ss.insertSheet('DataSilsilah');
    // Header default jika sheet baru dibuat
    sheet.appendRow(['id', 'parentId', 'name', 'spouse', 'generation', 'motherName']);
  }
  return sheet;
}

function getAllData() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  // Jika data kosong/hanya header
  if (data.length <= 1) return [];

  var headers = data[0];
  var jsonData = [];
  
  // Mulai dari baris ke-2 (index 1)
  for (var i = 1; i < data.length; i++) {
    // Mapping manual agar sesuai urutan kolom: id, parentId, name, spouse, generation, motherName
    var row = {
      id: data[i][0].toString(),
      parentId: data[i][1].toString(),
      name: data[i][2].toString(),
      spouse: data[i][3].toString(),
      generation: data[i][4], // Kolom ke-5
      motherName: data[i][5] ? data[i][5].toString() : "" // Kolom ke-6
    };
    jsonData.push(row);
  }
  return jsonData;
}

function addData(data) {
  var sheet = getSheet();
  // Generate ID unik
  var id = 'id_' + new Date().getTime().toString(36);
  
  // Default generation 99 (placeholder), karena hitungan visual ada di frontend
  var gen = 99; 
  
  // Urutan: id, parentId, name, spouse, generation, motherName
  sheet.appendRow([
    id, 
    data.parentId, 
    data.name, 
    data.spouse, 
    gen, 
    data.motherName
  ]);
  
  // FITUR OTOMATIS: Sinkronisasi Pasangan
  if (data.spouse) {
    updateSpouseReciprocal(sheet, data.name, data.spouse);
  }
  
  return {status: "success"};
}

function editData(data) {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0].toString() === data.id.toString()) {
      // Update cell tertentu (Index kolom dimulai dari 1 di getRange)
      // Kolom: 1=id, 2=parentId, 3=name, 4=spouse, 5=generation, 6=motherName
      
      sheet.getRange(i + 1, 3).setValue(data.name);       // Name
      sheet.getRange(i + 1, 4).setValue(data.spouse);     // Spouse
      sheet.getRange(i + 1, 6).setValue(data.motherName); // MotherName
      
      // FITUR OTOMATIS: Sinkronisasi Pasangan
      if (data.spouse) {
        updateSpouseReciprocal(sheet, data.name, data.spouse);
      }
      
      return {status: "updated"};
    }
  }
  return {status: "not_found"};
}

function deleteData(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  // Loop mundur untuk delete aman
  for (var i = data.length - 1; i >= 1; i--) {
    // Hapus jika ID cocok atau ParentID cocok (hapus anak-anaknya juga)
    if (data[i][0].toString() === id.toString() || data[i][1].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
    }
  }
  return {status: "deleted"};
}

// --- LOGIKA PINTAR: UPDATE TIMBAL BALIK PASANGAN ---
function updateSpouseReciprocal(sheet, personName, spouseString) {
  if (!spouseString) return;

  var spouses = spouseString.split(',').map(function(s) { return s.trim(); });
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    var currentName = data[i][2]; // Kolom Name (Index 2)
    
    // Jika nama orang ini ada di daftar spouse yang baru diinput/edit
    if (spouses.includes(currentName)) {
      var currentSpouseCell = data[i][3] ? data[i][3].toString() : "";
      var currentList = currentSpouseCell.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ""; });
      
      // Jika nama personName belum ada di data pasangannya, tambahkan
      if (!currentList.includes(personName)) {
        currentList.push(personName);
        // Update Kolom Spouse (Index 4 di getRange)
        sheet.getRange(i + 1, 4).setValue(currentList.join(', '));
      }
    }
  }
}


/* ==========================================================================
   BAGIAN 2: DATA AWAL KELUARGA (Jalankan Fungsi ini Sekali Saja)
   ========================================================================== */

function installDataAwal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DataSilsilah');
  
  // 1. Reset Sheet (Hapus sheet lama dan buat baru bersih)
  if (sheet) {
    ss.deleteSheet(sheet);
  }
  sheet = ss.insertSheet('DataSilsilah');
  
  // 2. Buat Header
  // Struktur 6 Kolom sesuai data Anda
  sheet.appendRow(['id', 'parentId', 'name', 'spouse', 'generation', 'motherName']);
  
  // 3. DATABASE KELUARGA (DATA YANG ANDA BERIKAN)
  var familyData = [
    // ROOT
    ['root', '', 'Puang Guru Nasing', 'Istri A, Istri B, Istri C, Istri D', 0, ''],
    
    // ================= GEN 1 (ANAK-ANAK) =================
    ['1', 'root', 'Puang Tadung', 'Puang Caccing', 1, 'Istri A'],
    ['2', 'root', 'Puang Hammadu', 'Puang Timang', 1, 'Istri A'],
    ['3', 'root', 'Puang Badu', 'Puang Memang', 1, 'Istri B'],
    ['4', 'root', 'Puang Dida', '', 1, 'Istri B'],
    ['5', 'root', 'Puang Bacce', '', 1, 'Istri C'],
    ['6', 'root', 'Puang Barang', 'Puang Compa, Puang Nginga, Puang Ratang', 1, 'Istri D'],
    ['7', 'root', 'Puang Kami', '', 1, 'Istri D'],
    ['8', 'root', 'Puang Hasani', '', 1, 'Istri D'],

    // ================= GEN 2 & 3: CABANG PUANG TADUNG (1) =================
    // Ibu: Puang Caccing
    ['1-1', '1', 'Puang Kebo\'', '', 2, 'Puang Caccing'],
      ['1-1-1', '1-1', 'P. Ngai', '', 3, 'Puang Kebo\''], 
      ['1-1-2', '1-1', 'P. Pisa', '', 3, 'Puang Kebo\''],
      ['1-1-3', '1-1', 'P. Halima', '', 3, 'Puang Kebo\''],
      ['1-1-4', '1-1', 'P. Ahmad', '', 3, 'Puang Kebo\''],
      ['1-1-5', '1-1', 'P. Marsuki', '', 3, 'Puang Kebo\''],

    ['1-2', '1', 'Sallimang P. Ballung', '', 2, 'Puang Caccing'],
      ['1-2-1', '1-2', 'Anisi P. So\'na', '', 3, 'Sallimang P. Ballung'],
      ['1-2-2', '1-2', 'Pak Yakub Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-3', '1-2', 'Abd. Razak Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-4', '1-2', 'Syamsiah', '', 3, 'Sallimang P. Ballung'],
      ['1-2-5', '1-2', 'Muliati Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-6', '1-2', 'Nurhayati Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-7', '1-2', 'St. Harmin Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-8', '1-2', 'Muh. Tayyeb Ahmad', '', 3, 'Sallimang P. Ballung'],
      ['1-2-9', '1-2', 'Yusuf Ahmad', '', 3, 'Sallimang P. Ballung'],

    ['1-3', '1', 'Muh. Yusuf P. Lawa', '', 2, 'Puang Caccing'],
      ['1-3-1', '1-3', 'Rustam', '', 3, 'Muh. Yusuf P. Lawa'],
      ['1-3-2', '1-3', 'Rusli', '', 3, 'Muh. Yusuf P. Lawa'],
      ['1-3-3', '1-3', 'Djamaluddin', '', 3, 'Muh. Yusuf P. Lawa'],
      ['1-3-4', '1-3', 'Muh. Amin', '', 3, 'Muh. Yusuf P. Lawa'],
      ['1-3-5', '1-3', 'Syamsuddin', '', 3, 'Muh. Yusuf P. Lawa'],

    ['1-4', '1', 'Muh. Kadir P. Siala', '', 2, 'Puang Caccing'],
      ['1-4-1', '1-4', 'Nuraeni P. Suji', '', 3, 'Muh. Kadir P. Siala'],
      ['1-4-2', '1-4', 'Nurbakti P. Se\'re', '', 3, 'Muh. Kadir P. Siala'],
      ['1-4-3', '1-4', 'Nurhayati P. Ngai', '', 3, 'Muh. Kadir P. Siala'],
      ['1-4-4', '1-4', 'Nur Ansar P. Lawa', '', 3, 'Muh. Kadir P. Siala'],
      ['1-4-5', '1-4', 'Sukardi P. Sijarra', '', 3, 'Muh. Kadir P. Siala'],

    ['1-5', '1', 'Aisyah P. Siang', '', 2, 'Puang Caccing'],
      ['1-5-1', '1-5', 'A. Asiah Pt. Lino', '', 3, 'Aisyah P. Siang'],
      ['1-5-2', '1-5', 'A. Rahman Pt. Sarro', '', 3, 'Aisyah P. Siang'],
      ['1-5-3', '1-5', 'A. Kartini Pt. Tajammeng', '', 3, 'Aisyah P. Siang'],
      ['1-5-4', '1-5', 'A. Muhtar Pt. Sempa', '', 3, 'Aisyah P. Siang'],
      ['1-5-5', '1-5', 'A. Murni Pt. Kanang', '', 3, 'Aisyah P. Siang'],
      ['1-5-6', '1-5', 'A. Darmawati Pt. Intang', '', 3, 'Aisyah P. Siang'],
      ['1-5-7', '1-5', 'A. Nasruddin Pt. Ego', '', 3, 'Aisyah P. Siang'],

    ['1-6', '1', 'Usman P. Nyonri', '', 2, 'Puang Caccing'],
      ['1-6-1', '1-6', 'A. Hermansyah Pt. Situru', '', 3, 'Usman P. Nyonri'],
      ['1-6-2', '1-6', 'Sudirman P. Talle', '', 3, 'Usman P. Nyonri'],
      ['1-6-3', '1-6', 'Hasmawati P. Lu\'mu', '', 3, 'Usman P. Nyonri'],
      ['1-6-4', '1-6', 'Muliati P. Sangnging', '', 3, 'Usman P. Nyonri'],
      ['1-6-5', '1-6', 'Sudarmin P. Rewa', '', 3, 'Usman P. Nyonri'],
      ['1-6-6', '1-6', 'Sulaeman (Alm)', '', 3, 'Usman P. Nyonri'],
      ['1-6-7', '1-6', 'Arif P. Sijaya', '', 3, 'Usman P. Nyonri'],
      ['1-6-8', '1-6', 'Syahrir P. Beta', '', 3, 'Usman P. Nyonri'],
      ['1-6-9', '1-6', 'Mustakim P. Tippa', '', 3, 'Usman P. Nyonri'],
      ['1-6-10', '1-6', 'Hariati P. Jinne', '', 3, 'Usman P. Nyonri'],
      ['1-6-11', '1-6', 'Muriati P. Te\'ne', '', 3, 'Usman P. Nyonri'],
      ['1-6-12', '1-6', 'Sitti Rahmawati P. Rampu', '', 3, 'Usman P. Nyonri'],
      ['1-6-13', '1-6', 'Sarmila (Alm)', '', 3, 'Usman P. Nyonri'],
      ['1-6-14', '1-6', 'Nia (Alm)', '', 3, 'Usman P. Nyonri'],

    ['1-7', '1', 'Aminah', '(Tidak Menikah)', 2, 'Puang Caccing'],
    ['1-8', '1', 'Saleh', '(Meninggal Muda)', 2, 'Puang Caccing'],


    // ================= GEN 2: CABANG PUANG HAMMADU (2) =================
    // Ibu: Puang Timang
    ['2-1', '2', 'P. Halimah', '', 2, 'Puang Timang'],
    ['2-2', '2', 'P. Suado', '', 2, 'Puang Timang'],
    ['2-3', '2', 'P. Hawwa', '', 2, 'Puang Timang'],
    ['2-4', '2', 'P. Mu\'min', '', 2, 'Puang Timang'],


    // ================= GEN 2 & 3: CABANG PUANG BADU (3) =================
    // Ibu: Puang Memang
    ['3-1', '3', 'Arie Karim P. Rapi', '', 2, 'Puang Memang'],
      ['3-1-1', '3-1', 'M. Syahrir AK Dg. Nasing', '', 3, 'Arie Karim P. Rapi'],
      ['3-1-2', '3-1', 'M. Fahry AK Dg. Pacilo', '', 3, 'Arie Karim P. Rapi'],
      ['3-1-3', '3-1', 'Farida AK Dg. Rimang', '', 3, 'Arie Karim P. Rapi'],
      ['3-1-4', '3-1', 'Chandra AK Dg. Beta', '', 3, 'Arie Karim P. Rapi'],
      ['3-1-5', '3-1', 'Dewiyanie AK Dg. Memang', '', 3, 'Arie Karim P. Rapi'],

    ['3-2', '3', 'Hasna P. Kanang', '', 2, 'Puang Memang'],
      ['3-2-1', '3-2', 'Amran Dg. Sese', '', 3, 'Hasna P. Kanang'],
      ['3-2-2', '3-2', 'Haris Dg. Ngitung', '', 3, 'Hasna P. Kanang'],
      ['3-2-3', '3-2', 'Hermi Dg. Pa\'ja', '', 3, 'Hasna P. Kanang'],
      ['3-2-4', '3-2', 'Suriani Dg. Nginga', '', 3, 'Hasna P. Kanang'],

    ['3-3', '3', 'Hafsah P. Rannu', '', 2, 'Puang Memang'],
      ['3-3-1', '3-3', 'Andriani Dg. Kati', '', 3, 'Hafsah P. Rannu'],
      ['3-3-2', '3-3', 'Andrianti Dg. Sompa', '', 3, 'Hafsah P. Rannu'],
      ['3-3-3', '3-3', 'Sakir Dg. Nagga', '', 3, 'Hafsah P. Rannu'],
      ['3-3-4', '3-3', 'Satria Dg. Tarring', '', 3, 'Hafsah P. Rannu'],
      ['3-3-5', '3-3', 'Salma Dg. Lu\'mu', '', 3, 'Hafsah P. Rannu'],
      ['3-3-6', '3-3', 'Syahrul Dg. Bombong', '', 3, 'Hafsah P. Rannu'],
      ['3-3-7', '3-3', 'Syamsinar Dg. Janna', '', 3, 'Hafsah P. Rannu'],
      ['3-3-8', '3-3', 'Syarif Dg. Mone', '', 3, 'Hafsah P. Rannu'],


    // ================= GEN 2 & 3: CABANG PUANG DIDA (4) =================
    ['4-1', '4', 'P. Hasan', '', 2, ''],
      ['4-1-1', '4-1', 'H. Zainuddin', '', 3, 'P. Hasan'],
      ['4-1-2', '4-1', 'Sitti Salma', '', 3, 'P. Hasan'],
      ['4-1-3', '4-1', 'Nur Zam Zam', '', 3, 'P. Hasan'],

    ['4-2', '4', 'P. Yunus', '', 2, ''],
      ['4-2-1', '4-2', 'Muhammad Ilyas', '', 3, 'P. Yunus'],
      ['4-2-2', '4-2', 'Marjani', '', 3, 'P. Yunus'],
      ['4-2-3', '4-2', 'Syahrir', '', 3, 'P. Yunus'],
      ['4-2-4', '4-2', 'Lukman', '', 3, 'P. Yunus'],
      ['4-2-5', '4-2', 'Fitri', '', 3, 'P. Yunus'],
      ['4-2-6', '4-2', 'Ayu', '', 3, 'P. Yunus'],

    ['4-3', '4', 'P. Hapia', '', 2, ''],
      ['4-3-1', '4-3', 'Abdul Hakim', '', 3, 'P. Hapia'],
      ['4-3-2', '4-3', 'Asikin', '', 3, 'P. Hapia'],
      ['4-3-3', '4-3', 'Arifin', '', 3, 'P. Hapia'],
      ['4-3-4', '4-3', 'Arsidin', '', 3, 'P. Hapia'],
      ['4-3-5', '4-3', 'Agung', '', 3, 'P. Hapia'],

    ['4-4', '4', 'P. M. Kasim Sabir', '', 2, ''],
      ['4-4-1', '4-4', 'Nurlia', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-2', '4-4', 'Norma (Alm)', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-3', '4-4', 'Muhammad Sukarli', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-4', '4-4', 'Suherman', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-5', '4-4', 'Sudirman', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-6', '4-4', 'Syamsu Alam', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-7', '4-4', 'Hamdan Dg. Nuntung', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-8', '4-4', 'Vera', '', 3, 'P. M. Kasim Sabir'],
      ['4-4-9', '4-4', 'Hamka', '', 3, 'P. M. Kasim Sabir'],

    ['4-5', '4', 'P. Thalib', '', 2, ''],
      ['4-5-1', '4-5', 'Nasruddin', '', 3, 'P. Thalib'],
      ['4-5-2', '4-5', 'Rahmatiah', '', 3, 'P. Thalib'],
      ['4-5-3', '4-5', 'Muhammad Ali', '', 3, 'P. Thalib'],
      ['4-5-4', '4-5', 'Marwiyah', '', 3, 'P. Thalib'],


    // ================= GEN 2 & 3: CABANG PUANG BACCE (5) =================
    ['5-1', '5', 'Saido P. Kanang', '', 2, ''],
      ['5-1-1', '5-1', 'Paping P. Siala', '', 3, 'Saido P. Kanang'],

    ['5-2', '5', 'Mido P. Ngasseng', '', 2, ''],
      ['5-2-1', '5-2', 'Maryam P. Notta', '', 3, 'Mido P. Ngasseng'],
      ['5-2-2', '5-2', 'Hasmawati P. Hasma', '', 3, 'Mido P. Ngasseng'],
      ['5-2-3', '5-2', 'Ruslan P. Matarang', '', 3, 'Mido P. Ngasseng'],
      ['5-2-4', '5-2', 'Hudaya P. Moncong', '', 3, 'Mido P. Ngasseng'],
      ['5-2-5', '5-2', 'Ramli P. Siangka', '', 3, 'Mido P. Ngasseng'],
      ['5-2-6', '5-2', 'Abd. Hamid P. Nai\'', '', 3, 'Mido P. Ngasseng'],

    ['5-3', '5', 'Baco\' P. Buang', '', 2, ''],
      ['5-3-1', '5-3', 'H. Nadir P. Mile', '', 3, 'Baco\' P. Buang'],

    ['5-4', '5', 'Anisi P. So\'na', 'Patta Tiro', 2, ''],
      ['5-4-1', '5-4', 'A. Saribulan Pt. Ona', '', 3, 'Anisi P. So\'na'],
      ['5-4-2', '5-4', 'A. Murni Pt. Paccing', '', 3, 'Anisi P. So\'na'],
      ['5-4-3', '5-4', 'A. Firman Pt. Gessa', '', 3, 'Anisi P. So\'na'],
      ['5-4-4', '5-4', 'A. Lukman Pt. Serang', '', 3, 'Anisi P. So\'na'],

    ['5-5', '5', 'Hafsah P. Sunggu', 'P. Nyorong', 2, ''],


    // ================= GEN 2 & 3: CABANG PUANG BARANG (6) =================
    // Ibu: Puang Compa (Istri A)
    ['6-1', '6', 'Ahmad Suratmi P. Tayang', 'Aisyah Dg. Ngisa, Halipah Dg. Sanga', 2, 'Puang Compa'],
      // Anak Ahmad Suratmi dr Istri A (Aisyah)
      ['6-1-1', '6-1', 'Hamzah Dg. Ngewa', '', 3, 'Aisyah Dg. Ngisa'],
      ['6-1-2', '6-1', 'Samsiah Dg. Singara', '', 3, 'Aisyah Dg. Ngisa'],
      ['6-1-3', '6-1', 'Rahmawati Dg. Rannu', '', 3, 'Aisyah Dg. Ngisa'],
      ['6-1-4', '6-1', 'Hamid Dg. Naba (Alm)', '', 3, 'Aisyah Dg. Ngisa'],
      ['6-1-5', '6-1', 'Salmiah Dg. So\'na', '', 3, 'Aisyah Dg. Ngisa'],
      // Anak Ahmad Suratmi dr Istri B (Halipah)
      ['6-1-6', '6-1', 'Asriadi Dg. Manye', '', 3, 'Halipah Dg. Sanga'],
      ['6-1-7', '6-1', 'Wahidah Dg. Ngintang', '', 3, 'Halipah Dg. Sanga'],
      ['6-1-8', '6-1', 'Hasrawati Dg. Puji', '', 3, 'Halipah Dg. Sanga'],

    // Ibu: Puang Nginga (Istri B)
    ['6-2', '6', 'P. Sunggu', '', 2, 'Puang Nginga'],
      ['6-2-1', '6-2', 'Hadena', '', 3, 'P. Sunggu'],
      ['6-2-2', '6-2', 'Hadawiyah', '', 3, 'P. Sunggu'],
      ['6-2-3', '6-2', 'Hudaya', '', 3, 'P. Sunggu'],
      ['6-2-4', '6-2', 'Yahyaddin', '', 3, 'P. Sunggu'],
      ['6-2-5', '6-2', 'Hasbullah', '', 3, 'P. Sunggu'],
      
    ['6-3', '6', 'P. Tarring', '', 2, 'Puang Nginga'],
    ['6-4', '6', 'P. Halia', '', 2, 'Puang Nginga'],
    ['6-5', '6', 'P. Beda', '(Meninggal Muda)', 2, 'Puang Nginga'],
    ['6-6', '6', 'P. Sitti', '', 2, 'Puang Nginga'],

    // Ibu: Puang Ratang (Istri C)
    ['6-7', '6', 'P. Suaebo', '', 2, 'Puang Ratang'],
    
    ['6-8', '6', 'Mustafa P. Tika', '', 2, 'Puang Ratang'],
      ['6-8-1', '6-8', 'Yulianti Dg. Bulan', '', 3, 'Mustafa P. Tika'],
      ['6-8-2', '6-8', 'Nurlaela Dg. Caya', '', 3, 'Mustafa P. Tika'],

    ['6-9', '6', 'Muslimin P. Mile', '', 2, 'Puang Ratang']
  ];
  
  // 4. Tulis Data ke Sheet sekaligus (Bulk Operation agar cepat)
  // getRange(row, col, numRows, numCols)
  sheet.getRange(2, 1, familyData.length, 6).setValues(familyData);
}