/**
 * === CONFIG ===
 */
const SF_LOGIN = 'https://login.salesforce.com'; // PRODUCTION
const SHEET_NAME = 'Validazione Dati';
const SF_API_VERSION = 'v60.0';

// IMPORTANTE: Sostituisci questi valori con le tue credenziali Salesforce OAuth2
const CLIENT_ID = 'YOUR_SALESFORCE_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_SALESFORCE_CLIENT_SECRET_HERE';
const SF_DOMAIN = 'https://fondazionelab00ets.lightning.force.com';

// IMPORTANTE: Sostituisci con l'URL della tua Google Apps Script Web App
const WEB_APP_EXEC = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';

function getRedirectFromExec_() {
  return WEB_APP_EXEC.replace(/\/exec$/, '/usercallback');
}

function debugAccessToken() {
  const service = getService_();
  Logger.log("hasAccess=%s", service.hasAccess());
  Logger.log("accessToken=%s", service.getAccessToken() ? "PRESENTE" : "MANCANTE");
  const t = service.getToken();
  Logger.log("instance_url=%s", t && t.instance_url);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Salesforce')
    .addItem('Autorizza', 'authorize')
    .addSeparator()
    .addItem('Sync Comuni (A:C)', 'syncComuni')
    .addItem('Sync Tipo Visita (D)', 'syncTipoVisita')
    .addItem('Sync Beneficiario (E)', 'syncBeneficiario')
    .addItem('Sync Centro Medico (F)', 'syncCentroMedico')
    .addItem('Sync Ente No Profit (G:H)', 'syncEnteNoProfit')
    .addItem('Sync Boolean (I)', 'syncBoolean')
    .addItem('Sync Partner (J)', 'syncPartner')
    .addSeparator()
    .addItem('Sync Tutto', 'syncAll')
    .addSeparator()
    .addItem('Valida Dati Rendicontazione', 'validateRendicontazione')
    .addToUi();
}

function syncAll() {
  syncComuni();
  syncTipoVisita();
  syncBeneficiario();
  syncCentroMedico();
  syncEnteNoProfit();
  syncBoolean();
  syncPartner();
}

function nukeAuth() {
  const service = getService_();
  service.reset();
  PropertiesService.getUserProperties().deleteAllProperties();
  Logger.log("Reset OAuth completato.");
}

function showLastOAuthError() {
  const service = getService_();
  Logger.log(service.getLastError());
}

/**
 * OAuth2 service
 * Libreria OAuth2: aggiungila in Apps Script Libraries (OAuth2)
 */

function getService_() {
  return OAuth2.createService('Salesforce')
    .setAuthorizationBaseUrl(`${SF_DOMAIN}/services/oauth2/authorize`)
    .setTokenUrl(`${SF_DOMAIN}/services/oauth2/token`)
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('api refresh_token')
    .setParam('prompt', 'consent')
    .setRedirectUri(getRedirectFromExec_());
}

function authCallback(request) {
  const service = getService_();
  const ok = service.handleCallback(request);
  return HtmlService.createHtmlOutput(ok ? 'Autorizzato ✅' : 'Negato ❌');
}

function resetAuth() {
  getService_().reset();
  Logger.log("OAuth reset fatto.");
}

function showRedirectUri() {
  const service = getService_();
  Logger.log("Redirect URI effettiva: %s", service.getRedirectUri());
  Logger.log("Auth URL effettivo: %s", service.getAuthorizationUrl());
}

/**
 * 1) Esegui questa una volta: ti stampa un URL da aprire e autorizzare
 */
function authorize() {
  const service = getService_();
  if (!service.hasAccess()) {
    const url = service.getAuthorizationUrl();
    Logger.log('Apri questo URL e autorizza: %s', url);
  } else {
    Logger.log('Già autorizzato ✅');
  }
}


function debugToken() {
  const service = getService_();
  const t = service.getToken();
  Logger.log(JSON.stringify(t, null, 2));
}

