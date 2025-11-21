
var SPREADSHEET_ID = ""; // Masukkan ID Spreadsheet jika script terpisah, atau biarkan kosong jika script terikat file Sheet
var SHEET_NAME = 'DataSilsilah';

/* ==========================================================================
   KONFIGURASI PENGGUNA (MULTI-USER)
   Format: { u: "username", p: "password", rootId: "ID_NODAL_AWAL" }
   rootId "all" = Melihat semua (Admin)
   rootId "1.1" = Hanya melihat keturunan dari ID 1.1, dst.
   ========================================================================== */
var ALLOWED_USERS = [
  { u: "aic",      p: "aic123",      rootId: "all" }, // Admin Utama
  { u: "tadung",   p: "tadung123",   rootId: "1.1" }, // Hanya melihat dari 1.1
  { u: "hammadu",  p: "hammadu123",  rootId: "1.2" }, 
  { u: "badu",     p: "badu123",     rootId: "1.3" },     
  { u: "dida",     p: "dida123",     rootId: "1.4" },
  { u: "bacce",    p: "bacce123",    rootId: "1.5" },
  { u: "barang",   p: "barang123",   rootId: "1.6" },
  { u: "kami",     p: "kami123",     rootId: "1.7" },
  { u: "hasani",   p: "hasani123",   rootId: "1.8" },     
  { u: "ihsans",   p: "ihsans12345", rootId: "all" }  // Admin cadangan
];

/* ==========================================================================
   API HANDLERS (PINTU MASUK UTAMA)
   ========================================================================== */

// Handle permintaan GET (Untuk mengambil data)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify(getAllData()))
    .setMimeType(ContentService.MimeType.JSON);
}

// Handle permintaan POST (Login, Simpan, Edit, Hapus)
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var result = {};
    
    // ------------------------------------------
    // 1. LOGIKA LOGIN
    // ------------------------------------------
    if (params.action === "login") {
      var inputUser = params.u;
      var inputPass = params.p;
      
      // Mencari user yang cocok
      var targetUser = ALLOWED_USERS.find(function(user) {
        return user.u === inputUser && user.p === inputPass;
      });

      if (targetUser) {
        // Jika ketemu, kirim status success DAN rootId milik user tersebut
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "success",
          rootId: targetUser.rootId 
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "fail" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ------------------------------------------
    // 2. LOGIKA DATABASE (CRUD)
    // ------------------------------------------
    if (params.action === "add") {
      result = addData(params);
    } 
    else if (params.action === "edit") {
      result = editData(params);
    } 
    else if (params.action === "delete") {
      result = deleteData(params.id);
    }
    
    // Kembalikan data terbaru setelah operasi selesai
    return ContentService.createTextOutput(JSON.stringify(getAllData())).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ==========================================================================
   FUNGSI-FUNGSI DATABASE
   ========================================================================== */

// Mengambil semua data dari Sheet
function getAllData() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  data.shift(); // Hapus baris header (judul kolom)
  
  return data.map(function(row) {
    return {
      id: row[0],
      parentId: row[1],
      name: row[2],
      spouse: row[3],
      generation: row[4],
      motherName: row[5]
    };
  });
}

// Menambah Data Baru
function addData(params) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();

  // Tentukan Generasi otomatis berdasarkan orang tua
  var parentRow = data.find(function(r) { return r[0] == params.parentId });
  var parentGen = parentRow ? parseInt(parentRow[4]) : 1;
  var newGen = parentGen + 1;

  var childrenToSave = [];
  if (params.children && Array.isArray(params.children)) {
    childrenToSave = params.children;
  } else if (params.name) {
    childrenToSave = [{name: params.name, spouse: params.spouse || ""}];
  }
  
  childrenToSave.forEach(function(child) {
    if (child.name && child.name.toString().trim() !== "") {
      var newId = "id_" + Math.random().toString(36).substr(2, 8);
      var childSpouse = child.spouse ? child.spouse.trim() : "";
      
      sheet.appendRow([
        newId, 
        params.parentId, 
        child.name.trim(), 
        childSpouse, 
        newGen, 
        params.motherName || ""
      ]);
      
      // Update balik nama pasangan agar saling terhubung
      if (childSpouse !== "") {
        updateReciprocalSpouse(sheet, child.name.trim(), childSpouse);
      }
    }
  });

  return getAllData();
}

