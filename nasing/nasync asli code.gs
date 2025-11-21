var SPREADSHEET_ID = ""; 
var SHEET_NAME = 'DataSilsilah';

/* ==========================================================================
   API HANDLERS
   ========================================================================== */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify(getAllData()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var result = {};
    
    if (params.action === "add") result = addData(params);
    else if (params.action === "edit") result = editData(params); // Edit logic yang baru
    else if (params.action === "delete") result = deleteData(params.id);
    
    return ContentService.createTextOutput(JSON.stringify(getAllData())).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ==========================================================================
   DATABASE FUNCTIONS
   ========================================================================== */

function getAllData() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  data.shift(); // Hapus header
  
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

function addData(params) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
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
      
      // Jika saat ditambah sudah punya pasangan, update data pasangannya (reciprocal)
      if (childSpouse !== "") {
        updateReciprocalSpouse(sheet, child.name.trim(), childSpouse);
      }
    }
  });

  return getAllData();
}

// ==========================================
// FUNGSI EDIT YANG DISEMPURNAKAN (AUTO UPDATE RELASI)
// ==========================================
function editData(params) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues(); // Ambil semua data ke memori
  
  var rowIndex = -1;
  var oldName = "";
  
  // 1. Cari baris user dan simpan Nama Lama
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == params.id) {
      oldName = data[i][2]; // Simpan nama lama (Kolom C)
      rowIndex = i;
      break;
    }
  }
  
  if (rowIndex === -1) return getAllData(); // ID tidak ketemu

  var newName = params.name.trim();
  var newSpouse = params.spouse ? params.spouse.trim() : "";
  var newMother = params.motherName ? params.motherName.trim() : "";

  // 2. Update Data User tersebut di Array Memori
  data[rowIndex][2] = newName;   // Nama
  data[rowIndex][3] = newSpouse; // Pasangan
  data[rowIndex][5] = newMother; // Ibu

  // 3. PROPAGASI PERUBAHAN NAMA (Jika nama berubah)
  if (oldName !== newName) {
    for (var k = 1; k < data.length; k++) {
      if (k === rowIndex) continue; // Jangan cek baris sendiri lagi

      // A. Cek Kolom Pasangan (Index 3)
      var spouseStr = data[k][3].toString();
      if (spouseStr.indexOf(oldName) !== -1) {
        // Split, ganti yang cocok, Join kembali (agar akurat)
        var parts = spouseStr.split(',').map(function(s){ return s.trim() });
        var updatedParts = parts.map(function(s){ 
          return s === oldName ? newName : s; 
        });
        data[k][3] = updatedParts.join(', ');
      }

      // B. Cek Kolom Nama Ibu (Index 5)
      var motherStr = data[k][5].toString();
      if (motherStr.trim() === oldName) {
        data[k][5] = newName;
      }
    }
  }

  // 4. Tulis Kembali Semua Data ke Sheet (Batch Update - Lebih Cepat & Aman)
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);

  // 5. Handle Integrasi Pasangan (Jika user mengubah isian pasangannya)
  // Kita panggil fungsi helper ini terpisah karena dia membaca sheet ulang, 
  // tapi karena kita sudah save di langkah 4, datanya sudah sinkron.
  if (newSpouse !== "") {
    updateReciprocalSpouse(sheet, newName, newSpouse);
  }

  return getAllData();
}

function deleteData(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] == id) { rowIndex = i + 1; break; }
  }
  if (rowIndex > -1) sheet.deleteRow(rowIndex);
  return getAllData();
}

// Helper: Agar A <-> B saling terhubung
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
        
        // Jika nama personName belum ada di daftar pasangan target, tambahkan
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
   INITIAL SETUP
   ========================================================================== */
function getSheet() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); setupInitialData(sheet); }
  if (sheet.getLastRow() <= 1) { setupInitialData(sheet); }
  return sheet;
}

function setupInitialData(sheet) {
  sheet.clear();
  sheet.appendRow(["ID", "Parent ID", "Nama", "Pasangan", "Generasi", "Nama Ibu"]);
  var initialData = [
    ['1', '', 'Puang Guru Nasing', 'Istri A', 1, ''],
    ['1.1', '1', 'Puang Tadung', 'Puang Caccing', 2, 'Istri A']
  ];
  if(initialData.length > 0) sheet.getRange(2, 1, initialData.length, initialData[0].length).setValues(initialData);
}