function syncComuni() {
  const service = getService_();
  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  const soql = `
    SELECT Nome_Comune__c, Provincia__c, Regione__c
    FROM Comune__c
    WHERE Nome_Comune__c != null
    ORDER BY Nome_Comune__c ASC
  `.trim();

  const records = queryAll_(service, instanceUrl, accessToken, soql);

  const values = records.map(r => ([
    r.Nome_Comune__c ?? '',
    r.Provincia__c ?? '',
    r.Regione__c ?? ''
  ]));

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Crealo o verifica il nome.`);

  // Intestazioni
  sh.getRange(1, 1, 1, 3).setValues([['Comune', 'Provincia', 'Regione']]);

  // Pulisce solo A:C dal basso (riga 2 in giù), senza toccare altre colonne
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, 1, lastRow - 1, 3).clearContent();
  }

  // Scrive a partire da A2 (colonna 1), 3 colonne
  if (values.length) {
    sh.getRange(2, 1, values.length, 3).setValues(values);
  }

  sh.autoResizeColumns(1, 3);
  Logger.log(`✅ Sync Comuni completato: ${values.length} righe scritte su "${SHEET_NAME}" (A:C)`);
}

function syncTipoVisita() {
  const COL_D = 4; // colonna D
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  const soql = `
    SELECT Tipo_Visita__c
    FROM Tipo_Visita__c
    WHERE Tipo_Visita__c != null
    ORDER BY Tipo_Visita__c ASC
  `.trim();

  // Corretto: passa service come primo parametro
  const records = queryAll_(service, instanceUrl, accessToken, soql);

  // Una colonna sola: D
  const values = records.map(r => [r.Tipo_Visita__c ?? '']);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazione in D1
  sh.getRange(1, COL_D).setValue('Tipo Visita');

  // Pulisce solo la colonna D dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_D, lastRow - 1, 1).clearContent();
  }

  // Scrive a partire da D2
  if (values.length) {
    sh.getRange(2, COL_D, values.length, 1).setValues(values);
  }

  sh.autoResizeColumn(COL_D);
  Logger.log(`✅ Sync Tipo_Visita completato: ${values.length} righe scritte su "${SHEET_NAME}" (colonna D)`);
}

function syncBeneficiario() {
  const COL_E = 5; // colonna E
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  // Ottieni i valori distinti dalla picklist Visit__c.Beneficiary_Type__c
  // Recupera tutti i record e deduplica in Apps Script
  const soql = `
    SELECT Beneficiary_Type__c
    FROM Visit__c
    WHERE Beneficiary_Type__c != null
    ORDER BY Beneficiary_Type__c ASC
    LIMIT 10000
  `.trim();

  const records = queryAll_(service, instanceUrl, accessToken, soql);

  // Deduplica usando Set e ordina
  const uniqueValues = new Set();
  records.forEach(r => {
    if (r.Beneficiary_Type__c) {
      uniqueValues.add(r.Beneficiary_Type__c);
    }
  });
  
  const sortedValues = Array.from(uniqueValues).sort();
  const values = sortedValues.map(v => [v]);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazione in E1
  sh.getRange(1, COL_E).setValue('Beneficiario');

  // Pulisce solo la colonna E dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_E, lastRow - 1, 1).clearContent();
  }

  // Scrive a partire da E2
  if (values.length) {
    sh.getRange(2, COL_E, values.length, 1).setValues(values);
  }

  sh.autoResizeColumn(COL_E);
  Logger.log(`✅ Sync Beneficiario completato: ${values.length} righe scritte su "${SHEET_NAME}" (colonna E)`);
}

function syncCentroMedico() {
  const COL_F = 6; // colonna F
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  // Ottieni valori distinti da Invoice__c.Medical_Center__c
  // Recupera tutti i record e deduplica in Apps Script
  const soql = `
    SELECT Medical_Center__c
    FROM Invoice__c
    WHERE Medical_Center__c != null
    ORDER BY Medical_Center__c ASC
    LIMIT 10000
  `.trim();

  const records = queryAll_(service, instanceUrl, accessToken, soql);

  // Deduplica usando Set e ordina
  const uniqueValues = new Set();
  records.forEach(r => {
    if (r.Medical_Center__c) {
      uniqueValues.add(r.Medical_Center__c);
    }
  });
  
  const sortedValues = Array.from(uniqueValues).sort();
  const values = sortedValues.map(v => [v]);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazione in F1
  sh.getRange(1, COL_F).setValue('Centro Medico');

  // Pulisce solo la colonna F dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_F, lastRow - 1, 1).clearContent();
  }

  // Scrive a partire da F2
  if (values.length) {
    sh.getRange(2, COL_F, values.length, 1).setValues(values);
  }

  sh.autoResizeColumn(COL_F);
  Logger.log(`✅ Sync Centro Medico completato: ${values.length} righe scritte su "${SHEET_NAME}" (colonna F)`);
}

function syncEnteNoProfit() {
  const COL_G = 7; // colonna G - Ente No Profit
  const COL_H = 8; // colonna H - No Profit Category
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  const soql = `
    SELECT Name, Ente_Categoria__c
    FROM Ente_No_Profit__c
    WHERE Name != null
    ORDER BY Name ASC
  `.trim();

  const records = queryAll_(service, instanceUrl, accessToken, soql);

  const values = records.map(r => ([
    r.Name ?? '',
    r.Ente_Categoria__c ?? ''
  ]));

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazioni in G1 e H1
  sh.getRange(1, COL_G, 1, 2).setValues([['Ente No Profit', 'No Profit Category']]);

  // Pulisce solo G:H dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_G, lastRow - 1, 2).clearContent();
  }

  // Scrive a partire da G2, 2 colonne
  if (values.length) {
    sh.getRange(2, COL_G, values.length, 2).setValues(values);
  }

  sh.autoResizeColumns(COL_G, 2);
  Logger.log(`✅ Sync Ente No Profit completato: ${values.length} righe scritte su "${SHEET_NAME}" (G:H)`);
}

function syncBoolean() {
  const COL_I = 9; // colonna I
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  // Valori fissi per Boolean
  const values = [['TRUE'], ['FALSE']];

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazione in I1
  sh.getRange(1, COL_I).setValue('Boolean');

  // Pulisce solo la colonna I dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_I, lastRow - 1, 1).clearContent();
  }

  // Scrive a partire da I2
  sh.getRange(2, COL_I, values.length, 1).setValues(values);

  sh.autoResizeColumn(COL_I);
  Logger.log(`✅ Sync Boolean completato: ${values.length} righe scritte su "${SHEET_NAME}" (colonna I)`);
}

function syncPartner() {
  const COL_J = 10; // colonna J
  const service = getService_();

  if (!service.hasAccess()) throw new Error('Non autorizzato. Esegui authorize().');

  const token = service.getToken();
  const instanceUrl = token.instance_url;
  const accessToken = service.getAccessToken();

  // Query per Account con Type = 'Investor', escludendo DEFAULT__c = true
  // Recupera tutti i record e deduplica in Apps Script
  const soql = `
    SELECT Nome_Donatore__c
    FROM Account
    WHERE Type = 'Investor'
    AND Nome_Donatore__c != null
    AND (DEFAULT__c = false OR DEFAULT__c = null)
    ORDER BY Nome_Donatore__c ASC
    LIMIT 10000
  `.trim();

  const records = queryAll_(service, instanceUrl, accessToken, soql);

  // Deduplica usando Set e ordina
  const uniqueValues = new Set();
  records.forEach(r => {
    if (r.Nome_Donatore__c) {
      uniqueValues.add(r.Nome_Donatore__c);
    }
  });
  
  const sortedValues = Array.from(uniqueValues).sort();
  const values = sortedValues.map(v => [v]);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" non trovato. Verifica il nome.`);

  // Intestazione in J1
  sh.getRange(1, COL_J).setValue('Partner');

  // Pulisce solo la colonna J dalla riga 2 in giù
  const lastRow = sh.getMaxRows();
  if (lastRow >= 2) {
    sh.getRange(2, COL_J, lastRow - 1, 1).clearContent();
  }

  // Scrive a partire da J2
  if (values.length) {
    sh.getRange(2, COL_J, values.length, 1).setValues(values);
  }

  sh.autoResizeColumn(COL_J);
  Logger.log(`✅ Sync Partner completato: ${values.length} righe scritte su "${SHEET_NAME}" (colonna J)`);
}

/**
 * Funzione helper per query paginate con gestione refresh token
 */