// Edit Data (VERSI DIPERBARUI: Sinkronisasi Nama Ibu & Pasangan)
function editData(params) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  var rowIndex = -1;
  var oldName = "";
  var oldSpouse = ""; 
  
  // 1. Cari baris data yang mau diedit dan simpan data lama
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == params.id) {
      oldName = data[i][2];
      oldSpouse = data[i][3] ? data[i][3].toString() : ""; // Simpan Pasangan Lama
      rowIndex = i;
      break;
    }
  }
  
  if (rowIndex === -1) return getAllData(); // ID tidak ditemukan

  var newName = params.name.trim();
  var newSpouse = params.spouse ? params.spouse.trim() : "";
  var newMother = params.motherName ? params.motherName.trim() : "";

  // 2. Update data utama di memori
  data[rowIndex][2] = newName;
  data[rowIndex][3] = newSpouse;
  data[rowIndex][5] = newMother;

  // ---------------------------------------------------------
  // LOGIKA SINKRONISASI OTOMATIS
  // ---------------------------------------------------------

  // A. JIKA NAMA ORANG INI BERUBAH:
  // Update referensi nama ini di kolom 'Pasangan' dan 'Nama Ibu' milik orang lain
  if (oldName !== newName) {
    for (var k = 1; k < data.length; k++) {
      if (k === rowIndex) continue; // Jangan cek diri sendiri
      
      // Update di kolom Pasangan milik orang lain (jika dia jadi pasangan orang lain)
      var spouseStr = data[k][3].toString();
      if (spouseStr.indexOf(oldName) !== -1) {
        var parts = spouseStr.split(',').map(function(s){ return s.trim() });
        var updatedParts = parts.map(function(s){ return s === oldName ? newName : s; });
        data[k][3] = updatedParts.join(', ');
      }

      // Update di kolom Nama Ibu milik orang lain (jika dia terdaftar sebagai ibu)
      var motherStr = data[k][5].toString();
      if (motherStr.trim() === oldName) {
        data[k][5] = newName;
      }
    }
  }

  // B. JIKA KOLOM PASANGAN BERUBAH (Misal: Istri diedit dari "Ani" jadi "Ani S"):
  // Cari semua anak dari orang ini, lalu update 'Nama Ibu' mereka
  if (oldSpouse !== newSpouse) {
    for (var j = 1; j < data.length; j++) {
      // Cek apakah baris ini adalah ANAK dari orang yang sedang diedit (Parent ID match)
      if (data[j][1] == params.id) {
         var currentChildMother = data[j][5].toString().trim();
         
         // Cek apakah Nama Ibu anak sama dengan salah satu Pasangan Lama
         // Jika ya, ganti dengan Pasangan Baru yang sesuai posisinya atau ganti total
         
         // Kasus Sederhana: Pasangan hanya 1 orang
         if (currentChildMother === oldSpouse.trim()) {
           data[j][5] = newSpouse;
         }
         // Kasus Kompleks: Banyak pasangan (dipisah koma), coba cocokkan elemennya
         else if (oldSpouse.indexOf(',') !== -1) {
            var oldParts = oldSpouse.split(',').map(function(s){ return s.trim() });
            var newParts = newSpouse.split(',').map(function(s){ return s.trim() });
            
            // Jika nama ibu anak ada di daftar lama, dan daftar baru punya jumlah yang cukup
            var idx = oldParts.indexOf(currentChildMother);
            if (idx !== -1 && idx < newParts.length) {
               data[j][5] = newParts[idx]; // Update ke nama baru di posisi yang sama
            }
         }
      }
    }
  }

  // ---------------------------------------------------------

  // 3. Simpan semua perubahan ke Sheet sekaligus
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);

  // 4. Cek hubungan timbal balik pasangan baru
  if (newSpouse !== "") {
    updateReciprocalSpouse(sheet, newName, newSpouse);
  }

  return getAllData();
}

// Hapus Data
function deleteData(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] == id) { 
      rowIndex = i + 1;
      break; 
    }
  }
  if (rowIndex > -1) sheet.deleteRow(rowIndex);
  return getAllData();
}

// Fungsi Helper: Agar A <-> B saling terhubung di kolom pasangan
function updateReciprocalSpouse(sheet, personName, spouseName) {
  var data = sheet.getDataRange().getValues();
  var targetSpouses = spouseName.split(',').map(function(s){ return s.trim() });

  targetSpouses.forEach(function(targetName) {
    if(targetName === "") return;
    for (var i = 1; i < data.length; i++) {
      // Cari baris si Pasangan berdasarkan Nama
      if (data[i][2].toString().toLowerCase() === targetName.toLowerCase()) {
        var currentSpouseStr = data[i][3].toString();
        var currentSpouses = currentSpouseStr.split(',').map(function(s){ return s.trim() });
        
        // Jika belum ada, tambahkan
        var isLinked = currentSpouses.some(function(s) { 
          return s.toLowerCase() === personName.toLowerCase(); 
        });

        if (!isLinked) {
          if (currentSpouseStr === "") currentSpouseStr = personName;
          else currentSpouseStr += ", " + personName;
          
          sheet.getRange(i + 1, 4).setValue(currentSpouseStr);
        }
      }
    }
  });
}

/* ==========================================================================
   SETUP AWAL
   ========================================================================== */
function getSheet() {
  var ss = SPREADSHEET_ID ?
    SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { 
    sheet = ss.insertSheet(SHEET_NAME); 
    setupInitialData(sheet);
  }
  if (sheet.getLastRow() <= 1) { setupInitialData(sheet); }
  return sheet;
}

function setupInitialData(sheet) {
  sheet.clear();
  sheet.appendRow(["ID", "Parent ID", "Nama", "Pasangan", "Generasi", "Nama Ibu"]);
  var initialData = [
    ['1', '', 'Puang Guru Nasing', 'Istri A', 1, ''],
    // Data dummy awal bisa ditambahkan di sini jika sheet masih kosong
  ];
  if(initialData.length > 0) sheet.getRange(2, 1, initialData.length, initialData[0].length).setValues(initialData);
}