function queryAll_(service, instanceUrl, accessToken, soql) {
  let url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  let out = [];

  while (url) {
    let resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    // 👉 Se Salesforce dice "token invalido", forziamo refresh e riproviamo UNA volta
    if (resp.getResponseCode() === 401) {
      const body401 = resp.getContentText();
      if (body401.includes('INVALID_SESSION_ID')) {
        Logger.log('⚠️ Access token non valido. Provo refresh e ritento...');
        const refreshed = service.refresh(); // forza refresh token flow
        if (!refreshed) {
          throw new Error('Refresh fallito. Riesegui authorize() per riottenere refresh token.');
        }
        accessToken = service.getAccessToken(); // nuovo token
        resp = UrlFetchApp.fetch(url, {
          method: 'get',
          headers: { Authorization: `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
      }
    }

    const code = resp.getResponseCode();
    const body = resp.getContentText();
    if (code >= 300) throw new Error(`Salesforce ${code}: ${body}`);

    const json = JSON.parse(body);
    out = out.concat(json.records || []);

    url = (!json.done && json.nextRecordsUrl) ? (instanceUrl + json.nextRecordsUrl) : null;
  }

  return out;
}

function testIdentity() {
  const service = getService_();
  if (!service.hasAccess()) throw new Error("Non autorizzato: esegui authorize()");

  const token = service.getToken();
  Logger.log("instance_url: %s", token.instance_url);
  Logger.log("id endpoint: %s", token.id);

  const resp = UrlFetchApp.fetch(token.id, {
    headers: { Authorization: `Bearer ${service.getAccessToken()}` },
    muteHttpExceptions: true
  });

  Logger.log("HTTP %s", resp.getResponseCode());
  Logger.log(resp.getContentText());
}

/**
 * Valida tutte le celle nello sheet "Rendicontazione" rispetto alle liste di validazione
 * Colora in rosso le celle con valori errati e permette la correzione interattiva
 */
function validateRendicontazione() {
  const RENDICONTAZIONE_SHEET = 'Rendicontazione';
  const VALIDAZIONE_SHEET = 'Validazione Dati';
  
  const ss = SpreadsheetApp.getActive();
  const rendicontazioneSheet = ss.getSheetByName(RENDICONTAZIONE_SHEET);
  const validazioneSheet = ss.getSheetByName(VALIDAZIONE_SHEET);
  
  if (!rendicontazioneSheet) {
    throw new Error(`Sheet "${RENDICONTAZIONE_SHEET}" non trovato.`);
  }
  
  if (!validazioneSheet) {
    throw new Error(`Sheet "${VALIDAZIONE_SHEET}" non trovato. Esegui prima la sincronizzazione dei dati.`);
  }
  
  // Carica le liste di validazione dallo sheet "Validazione Dati"
  const validationLists = loadValidationLists_(validazioneSheet);
  
  // Ottieni tutti i dati dallo sheet Rendicontazione (escludendo l'intestazione)
  const lastRow = rendicontazioneSheet.getLastRow();
  const lastCol = rendicontazioneSheet.getLastColumn();
  
  if (lastRow < 2) {
    Logger.log('⚠️ Nessun dato da validare nello sheet Rendicontazione');
    SpreadsheetApp.getUi().alert('Validazione', 'Nessun dato da validare nello sheet Rendicontazione', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Leggi tutti i dati (dalla riga 2 in poi, assumendo riga 1 = intestazioni)
  const dataRange = rendicontazioneSheet.getRange(2, 1, lastRow - 1, lastCol);
  const dataValues = dataRange.getValues();
  
  // Reset di tutti i colori di background prima di validare
  dataRange.setBackground(null);
  
  const errorCells = [];
  
  // Leggi le intestazioni dalla riga 1 per identificare dinamicamente le colonne
  const headerRow = rendicontazioneSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const columnMap = {};
  
  // Mappa le intestazioni alle colonne
  for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
    const header = String(headerRow[colIndex] || '').trim().toLowerCase();
    const colNumber = colIndex + 1;
    const colLetter = columnNumberToLetter_(colNumber);
    
    // Mappa le intestazioni comuni (in ordine di specificità)
    if (header.includes('partner')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.partners, name: 'Partner' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Partner`);
    } else if ((header.includes('data fattura') || header.includes('data della fattura')) && !header.includes('competenza')) {
      columnMap[colNumber] = { type: 'date', name: 'Data Fattura' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Data Fattura`);
    } else if (header.includes('data competenza') || header.includes('data di competenza')) {
      columnMap[colNumber] = { type: 'date', name: 'Data Competenza' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Data Competenza`);
    } else if (header.includes('centro medico')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.medicalCenters, name: 'Centro Medico' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Centro Medico`);
    } else if (header.includes('ente no profit') && !header.includes('categoria')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.entiNoProfit, name: 'Ente No Profit' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Ente No Profit`);
    } else if (header.includes('categoria ente') || header.includes('categoria ente no profit')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.categorieEnti, name: 'Categoria Ente' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Categoria Ente`);
    } else if (header.includes('prestazione gratuita')) {
      columnMap[colNumber] = { type: 'boolean', name: 'Prestazione Gratuita' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Prestazione Gratuita`);
    } else if (header.includes('fattura non disponibile')) {
      columnMap[colNumber] = { type: 'boolean', name: 'Fattura Non Disponibile' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Fattura Non Disponibile`);
    } else if (header.includes('tipologia prestazione') || (header.includes('tipo visita') && !header.includes('data'))) {
      columnMap[colNumber] = { type: 'list', list: validationLists.tipoVisita, name: 'Tipologia Prestazione' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Tipologia Prestazione (lista con ${validationLists.tipoVisita.length} elementi)`);
    } else if (header.includes('tipo beneficiario') || (header.includes('beneficiario') && !header.includes('ente'))) {
      columnMap[colNumber] = { type: 'list', list: validationLists.beneficiario, name: 'Tipo Beneficiario' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Tipo Beneficiario`);
    } else if (header.includes('data visita') || header.includes('data della visita')) {
      columnMap[colNumber] = { type: 'date', name: 'Data Visita' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Data Visita`);
    } else if (header.includes('comune')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.comuni, name: 'Comune' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Comune`);
    } else if (header.includes('provincia')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.province, name: 'Provincia' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Provincia (lista con ${validationLists.province.length} elementi)`);
    } else if (header.includes('regione')) {
      columnMap[colNumber] = { type: 'list', list: validationLists.regioni, name: 'Regione' };
      Logger.log(`Mappata colonna ${colLetter} (${colNumber}): "${headerRow[colIndex]}" -> Regione`);
    }
  }
  
  // Fallback: se non abbiamo trovato le colonne dinamicamente, usa il mapping statico
  // (per compatibilità con sheet senza intestazioni corrette)
  // Converti le chiavi stringa in numeri per columnMap
  const normalizedColumnMap = {};
  for (const key in columnMap) {
    normalizedColumnMap[parseInt(key)] = columnMap[key];
  }
  
  const columnValidations = Object.keys(normalizedColumnMap).length > 0 ? normalizedColumnMap : {
    1: { type: 'list', list: validationLists.partners, name: 'Partner' }, // A: Partner
    2: { type: 'date', name: 'Data Fattura' }, // B: Data Fattura
    3: { type: 'date', name: 'Data Competenza' }, // C: Data Competenza
    5: { type: 'list', list: validationLists.medicalCenters, name: 'Centro Medico' }, // E: Centro Medico
    6: { type: 'list', list: validationLists.entiNoProfit, name: 'Ente No Profit' }, // F: Ente No Profit
    7: { type: 'list', list: validationLists.categorieEnti, name: 'Categoria Ente' }, // G: Categoria Ente
    8: { type: 'boolean', name: 'Prestazione Gratuita' }, // H: Prestazione Gratuita
    9: { type: 'list', list: validationLists.tipoVisita, name: 'Tipologia Prestazione' }, // I: Tipologia Prestazione
    11: { type: 'list', list: validationLists.beneficiario, name: 'Tipo Beneficiario' }, // K: Tipo Beneficiario
    15: { type: 'date', name: 'Data Visita' }, // O: Data Visita
    16: { type: 'list', list: validationLists.comuni, name: 'Comune' }, // P: Comune
    17: { type: 'list', list: validationLists.province, name: 'Provincia' }, // Q: Provincia
    18: { type: 'list', list: validationLists.regioni, name: 'Regione' } // R: Regione
  };
  
  // Valida ogni riga e trova gli errori con i suggerimenti
  for (let rowIndex = 0; rowIndex < dataValues.length; rowIndex++) {
    const row = dataValues[rowIndex];
    const actualRowNumber = rowIndex + 2; // +2 perché partiamo dalla riga 2
    
    // Valida ogni colonna
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const colNumber = colIndex + 1; // +1 perché le colonne partono da 1
      const validation = columnValidations[colNumber];
      
      if (!validation) continue; // Colonna non da validare
      
      const cellValue = row[colIndex];
      
      // Se la cella è vuota, salta (non segnaliamo celle vuote come errore)
      if (cellValue === '' || cellValue === null || cellValue === undefined) {
        continue;
      }
      
      let isValid = false;
      let suggestion = null;
      
      // Validazione in base al tipo
      if (validation.type === 'list') {
        // Valida contro la lista
        const cellValueStr = String(cellValue).trim();
        const normalizedValue = cellValueStr.toLowerCase();
        
        // Verifica che la lista esista e non sia vuota
        if (!validation.list || validation.list.length === 0) {
          Logger.log(`⚠️ Lista vuota per colonna ${colNumber} (${validation.name})`);
          continue; // Salta questa colonna se la lista è vuota
        }
        
        // Validazione case-sensitive: il valore deve essere ESATTAMENTE uguale (case-sensitive)
        // per colonne come Tipo Beneficiario
        const isCaseSensitive = validation.name === 'Tipo Beneficiario' || 
                                 validation.name === 'Tipologia Prestazione' ||
                                 validation.name === 'Provincia' ||
                                 validation.name === 'Regione' ||
                                 validation.name === 'Comune';
        
        if (isCaseSensitive) {
          // Validazione case-sensitive: confronto esatto
          isValid = validation.list.some(item => 
            String(item).trim() === cellValueStr
          );
          
          // Se non valido, cerca anche case-insensitive per vedere se è solo un problema di case
          if (!isValid) {
            const caseInsensitiveMatch = validation.list.find(item => 
              String(item).trim().toLowerCase() === normalizedValue
            );
            if (caseInsensitiveMatch) {
              // Trovato un match case-insensitive: suggerisci il valore corretto con il case giusto
              suggestion = caseInsensitiveMatch;
              Logger.log(`🔍 Trovato match case-insensitive: "${cellValueStr}" -> "${caseInsensitiveMatch}"`);
            }
          }
        } else {
          // Validazione case-insensitive per altre colonne
          isValid = validation.list.some(item => 
            String(item).trim().toLowerCase() === normalizedValue
          );
        }
        
        // Se non valido, trova i suggerimenti più simili
        if (!isValid) {
          // Trova i suggerimenti più simili usando l'algoritmo generale
          if (!suggestion) {
            const candidates = findBestMatches_(cellValueStr, normalizedValue, validation.list, validation.name);
            if (candidates && candidates.length > 0) {
              // Se c'è un solo candidato o il primo ha score molto alto, usa quello
              if (candidates.length === 1 || candidates[0].score >= 0.9) {
                suggestion = candidates[0].value;
              } else {
                // Altrimenti passa tutti i candidati
                suggestion = candidates;
              }
            }
          }
        }
      } else if (validation.type === 'date') {
        // Valida formato data
        isValid = isValidDate_(cellValue);
        if (!isValid) {
          // Per le date, suggeriamo di verificare il formato
          suggestion = 'Verifica il formato data (es: GG/MM/AAAA)';
        }
      } else if (validation.type === 'boolean') {
        // Valida boolean (TRUE/FALSE)
        const normalizedValue = String(cellValue).trim().toUpperCase();
        isValid = normalizedValue === 'TRUE' || normalizedValue === 'FALSE';
        if (!isValid) {
          // Per i boolean, suggeriamo TRUE o FALSE
          suggestion = 'TRUE o FALSE';
        }
      }
      
      if (!isValid) {
        // Colora la cella in rosso
        const cell = rendicontazioneSheet.getRange(actualRowNumber, colNumber);
        cell.setBackground('#ffcccc'); // Rosso chiaro
        
        // Normalizza suggestion: può essere una stringa o un array di candidati
        errorCells.push({
          row: actualRowNumber,
          col: colNumber,
          columnName: validation.name,
          value: cellValue,
          suggestion: suggestion, // Può essere stringa o array di {value, score}
          validation: validation
        });
      }
    }
  }
  
  // Se ci sono errori, avvia la correzione interattiva
  if (errorCells.length === 0) {
    Logger.log('✅ Validazione completata: nessun errore trovato');
    SpreadsheetApp.getUi().alert('Validazione completata', 'Nessun errore trovato! ✅', SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    Logger.log(`⚠️ Validazione completata: ${errorCells.length} errori trovati`);
    // Avvia la correzione interattiva
    correctErrorsInteractively_(rendicontazioneSheet, errorCells);
  }
}

/**
 * Corregge gli errori in modo interattivo usando un pattern "chain of callbacks"
 * NOTA: showModalDialog NON blocca l'esecuzione in Google Apps Script
 * Quindi usiamo CacheService per salvare lo stato e richiamare il prossimo dialog
 */
function correctErrorsInteractively_(sheet, errorCells) {
  // Usa CacheService invece di PropertiesService (limite 100KB vs 9KB)
  const cache = CacheService.getScriptCache();
  
  // Serializza gli errori (rimuovi oggetti non serializzabili e limita i suggerimenti)
  const serializableErrors = errorCells.map(e => {
    // Limita i suggerimenti a max 5 per ridurre la dimensione
    let limitedSuggestion = e.suggestion;
    if (Array.isArray(e.suggestion)) {
      limitedSuggestion = e.suggestion.slice(0, 5).map(s => ({
        value: s.value,
        score: s.score
      }));
    }
    return {
      row: e.row,
      col: e.col,
      value: String(e.value).substring(0, 200), // Limita la lunghezza del valore
      columnName: e.columnName,
      validation: { type: e.validation.type, name: e.validation.name }, // Solo tipo e nome
      suggestion: limitedSuggestion
    };
  });
  
  // Salva in cache (durata 30 minuti = 1800 secondi)
  cache.put('validationErrors', JSON.stringify(serializableErrors), 1800);
  cache.put('validationIndex', '0', 1800);
  cache.put('validationCorrected', '0', 1800);
  cache.put('validationSkipped', '0', 1800);
  cache.put('validationSheetName', sheet.getName(), 1800);
  
  // Mostra il primo dialog
  showNextErrorDialog_();
}

/**
 * Mostra il dialog per il prossimo errore nella catena
 */
function showNextErrorDialog_() {
  const cache = CacheService.getScriptCache();
  const ui = SpreadsheetApp.getUi();
  
  // Leggi lo stato corrente dalla cache
  const errorsJson = cache.get('validationErrors');
  if (!errorsJson) {
    Logger.log('Nessun errore da processare o cache scaduta');
    return;
  }
  
  const errors = JSON.parse(errorsJson);
  const currentIndex = parseInt(cache.get('validationIndex') || '0');
  const correctedCount = parseInt(cache.get('validationCorrected') || '0');
  const skippedCount = parseInt(cache.get('validationSkipped') || '0');
  const sheetName = cache.get('validationSheetName');
  
  // Verifica se abbiamo finito
  if (currentIndex >= errors.length) {
    // Mostra il riepilogo finale
    showValidationSummary_();
    return;
  }
  
  const error = errors[currentIndex];
  const colLetter = columnNumberToLetter_(error.col);
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  
  // Evidenzia la cella errata
  if (sheet) {
    const cell = sheet.getRange(error.row, error.col);
    sheet.setActiveRange(cell);
  }
  
  // Gestisci i diversi tipi di errori
  if (error.validation.type === 'boolean') {
    // Per i boolean, usa un prompt standard (bloccante)
    const message = `📍 Cella ${colLetter}${error.row} - ${error.columnName}\n\n` +
      `Valore errato: "${error.value}"\n\n` +
      `Valori validi: TRUE o FALSE\n\n` +
      `Inserisci il valore corretto:`;
    
    const boolResponse = ui.prompt(
      `Errore ${currentIndex + 1}/${errors.length} - Boolean`,
      message,
      ui.ButtonSet.OK_CANCEL
    );
    
    if (boolResponse.getSelectedButton() === ui.Button.OK) {
      const inputValue = boolResponse.getResponseText().trim().toUpperCase();
      if (inputValue === 'TRUE' || inputValue === 'FALSE') {
        processValidationChoice_(inputValue);
      } else {
        processValidationChoice_(null); // Valore non valido
      }
    } else {
      // Annulla tutto
      cleanupValidationState_();
      return;
    }
  } else if (error.validation.type === 'date') {
    // Per le date, mostra solo un messaggio informativo (bloccante)
    const message = `📍 Cella ${colLetter}${error.row} - ${error.columnName}\n\n` +
      `Valore errato: "${error.value}"\n\n` +
      (error.suggestion || 'Verifica il formato data (es: GG/MM/AAAA)') +
      '\n\nNota: Correggi manualmente il formato della data nello sheet.';
    
    const dateResponse = ui.alert(
      `Errore ${currentIndex + 1}/${errors.length} - Data`,
      message,
      ui.ButtonSet.OK_CANCEL
    );
    
    if (dateResponse === ui.Button.OK) {
      processValidationChoice_(null); // Salta (richiede correzione manuale)
    } else {
      // Annulla tutto
      cleanupValidationState_();
      return;
    }
  } else if (error.suggestion) {
    // Per suggerimenti lista, usa il dialog HTML (non bloccante)
    let candidates = [];
    if (Array.isArray(error.suggestion) && error.suggestion.length > 0) {
      candidates = error.suggestion;
    } else if (typeof error.suggestion === 'string') {
      candidates = [{ value: error.suggestion, score: null }];
    }
    
    if (candidates.length > 0) {
      showCandidatesDialogChained_(candidates, error.value, colLetter, error.row, currentIndex + 1, errors.length);
      // Non continuare qui - il callback del dialog chiamerà processValidationChoice_
      return;
    } else {
      processValidationChoice_(null); // Nessun suggerimento
    }
  } else {
    // Nessun suggerimento disponibile
    processValidationChoice_(null);
  }
}

/**
 * Processa la scelta dell'utente e passa al prossimo errore
 * Restituisce true se ci sono altri errori da processare, false altrimenti
 */
function processValidationChoice_(selectedValue) {
  const cache = CacheService.getScriptCache();
  
  // Leggi lo stato corrente dalla cache
  const errorsJson = cache.get('validationErrors');
  if (!errorsJson) {
    Logger.log('Cache scaduta o vuota');
    return false;
  }
  
  const errors = JSON.parse(errorsJson);
  const currentIndex = parseInt(cache.get('validationIndex') || '0');
  let correctedCount = parseInt(cache.get('validationCorrected') || '0');
  let skippedCount = parseInt(cache.get('validationSkipped') || '0');
  const sheetName = cache.get('validationSheetName');
  
  const error = errors[currentIndex];
  const colLetter = columnNumberToLetter_(error.col);
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  
  if (selectedValue && sheet) {
    const cell = sheet.getRange(error.row, error.col);
    cell.setValue(selectedValue);
    
    // Rivalida la cella
    const validazioneSheet = SpreadsheetApp.getActive().getSheetByName('Validazione Dati');
    const validationLists = validazioneSheet ? loadValidationLists_(validazioneSheet) : null;
    
    if (revalidateCell_(cell, error.validation, validationLists)) {
      cell.setBackground(null); // Rimuovi il colore rosso
      correctedCount++;
      Logger.log(`✅ Corretto: ${colLetter}${error.row} - "${error.value}" -> "${selectedValue}"`);
    } else {
      cell.setBackground('#ffcccc');
      skippedCount++;
      Logger.log(`⚠️ Valore selezionato non valido: ${colLetter}${error.row}`);
    }
  } else {
    skippedCount++;
    Logger.log(`⏭️ Saltato: ${colLetter}${error.row}`);
  }
  
  // Aggiorna lo stato nella cache (durata 30 minuti)
  cache.put('validationIndex', String(currentIndex + 1), 1800);
  cache.put('validationCorrected', String(correctedCount), 1800);
  cache.put('validationSkipped', String(skippedCount), 1800);
  
  // Assicurati che tutte le modifiche allo spreadsheet siano state applicate
  SpreadsheetApp.flush();
  
  // Verifica se ci sono altri errori da processare (per il return)
  const hasMoreErrors = (currentIndex + 1) < errors.length;
  
  return hasMoreErrors;
}

/**
 * Aggiorna il contenuto del dialog corrente con il prossimo errore
 * Questa funzione viene chiamata dal client-side per aggiornare il dialog invece di aprirne uno nuovo
 */
function updateDialogWithNextError_() {
  const cache = CacheService.getScriptCache();
  
  // Leggi lo stato corrente dalla cache
  const errorsJson = cache.get('validationErrors');
  if (!errorsJson) {
    Logger.log('Nessun errore da processare o cache scaduta');
    return { done: true };
  }
  
  const errors = JSON.parse(errorsJson);
  const currentIndex = parseInt(cache.get('validationIndex') || '0');
  
  // Verifica se abbiamo finito
  if (currentIndex >= errors.length) {
    // Mostra il riepilogo finale
    showValidationSummary_();
    return { done: true };
  }
  
  const error = errors[currentIndex];
  const colLetter = columnNumberToLetter_(error.col);
  const sheetName = cache.get('validationSheetName');
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  
  // Evidenzia la cella errata
  if (sheet) {
    const cell = sheet.getRange(error.row, error.col);
    sheet.setActiveRange(cell);
  }
  
  // Prepara i candidati per il dialog
  let candidates = [];
  if (error.suggestion) {
    if (Array.isArray(error.suggestion) && error.suggestion.length > 0) {
      candidates = error.suggestion;
    } else if (typeof error.suggestion === 'string') {
      candidates = [{ value: error.suggestion, score: null }];
    }
  }
  
  return {
    done: false,
    errorNum: currentIndex + 1,
    totalErrors: errors.length,
    colLetter: colLetter,
    row: error.row,
    errorValue: String(error.value),
    candidates: candidates,
    columnName: error.columnName,
    validationType: error.validation.type
  };
}

/**
 * Mostra il riepilogo finale della validazione
 */
function showValidationSummary_() {
  const cache = CacheService.getScriptCache();
  const ui = SpreadsheetApp.getUi();
  
  const errorsJson = cache.get('validationErrors');
  const errors = errorsJson ? JSON.parse(errorsJson) : [];
  const correctedCount = parseInt(cache.get('validationCorrected') || '0');
  const skippedCount = parseInt(cache.get('validationSkipped') || '0');
  
  const summary = `Correzione completata:\n\n` +
    `✅ Corretti: ${correctedCount}\n` +
    `❌ Rifiutati/Saltati: ${skippedCount}\n` +
    `📊 Totale errori trovati: ${errors.length}`;
  
  ui.alert('Riepilogo', summary, ui.ButtonSet.OK);
  
  // Pulisci lo stato
  cleanupValidationState_();
}

/**
 * Pulisce lo stato della validazione
 */
function cleanupValidationState_() {
  const cache = CacheService.getScriptCache();
  cache.remove('validationErrors');
  cache.remove('validationIndex');
  cache.remove('validationCorrected');
  cache.remove('validationSkipped');
  cache.remove('validationSheetName');
}

/**
 * Versione del dialog con catena di callback (per dialog HTML non bloccanti)
 */
function showCandidatesDialogChained_(candidates, errorValue, colLetter, row, errorNum, totalErrors) {
  const ui = SpreadsheetApp.getUi();
  
  // Funzione helper per escape HTML
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`/g, '&#96;')
      .replace(/\$/g, '&#36;');
  }
  
  // Escape del valore errato per l'HTML
  const escapedErrorValue = escapeHtml(errorValue);
  
  // Crea HTML per i pulsanti dei candidati
  // Inserisce direttamente il valore nel data attribute con escape HTML corretto
  let buttonsHtml = '';
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const scoreText = candidate.score !== null ? ` (${Math.round(candidate.score * 100)}%)` : '';
    // Escape HTML per il valore nel data attribute e nel testo
    const escapedValue = escapeHtml(candidate.value);
    buttonsHtml += `
      <button class="candidate-button" data-value="${escapedValue}">
        "${escapedValue}"${scoreText}
      </button>
    `;
  }
  
  const html = HtmlService.createHtmlOutput(`
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2 { margin-top: 0; }
          .error-info { background: #fff3cd; padding: 10px; border-radius: 5px; margin-bottom: 15px; }
          .candidates-label { font-weight: bold; margin-bottom: 10px; }
          .candidate-button {
            display: block;
            width: 100%;
            padding: 12px;
            margin: 8px 0;
            background: #4285f4;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
          }
          .candidate-button:hover { background: #3367d6; }
          .candidate-button:disabled { background: #ccc; cursor: not-allowed; }
          .reject-button {
            display: block;
            width: 100%;
            padding: 12px;
            margin: 15px 0 0 0;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          }
          .reject-button:hover { background: #c82333; }
          .reject-button:disabled { background: #ccc; cursor: not-allowed; }
        </style>
      </head>
      <body>
        <h2>Errore ${errorNum}/${totalErrors}</h2>
        <div class="error-info">
          <strong>📍 Cella ${colLetter}${row}</strong><br>
          Valore errato: "${escapedErrorValue}"
        </div>
        <div class="candidates-label">Trovati ${candidates.length} valori simili:</div>
        ${buttonsHtml}
        <button class="reject-button">
          Rifiuta suggerimenti
        </button>
        
        <script>
          // Funzione per decodificare HTML entities
          function decodeHtmlEntities(text) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            return textarea.value;
          }
          
          // Funzione per inizializzare gli event listener sui pulsanti
          function initializeButtons() {
            try {
              // Aggiungi event listener a tutti i pulsanti candidati leggendo il valore dal data attribute
              const candidateButtons = document.querySelectorAll('.candidate-button[data-value]');
              console.log('Trovati ' + candidateButtons.length + ' pulsanti candidati');
              
              candidateButtons.forEach(function(button) {
                // Rimuovi eventuali listener esistenti clonando il pulsante
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                
                newButton.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const encodedValue = newButton.getAttribute('data-value');
                    if (!encodedValue) {
                      console.error('Data attribute data-value non trovato');
                      return;
                    }
                    // Decodifica HTML entities
                    const value = decodeHtmlEntities(encodedValue);
                    console.log('Valore selezionato: ' + value);
                    selectCandidate(value);
                  } catch (err) {
                    console.error('Errore nel click handler: ' + err.message);
                    alert('Errore: ' + err.message);
                  }
                });
              });
              
              // Aggiungi event listener al pulsante "Rifiuta suggerimenti"
              const rejectButton = document.querySelector('.reject-button');
              if (rejectButton) {
                const newRejectButton = rejectButton.cloneNode(true);
                rejectButton.parentNode.replaceChild(newRejectButton, rejectButton);
                newRejectButton.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  rejectSuggestion();
                });
                console.log('Pulsante rifiuta inizializzato');
              }
            } catch (err) {
              console.error('Errore in initializeButtons: ' + err.message);
              alert('Errore nell\'inizializzazione: ' + err.message);
            }
          }
          
          // Inizializza i pulsanti immediatamente e anche dopo il caricamento
          // Prova diversi metodi per assicurarsi che funzioni
          setTimeout(function() {
            console.log('Inizializzazione pulsanti con setTimeout');
            initializeButtons();
          }, 100);
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
              console.log('DOMContentLoaded - inizializzazione pulsanti');
              initializeButtons();
            });
          } else {
            console.log('DOM già caricato - inizializzazione immediata');
            initializeButtons();
          }
          
          // Fallback con window.onload
          window.onload = function() {
            console.log('window.onload - inizializzazione pulsanti');
            initializeButtons();
          };
          
          function selectCandidate(value) {
            try {
              // Disabilita i pulsanti
              const buttons = document.querySelectorAll('.candidate-button, .reject-button');
              buttons.forEach(btn => btn.disabled = true);
              
              // Chiama la funzione server per inserire il valore nella cella
              google.script.run
                .withSuccessHandler(function(hasMoreErrors) {
                  try {
                    // Il valore è stato inserito nella cella
                    if (hasMoreErrors) {
                      // Se ci sono altri errori, aggiorna il contenuto del dialog corrente
                      // invece di chiuderlo e aprirne uno nuovo
                      updateDialogContent();
                    } else {
                      // Non ci sono altri errori, chiudi questo dialog
                      google.script.host.close();
                    }
                  } catch (e) {
                    console.error('Errore nel success handler: ' + e.message);
                    alert('Errore: ' + e.message);
                    buttons.forEach(btn => btn.disabled = false);
                  }
                })
                .withFailureHandler(function(error) {
                  console.error('Errore nella chiamata server: ' + error.message);
                  alert('Errore: ' + error.message);
                  buttons.forEach(btn => btn.disabled = false);
                })
                .processValidationChoice_(value);
            } catch (e) {
              console.error('Errore in selectCandidate: ' + e.message);
              alert('Errore: ' + e.message);
              const buttons = document.querySelectorAll('.candidate-button, .reject-button');
              buttons.forEach(btn => btn.disabled = false);
            }
          }
          
          function rejectSuggestion() {
            // Disabilita i pulsanti
            const buttons = document.querySelectorAll('.candidate-button, .reject-button');
            buttons.forEach(btn => btn.disabled = true);
            
            // Chiama la funzione server con null (rifiutato)
            google.script.run
              .withSuccessHandler(function(hasMoreErrors) {
                // Lo stato è stato aggiornato
                if (hasMoreErrors) {
                  // Se ci sono altri errori, aggiorna il contenuto del dialog corrente
                  updateDialogContent();
                } else {
                  // Non ci sono altri errori, chiudi questo dialog
                  google.script.host.close();
                }
              })
              .withFailureHandler(function(error) {
                alert('Errore: ' + error.message);
                buttons.forEach(btn => btn.disabled = false);
              })
              .processValidationChoice_(null);
          }
          
          function updateDialogContent() {
            try {
              // Ottieni i dati del prossimo errore dal server
              google.script.run
                .withSuccessHandler(function(nextErrorData) {
                  try {
                    if (!nextErrorData) {
                      console.error('Nessun dato ricevuto dal server');
                      google.script.host.close();
                      return;
                    }
                    
                    if (nextErrorData.done) {
                      // Finito, chiudi il dialog
                      google.script.host.close();
                      return;
                    }
                    
                    // Se il prossimo errore è boolean o date, chiudi questo dialog
                    // e lascia che showNextErrorDialog_() gestisca il prompt standard
                    if (nextErrorData.validationType === 'boolean' || nextErrorData.validationType === 'date') {
                      google.script.host.close();
                      // Chiama showNextErrorDialog_() per gestire il prompt standard
                      google.script.run
                        .withSuccessHandler(function() {
                          // Prompt gestito
                        })
                        .withFailureHandler(function(error) {
                          console.error('Errore: ' + error.message);
                        })
                        .showNextErrorDialog_();
                      return;
                    }
                    
                    // Aggiorna il contenuto del dialog con il prossimo errore (solo per suggerimenti lista)
                    const h2 = document.querySelector('h2');
                    const errorInfo = document.querySelector('.error-info');
                    const candidatesLabel = document.querySelector('.candidates-label');
                    const buttonsContainer = document.querySelector('body');
                    
                    if (!h2 || !errorInfo || !candidatesLabel || !buttonsContainer) {
                      console.error('Elementi DOM non trovati');
                      google.script.host.close();
                      return;
                    }
                    
                    // Aggiorna il titolo
                    h2.textContent = 'Errore ' + nextErrorData.errorNum + '/' + nextErrorData.totalErrors;
                    
                    // Aggiorna le informazioni dell'errore
                    errorInfo.innerHTML = '<strong>📍 Cella ' + nextErrorData.colLetter + nextErrorData.row + '</strong><br>Valore errato: "' + nextErrorData.errorValue + '"';
                    
                    // Rimuovi i vecchi pulsanti
                    const oldButtons = document.querySelectorAll('.candidate-button, .reject-button');
                    oldButtons.forEach(btn => btn.remove());
                    
                    // Rimuovi anche il contenitore dei pulsanti candidati se esiste
                    const oldContainer = document.getElementById('candidate-buttons-container');
                    if (oldContainer) {
                      oldContainer.remove();
                    }
                    
                    // Crea i nuovi pulsanti per i candidati
                    if (nextErrorData.candidates && nextErrorData.candidates.length > 0) {
                      candidatesLabel.textContent = 'Trovati ' + nextErrorData.candidates.length + ' valori simili:';
                      candidatesLabel.style.display = 'block';
                      
                      // Crea un contenitore per i pulsanti candidati
                      const candidateButtonsContainer = document.createElement('div');
                      candidateButtonsContainer.id = 'candidate-buttons-container';
                      buttonsContainer.insertBefore(candidateButtonsContainer, candidatesLabel.nextSibling);
                      
                      nextErrorData.candidates.forEach(function(candidate) {
                        const scoreText = candidate.score !== null ? ' (' + Math.round(candidate.score * 100) + '%)' : '';
                        const button = document.createElement('button');
                        button.className = 'candidate-button';
                        button.textContent = '"' + candidate.value + '"' + scoreText;
                        // Escape HTML per il valore nel data attribute
                        const escapedValue = String(candidate.value)
                          .replace(/&/g, '&amp;')
                          .replace(/"/g, '&quot;')
                          .replace(/'/g, '&#39;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;');
                        button.setAttribute('data-value', escapedValue);
                        // Usa addEventListener con il valore dal data attribute
                        button.addEventListener('click', function() {
                          const encodedValue = button.getAttribute('data-value');
                          const value = decodeHtmlEntities(encodedValue);
                          selectCandidate(value);
                        });
                        candidateButtonsContainer.appendChild(button);
                      });
                      
                      // Aggiungi il pulsante "Rifiuta suggerimenti"
                      const rejectButton = document.createElement('button');
                      rejectButton.className = 'reject-button';
                      rejectButton.textContent = 'Rifiuta suggerimenti';
                      rejectButton.addEventListener('click', rejectSuggestion);
                      buttonsContainer.appendChild(rejectButton);
                    } else {
                      candidatesLabel.style.display = 'none';
                    }
                  } catch (e) {
                    console.error('Errore nell\'aggiornamento del contenuto: ' + e.message);
                    alert('Errore nell\'aggiornamento: ' + e.message);
                    google.script.host.close();
                  }
                })
                .withFailureHandler(function(error) {
                  console.error('Errore nell\'aggiornamento del dialog: ' + error.message);
                  alert('Errore: ' + error.message);
                  google.script.host.close();
                })
                .updateDialogWithNextError_();
            } catch (e) {
              console.error('Errore in updateDialogContent: ' + e.message);
              alert('Errore: ' + e.message);
              google.script.host.close();
            }
          }
        </script>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(Math.min(600, 300 + (candidates.length * 60)));
  
  ui.showModalDialog(html, 'Errore ' + errorNum + '/' + totalErrors + ' - Selezione valore');
  // NOTA: showModalDialog NON blocca - il callback chiamerà processValidationChoice_
}

/**
 * Rivalida una singola cella dopo la correzione
 */
function revalidateCell_(cell, validation, validationLists) {
  const cellValue = cell.getValue();
  
  // Se la cella è vuota, considerala valida (non segnaliamo celle vuote)
  if (cellValue === '' || cellValue === null || cellValue === undefined) {
    return true;
  }
  
  if (validation.type === 'list') {
    // Valida contro la lista
    const cellValueStr = String(cellValue).trim();
    
    // Validazione case-sensitive per colonne specifiche
    const isCaseSensitive = validation.name === 'Tipo Beneficiario' || 
                             validation.name === 'Tipologia Prestazione' ||
                             validation.name === 'Provincia' ||
                             validation.name === 'Regione' ||
                             validation.name === 'Comune';
    
    if (isCaseSensitive) {
      // Validazione case-sensitive: confronto esatto
      return validation.list.some(item => 
        String(item).trim() === cellValueStr
      );
    } else {
      // Validazione case-insensitive per altre colonne
      return validation.list.some(item => 
        String(item).trim().toLowerCase() === cellValueStr.toLowerCase()
      );
    }
  } else if (validation.type === 'date') {
    // Valida formato data
    return isValidDate_(cellValue);
  } else if (validation.type === 'boolean') {
    // Valida boolean (TRUE/FALSE)
    const normalizedValue = String(cellValue).trim().toUpperCase();
    return normalizedValue === 'TRUE' || normalizedValue === 'FALSE';
  }
  
  return false;
}

/**
 * Carica tutte le liste di validazione dallo sheet "Validazione Dati"
 */
function loadValidationLists_(validazioneSheet) {
  const lastRow = validazioneSheet.getLastRow();
  
  // Carica le liste dalle colonne dello sheet Validazione Dati
  // A: Comune, B: Provincia, C: Regione, D: Tipo Visita, E: Beneficiario,
  // F: Centro Medico, G: Ente No Profit, H: No Profit Category, I: Boolean, J: Partner
  
  const lists = {
    comuni: [],
    province: [],
    regioni: [],
    tipoVisita: [],
    beneficiario: [],
    medicalCenters: [],
    entiNoProfit: [],
    categorieEnti: [],
    booleanValues: [],
    partners: []
  };
  
  if (lastRow >= 2) {
    // Comuni (colonna A)
    const comuniRange = validazioneSheet.getRange(2, 1, lastRow - 1, 1);
    lists.comuni = comuniRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Province (colonna B)
    const provinceRange = validazioneSheet.getRange(2, 2, lastRow - 1, 1);
    lists.province = provinceRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Regioni (colonna C)
    const regioniRange = validazioneSheet.getRange(2, 3, lastRow - 1, 1);
    lists.regioni = regioniRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Tipo Visita (colonna D)
    const tipoVisitaRange = validazioneSheet.getRange(2, 4, lastRow - 1, 1);
    lists.tipoVisita = tipoVisitaRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Beneficiario (colonna E)
    const beneficiarioRange = validazioneSheet.getRange(2, 5, lastRow - 1, 1);
    lists.beneficiario = beneficiarioRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Centro Medico (colonna F)
    const medicalCentersRange = validazioneSheet.getRange(2, 6, lastRow - 1, 1);
    lists.medicalCenters = medicalCentersRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Ente No Profit (colonna G)
    const entiRange = validazioneSheet.getRange(2, 7, lastRow - 1, 1);
    lists.entiNoProfit = entiRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Categorie Enti (colonna H)
    const categorieRange = validazioneSheet.getRange(2, 8, lastRow - 1, 1);
    lists.categorieEnti = categorieRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
    
    // Boolean (colonna I)
    const booleanRange = validazioneSheet.getRange(2, 9, lastRow - 1, 1);
    lists.booleanValues = booleanRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim().toUpperCase());
    
    // Partner (colonna J)
    const partnersRange = validazioneSheet.getRange(2, 10, lastRow - 1, 1);
    lists.partners = partnersRange.getValues()
      .flat()
      .filter(v => v !== '' && v !== null && v !== undefined)
      .map(v => String(v).trim());
  }
  
  return lists;
}

/**
 * Verifica se un valore è una data valida
 */
function isValidDate_(value) {
  if (!value) return false;
  
  // Se è già un oggetto Date
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }
  
  // Se è un numero (timestamp)
  if (typeof value === 'number') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  
  // Se è una stringa, prova a parsarla
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    
    // Prova a parsare come data
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return true;
    }
    
    // Prova formati comuni italiani (GG/MM/AAAA, GG-MM-AAAA)
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      /^\d{1,2}-\d{1,2}-\d{4}$/,
      /^\d{4}-\d{1,2}-\d{1,2}$/,
      /^\d{1,2}\.\d{1,2}\.\d{4}$/
    ];
    
    return datePatterns.some(pattern => pattern.test(trimmed));
  }
  
  return false;
}

/**
 * Trova i valori più simili nella lista usando un algoritmo generale di matching
 * Restituisce un array di candidati ordinati per score decrescente
 */
function findBestMatches_(originalValue, normalizedValue, list, columnName) {
  if (!list || list.length === 0) return [];
  
  // Determina se questa colonna richiede criteri più restrittivi
  const isStrict = columnName === 'Comune' || columnName === 'Provincia';
  
  const candidates = [];
  
  // Calcola uno score composito per ogni valore nella lista
  for (let i = 0; i < list.length; i++) {
    const listItem = String(list[i]).trim();
    const normalizedListItem = listItem.toLowerCase();
    
    let score = 0;
    let matchType = '';
    
    // Controllo 1: corrispondenza esatta (case-insensitive) - score massimo
    if (normalizedValue === normalizedListItem) {
      return [{ value: list[i], score: 1.0, type: 'esatto' }]; // Restituisci immediatamente
    }
    
    // Controllo 2: corrispondenza all'inizio - score alto
    if (normalizedListItem.startsWith(normalizedValue)) {
      const lengthRatio = normalizedValue.length / normalizedListItem.length;
      score = Math.max(score, lengthRatio * 0.9); // Score fino a 0.9
      matchType = 'inizio';
    }
    
    // Controllo 3: valore inserito inizia con valore lista
    if (normalizedValue.startsWith(normalizedListItem)) {
      const lengthRatio = normalizedListItem.length / normalizedValue.length;
      score = Math.max(score, lengthRatio * 0.8); // Score fino a 0.8
      matchType = matchType || 'inizio-inverso';
    }
    
    // Controllo 4: estrai nome principale (prima di parentesi, spazi, trattini)
    // Utile per valori come "Roma (RM)" dove "Roma" è il nome principale
    const mainNameMatch = listItem.match(/^([^(]+)/);
    if (mainNameMatch) {
      const mainName = mainNameMatch[1].trim().toLowerCase();
      if (normalizedValue === mainName) {
        score = Math.max(score, 0.95); // Score molto alto per match nome principale
        matchType = 'nome-principale';
      } else if (mainName.startsWith(normalizedValue)) {
        const lengthRatio = normalizedValue.length / mainName.length;
        score = Math.max(score, lengthRatio * 0.85);
        matchType = matchType || 'nome-principale-inizio';
      }
    }
    
    // Controllo 5: abbreviazioni tra parentesi
    const parenthesesMatch = listItem.match(/\(([^)]+)\)/);
    if (parenthesesMatch) {
      const abbreviation = parenthesesMatch[1].toLowerCase().trim();
      if (normalizedValue === abbreviation) {
        score = Math.max(score, 0.9); // Score alto per abbreviazione esatta
        matchType = 'abbreviazione';
      } else if (abbreviation.includes(normalizedValue) && normalizedValue.length >= 2) {
        const lengthRatio = normalizedValue.length / abbreviation.length;
        score = Math.max(score, lengthRatio * 0.7);
        matchType = matchType || 'abbreviazione-parziale';
      }
    }
    
    // Controllo 6: valore inserito contenuto nel valore lista
    if (normalizedListItem.includes(normalizedValue)) {
      const lengthRatio = normalizedValue.length / normalizedListItem.length;
      // Bonus se inizia con lo stesso testo
      const startBonus = normalizedListItem.startsWith(normalizedValue) ? 0.2 : 0;
      score = Math.max(score, (lengthRatio * 0.6) + startBonus);
      matchType = matchType || 'contenuto';
    }
    
    // Controllo 7: valore lista contenuto nel valore inserito
    if (normalizedValue.includes(normalizedListItem)) {
      const lengthRatio = normalizedListItem.length / normalizedValue.length;
      score = Math.max(score, lengthRatio * 0.7);
      matchType = matchType || 'contenuto-inverso';
    }
    
    // Controllo 8: parole comuni (per valori con più parole)
    const valueWords = normalizedValue.split(/\s+/).filter(w => w.length > 2);
    const listWords = normalizedListItem.split(/\s+/).filter(w => w.length > 2 && !w.match(/^[\(]/));
    
    if (valueWords.length > 1 && listWords.length > 0) {
      const commonWords = valueWords.filter(w => 
        listWords.some(lw => lw.includes(w) || w.includes(lw))
      );
      const wordScore = commonWords.length / Math.max(valueWords.length, listWords.length);
      
      if (wordScore > 0.5) {
        // Combina con score di lunghezza
        const lengthScore = Math.min(normalizedValue.length, normalizedListItem.length) / 
                           Math.max(normalizedValue.length, normalizedListItem.length);
        const combinedScore = (wordScore * 0.6) + (lengthScore * 0.4);
        score = Math.max(score, combinedScore);
        matchType = matchType || 'parole-comuni';
      }
    }
    
    // Controllo 9: distanza di Levenshtein
    const distance = levenshteinDistance_(normalizedValue, normalizedListItem);
    const maxLength = Math.max(normalizedValue.length, normalizedListItem.length);
    
    if (maxLength > 0) {
      const similarity = 1 - (distance / maxLength);
      // Per valori corti o quando non abbiamo altri match buoni, usa Levenshtein più aggressivamente
      // Es: "genazzo" -> "Genazzano" ha distanza 2, similarity ~0.78
      // Usa Levenshtein sempre, ma con peso diverso in base alla situazione
      if (score < 0.7) {
        // Peso maggiore per valori corti o quando la similarità è alta
        let levenshteinWeight = 0.5;
        if (normalizedValue.length <= 8) {
          levenshteinWeight = 0.7; // Peso maggiore per valori fino a 8 caratteri
        }
        if (similarity > 0.7) {
          levenshteinWeight = Math.max(levenshteinWeight, 0.8); // Peso ancora maggiore se molto simile
        }
        score = Math.max(score, similarity * levenshteinWeight);
        matchType = matchType || 'levenshtein';
      }
    }
    
    // Aggiungi il candidato se ha uno score sopra la soglia minima
    // Per colonne strict, abbassa leggermente la soglia per valori corti che potrebbero essere abbreviazioni o errori di battitura
    let threshold = isStrict ? 0.4 : (normalizedValue.length <= 3 ? 0.15 : 0.25);
    if (isStrict && normalizedValue.length <= 8 && score >= 0.35) {
      // Per valori corti in colonne strict, accetta anche con score leggermente più basso
      // se abbiamo un buon match Levenshtein
      threshold = 0.35;
    }
    if (score >= threshold) {
      candidates.push({
        value: list[i],
        score: score,
        type: matchType || 'generale'
      });
      // Log rimosso per migliorare performance
    }
  }
  
  // Ordina per score decrescente
  candidates.sort((a, b) => b.score - a.score);
  
  // Deduplica i candidati: rimuovi valori duplicati (case-insensitive)
  const uniqueCandidates = [];
  const seenValues = new Set();
  
  for (const candidate of candidates) {
    const candidateValue = String(candidate.value).trim().toLowerCase();
    if (!seenValues.has(candidateValue)) {
      seenValues.add(candidateValue);
      uniqueCandidates.push(candidate);
    } else {
      // Se è un duplicato, mantieni quello con score più alto
      const existingIndex = uniqueCandidates.findIndex(c => 
        String(c.value).trim().toLowerCase() === candidateValue
      );
      if (existingIndex >= 0 && candidate.score > uniqueCandidates[existingIndex].score) {
        uniqueCandidates[existingIndex] = candidate;
      }
    }
  }
  
  // Restituisci i migliori candidati unici (massimo 5 per non sovraccaricare l'utente)
  const maxCandidates = 5;
  const bestCandidates = uniqueCandidates.slice(0, maxCandidates);
  
  return bestCandidates; // Restituisci sempre l'array (può essere vuoto)
}

/**
 * Trova il valore più simile nella lista (compatibilità con codice esistente)
 * Restituisce solo il miglior candidato come stringa
 */
function findBestMatch_(originalValue, normalizedValue, list, columnName) {
  const candidates = findBestMatches_(originalValue, normalizedValue, list, columnName);
  if (candidates.length > 0) {
    return candidates[0].value;
  }
  return null;
}

/**
 * Calcola la distanza di Levenshtein tra due stringhe
 */
function levenshteinDistance_(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Crea una matrice per memorizzare le distanze
  const matrix = [];
  
  // Inizializza la prima riga e colonna
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Calcola la distanza
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sostituzione
          matrix[i][j - 1] + 1,     // inserimento
          matrix[i - 1][j] + 1      // cancellazione
        );
      }
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Converte un numero di colonna in lettera (1 -> A, 2 -> B, ecc.)
 */
function columnNumberToLetter_(columnNumber) {
  let letter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return letter;
}

function doGet(e) {
  // Questo serve quando la web app viene chiamata su /exec o /usercallback
  return authCallback(e);
}
