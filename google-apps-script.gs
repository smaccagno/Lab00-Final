/**
 * =====================================================
 * FUNZIONI PRINCIPALI
 * =====================================================
 * 
 * Le costanti di configurazione sono nel file configuration.gs
 * Modifica quel file per cambiare ambiente (DEV/PROD), credenziali, etc.
 */

// ============================================================
// SISTEMA DI TOKEN CENTRALIZZATO
// ============================================================
// I token vengono salvati nel MASTER e possono essere recuperati
// dalle copie tramite chiamata HTTP. Questo permette di avere
// UN SOLO deployment che gestisce tutti gli utenti.
// ============================================================

/**
 * Ottiene l'URL di callback per OAuth.
 * Usa WEB_APP_CALLBACK se definito (deployment "Utente che accede"), altrimenti WEB_APP_EXEC.
 * L'URL in configuration.gs deve già essere nel formato corretto:
 *   - Google Workspace: https://script.google.com/a/macros/{domain}/s/{ID}/exec
 *   - Gmail personale:  https://script.google.com/macros/s/{ID}/exec
 */
function getRedirectFromExec_() {
  const base = (typeof WEB_APP_CALLBACK !== 'undefined' && WEB_APP_CALLBACK) ? WEB_APP_CALLBACK : WEB_APP_EXEC;
  return base.replace(/\/(exec|dev)$/, '/usercallback');
}

/**
 * Ottiene l'email dell'utente corrente
 * Fallback a getEffectiveUser() se getActiveUser() è vuoto (alcuni domini/copie)
 */
function getCurrentUserEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (e) {}
  try {
    return Session.getEffectiveUser().getEmail() || '';
  } catch (e) {}
  return '';
}

/**
 * Genera la chiave per salvare il token di un utente
 */
function getTokenKey_(email) {
  return 'token_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Salva il token nel sistema centralizzato (ScriptProperties)
 * Indicizzato per email utente
 */
function saveTokenCentralized_(email, tokenData) {
  const key = getTokenKey_(email);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, JSON.stringify(tokenData));
  Logger.log('Token salvato centralmente per: ' + email + ' (chiave: ' + key + ')');
}

/**
 * Recupera il token dal sistema centralizzato
 */
function getTokenCentralized_(email) {
  const key = getTokenKey_(email);
  const props = PropertiesService.getScriptProperties();
  const tokenJson = props.getProperty(key);
  if (tokenJson) {
    return JSON.parse(tokenJson);
  }
  return null;
}

/**
 * Aggiorna il token nel sistema centralizzato
 */
function updateTokenCentralized_(email, tokenData) {
  saveTokenCentralized_(email, tokenData);
}

/**
 * ESEGUI QUESTA FUNZIONE PER VERIFICARE CHE HAI IL CODICE CORRETTO
 * Deve stampare "VERSIONE: MANUALE (senza libreria OAuth2)"
 */
function verificaVersione() {
  Logger.log("===========================================");
  Logger.log("VERSIONE: MANUALE (senza libreria OAuth2)");
  Logger.log("Se vedi questo messaggio, hai il codice corretto.");
  Logger.log("===========================================");
  Logger.log("authCallback è alla riga 35 circa");
  Logger.log("NON usa service.handleCallback()");
  Logger.log("===========================================");
}

/**
 * ESEGUI QUESTA FUNZIONE PER FORZARE L'AUTORIZZAZIONE DI TUTTI I SERVIZI
 * Questo richiederà i permessi per tutti i servizi usati dallo script
 */
function forzaAutorizzazione() {
  // Questi accessi forzano la richiesta di autorizzazione
  Logger.log("=== FORZATURA AUTORIZZAZIONE ===");
  
  // SpreadsheetApp
  Logger.log("SpreadsheetApp: " + SpreadsheetApp.getActive().getName());
  
  // PropertiesService
  Logger.log("UserProperties: OK");
  PropertiesService.getUserProperties().getProperty('test');
  
  Logger.log("ScriptProperties: OK");
  PropertiesService.getScriptProperties().getProperty('test');
  
  // Session
  Logger.log("Email: " + Session.getActiveUser().getEmail());
  
  // UrlFetchApp (questo è quello che probabilmente manca)
  Logger.log("UrlFetchApp: testing...");
  try {
    UrlFetchApp.fetch('https://www.google.com', {muteHttpExceptions: true});
    Logger.log("UrlFetchApp: OK");
  } catch (e) {
    Logger.log("UrlFetchApp error: " + e.message);
  }
  
  // HtmlService
  Logger.log("HtmlService: OK");
  HtmlService.createHtmlOutput('<p>test</p>');
  
  Logger.log("=== AUTORIZZAZIONE COMPLETATA ===");
}


// ============================================================
// OAUTH2 COMPLETAMENTE MANUALE - NON USA LA LIBRERIA OAUTH2
// ============================================================

/**
 * Callback OAuth2 - gestisce il ritorno da Salesforce
 * Gestione COMPLETAMENTE MANUALE dello scambio codice/token
 */
function authCallback(request) {
  Logger.log('=== authCallback chiamato ===');
  const params = request.parameter || {};
  const queryString = request.queryString || '(non disponibile)';
  Logger.log('queryString: %s', queryString);
  Logger.log('parameter: %s', JSON.stringify(params, null, 2));
  
  const code = params.code;
  const errorParam = params.error;
  
  // Gestisci errori da Salesforce
  if (errorParam) {
    Logger.log('Errore da Salesforce: %s', errorParam);
    const callbackUrl = getRedirectFromExec_();
    let extra = '';
    if ((errorParam || '').indexOf('redirect_uri') >= 0) {
      extra = '<p style="margin-top:16px;background:#fff3cd;padding:12px;border-radius:4px;">' +
        '<strong>Configura in Salesforce questo URL esatto:</strong><br>' +
        '<code style="word-break:break-all;font-size:12px;">' + callbackUrl + '</code><br>' +
        'Setup → App Manager → External Client App → Edit → Callback URL.<br>' +
        'Salva e attendi 2-10 minuti.</p>';
    }
    let errDesc = params.error_description || errorParam;
    try {
      if (errDesc) errDesc = decodeURIComponent(String(errDesc).replace(/\+/g, ' '));
    } catch (e) {}
    return HtmlService.createHtmlOutput(
      '<h2 style="color: red;">Errore</h2><p>' + (errDesc || errorParam) + '</p>' + extra
    );
  }
  
  if (!code) {
    Logger.log('Nessun codice ricevuto. queryString: ' + queryString);
    const paramsStr = Object.keys(params).length ? JSON.stringify(params) : 'nessuno. queryString=' + queryString;
    return HtmlService.createHtmlOutput(
      '<h2 style="color: red;">Errore</h2>' +
      '<p>Nessun codice di autorizzazione ricevuto.</p>' +
      '<p style="font-size:12px;color:#666;">Parametri ricevuti: ' + paramsStr + '</p>' +
      '<p style="font-size:12px;margin-top:20px;">Possibili cause:<br>' +
      '• Hai aperto questo URL direttamente? Devi completare il flusso da "Autorizza" nel foglio.<br>' +
      '• redirect_uri_mismatch: verifica che il Callback URL in Salesforce corrisponda esattamente.</p>'
    );
  }
  
  // Scambio codice/token direttamente server-side (evita google.script.run che
  // richiede un'autorizzazione Google separata e blocca gli utenti esterni)
  try {
    const userEmail = exchangeCodeAndSaveToken(code);
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;padding:40px;text-align:center;}' +
      '.ok{color:green;}' +
      '</style></head><body>' +
      '<div class="ok"><h2>Autorizzato &#10004;</h2>' +
      '<p>Completato per: ' + userEmail + '</p>' +
      '<p>Chiudi questa scheda e torna al foglio.</p></div>' +
      '</body></html>'
    );
  } catch (err) {
    Logger.log('Errore exchange token: ' + err.message);
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;padding:40px;text-align:center;}' +
      '.err{color:red;}' +
      '</style></head><body>' +
      '<div class="err"><h2>Errore</h2>' +
      '<p>' + err.message + '</p>' +
      '<p>Chiudi questa scheda e riprova dal foglio.</p></div>' +
      '</body></html>'
    );
  }
}

/**
 * Scambia il codice OAuth con il token e salva nel sistema centralizzato.
 * Chiamata direttamente da authCallback() (server-side).
 * Recupera l'email dell'utente da Session o dal profilo Salesforce come fallback.
 */
function exchangeCodeAndSaveToken(code) {
  if (!code) throw new Error('Codice mancante');
  
  const tokenUrl = `${SF_LOGIN}/services/oauth2/token`;
  const redirectUri = getRedirectFromExec_();
  const payload = 
    'grant_type=authorization_code' +
    '&client_id=' + encodeURIComponent(CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(CLIENT_SECRET) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&code=' + encodeURIComponent(code);
  
  const response = UrlFetchApp.fetch(tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });
  
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    throw new Error('Salesforce: ' + responseCode + ' - ' + responseText);
  }
  
  const tokenData = JSON.parse(responseText);
  if (!tokenData.access_token) throw new Error('Token non ricevuto');
  
  // Prova a ottenere l'email: Session > Salesforce identity > fallback
  let userEmail = getCurrentUserEmail_();
  
  if (!userEmail && tokenData.id) {
    try {
      const idResp = UrlFetchApp.fetch(tokenData.id, {
        headers: { Authorization: 'Bearer ' + tokenData.access_token },
        muteHttpExceptions: true
      });
      if (idResp.getResponseCode() === 200) {
        const idData = JSON.parse(idResp.getContentText());
        userEmail = idData.email || idData.username || '';
      }
    } catch (e) {
      Logger.log('Impossibile ottenere email da Salesforce identity: ' + e.message);
    }
  }
  
  if (!userEmail) userEmail = 'default_user';
  
  saveTokenCentralized_(userEmail, tokenData);
  Logger.log('Token salvato per: ' + userEmail);
  return userEmail;
}

/**
 * Ottiene l'access token dal token salvato, rinfrescandolo se necessario
 */
function getAccessToken_() {
  const properties = PropertiesService.getUserProperties();
  const tokenJson = properties.getProperty('oauth2.Salesforce');
  
  if (!tokenJson) {
    throw new Error('Non autorizzato. Esegui authorize().');
  }
  
  const token = JSON.parse(tokenJson);
  
  if (!token.access_token) {
    throw new Error('Token non valido. Esegui nukeAuth() e poi authorize().');
  }
  
  // Per semplicità, non controlliamo la scadenza qui
  // Salesforce restituirà 401 se il token è scaduto e queryAll_ gestirà il refresh
  return token.access_token;
}

/**
 * Ottiene il token completo salvato
 */
function getStoredToken_() {
  // 1. Prova prima le UserProperties locali (più veloce)
  try {
    const properties = PropertiesService.getUserProperties();
    const localTokenJson = properties.getProperty('oauth2.Salesforce');
    
    if (localTokenJson) {
      return JSON.parse(localTokenJson);
    }
  } catch (e) {
    Logger.log('Errore accesso UserProperties: ' + e.message);
  }
  
  // 2. Prova il sistema centralizzato (ScriptProperties - stessa istanza script)
  try {
    const userEmail = getCurrentUserEmail_();
    if (userEmail) {
      const centralToken = getTokenCentralized_(userEmail);
      if (centralToken) {
        try {
          PropertiesService.getUserProperties().setProperty('oauth2.Salesforce', JSON.stringify(centralToken));
        } catch (e) { /* ignora */ }
        Logger.log('Token recuperato dal sistema centralizzato per: ' + userEmail);
        return centralToken;
      }
      
      // 3. Copie: recupera dal master via HTTP (token salvato sul master)
      const masterToken = fetchTokenFromMaster_(userEmail);
      if (masterToken) {
        try {
          PropertiesService.getUserProperties().setProperty('oauth2.Salesforce', JSON.stringify(masterToken));
        } catch (e) { /* ignora */ }
        Logger.log('Token recuperato dal master per: ' + userEmail);
        return masterToken;
      }
    }
  } catch (e) {
    Logger.log('Errore recupero token: ' + e.message);
  }
  
  return null;
}

/**
 * Prova a sincronizzare il token dal master (chiamata esplicita)
 * Usato quando il token locale non esiste
 */
function syncTokenFromMaster_() {
  try {
    const userEmail = getCurrentUserEmail_();
    if (!userEmail) return false;
    
    const masterToken = fetchTokenFromMaster_(userEmail);
    if (masterToken) {
      // Salva localmente
      PropertiesService.getUserProperties().setProperty('oauth2.Salesforce', JSON.stringify(masterToken));
      Logger.log('Token sincronizzato dal master per: ' + userEmail);
      return true;
    }
  } catch (e) {
    Logger.log('Impossibile sincronizzare token dal master: ' + e.message);
  }
  return false;
}

/**
 * Recupera il token dal master via HTTP
 * Usato dalle copie per ottenere il token salvato nel master
 */
function fetchTokenFromMaster_(email) {
  const url = WEB_APP_EXEC + '?action=getToken&email=' + encodeURIComponent(email) +
    (typeof AUTH_SHARED_SECRET !== 'undefined' ? '&secret=' + encodeURIComponent(AUTH_SHARED_SECRET) : '');
  
  const opts = { method: 'get', muteHttpExceptions: true, followRedirects: true };
  
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, opts);
      if (response.getResponseCode() === 200) {
        const result = JSON.parse(response.getContentText());
        if (result.success && result.token) return result.token;
      }
    } catch (e) {
      const msg = (e.message || '').toString();
      if (msg.indexOf('Address unavailable') >= 0 && WEB_APP_EXEC.indexOf('/dev') >= 0) {
        Logger.log('ATTENZIONE: WEB_APP_EXEC usa /dev - le copie non possono raggiungerlo. Usa deployment pubblicato (/exec).');
      }
      Logger.log('Errore fetch token dal master (tentativo ' + attempt + '): ' + msg);
      if (attempt < 2) Utilities.sleep(1000);  // retry dopo 1s
    }
  }
  return null;
}

/**
 * Verifica se abbiamo un token valido
 */
function hasValidToken_() {
  const token = getStoredToken_();
  return token && token.access_token && token.refresh_token;
}

/**
 * Rinfresca manualmente l'access token
 */
function refreshAccessToken_() {
  const token = getStoredToken_();
  
  if (!token || !token.refresh_token) {
    throw new Error('Nessun refresh token. Esegui nukeAuth() e poi authorize().');
  }
  
  const tokenUrl = `${SF_LOGIN}/services/oauth2/token`;
  
  const payload = 
    'grant_type=refresh_token' +
    '&client_id=' + encodeURIComponent(CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(CLIENT_SECRET) +
    '&refresh_token=' + encodeURIComponent(token.refresh_token);
  
  const response = UrlFetchApp.fetch(tokenUrl, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });
  
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    throw new Error('Refresh fallito: ' + responseText);
  }
  
  const newTokenData = JSON.parse(responseText);
  
  // Aggiorna il token mantenendo il refresh_token originale
  const updatedToken = {
    access_token: newTokenData.access_token,
    refresh_token: token.refresh_token,
    token_type: newTokenData.token_type || 'Bearer',
    instance_url: newTokenData.instance_url || token.instance_url,
    id: newTokenData.id || token.id,
    issued_at: newTokenData.issued_at || new Date().getTime().toString()
  };
  
  // Salva localmente
  const properties = PropertiesService.getUserProperties();
  properties.setProperty('oauth2.Salesforce', JSON.stringify(updatedToken));
  
  // Salva anche nel sistema centralizzato
  const userEmail = getCurrentUserEmail_();
  if (userEmail) {
    try {
      saveTokenCentralized_(userEmail, updatedToken);
    } catch (e) {
      Logger.log('Impossibile aggiornare token centralizzato: ' + e.message);
    }
  }
  
  Logger.log('Token rinfrescato con successo');
  return updatedToken.access_token;
}

/**
 * Verifica l'autorizzazione e apre automaticamente il dialog se non autorizzato
 * Restituisce true se autorizzato, false altrimenti
 */
function checkAuthOrPrompt_() {
  // hasValidToken_ -> getStoredToken_ prova anche fetch dal master per le copie
  if (hasValidToken_()) {
    return true;
  }
  
  // Prova esplicita sync dal master (per le copie)
  try {
    if (syncTokenFromMaster_()) {
      if (hasValidToken_()) return true;
    }
  } catch (e) {
    Logger.log('Errore sync token: ' + e.message);
  }
  
  // Ultimo tentativo: getStoredToken_ potrebbe aver popolato il token nel frattempo
  if (hasValidToken_()) return true;
  
  // Non autorizzato: mostra dialog (evita loop chiamando authorize() una volta sola)
  authorize();
  return false;
}

/**
 * Esegui questa funzione per autorizzare
 */
function authorize() {
  const ui = SpreadsheetApp.getUi();
  
  if (hasValidToken_()) {
    ui.alert('Già autorizzato', 'Sei già autorizzato ✅\n\nSe vuoi riautorizzare, esegui prima "Reset Autorizzazione" dal menu.', ui.ButtonSet.OK);
    return;
  }
  
  // Tutti (master e copie) passano dal master per l'autorizzazione
  // Così il master può associare lo state random all'email utente
  const userEmail = getCurrentUserEmail_() || '';
  const startAuthUrl = WEB_APP_EXEC + '?action=startAuth&email=' + encodeURIComponent(userEmail);
  
  // Mostra un dialog con link al master (startAuth) - lì verrà generato lo state e si andrà a Salesforce
  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h3 { color: #333; }
          .btn {
            background: #1a73e8;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            display: inline-block;
            margin-top: 10px;
          }
          .btn:hover { background: #1557b0; }
        </style>
      </head>
      <body>
        <h3>🔐 Autorizzazione Salesforce</h3>
        <p>Clicca il pulsante per autorizzare l'accesso a Salesforce con il tuo account:</p>
        <a href="${startAuthUrl}" target="_blank" class="btn">Apri per Autorizzare</a>
        <p style="margin-top: 20px; color: #666; font-size: 12px;">
          Si aprirà una nuova scheda. Autorizza su Salesforce, poi chiudi e torna qui.
        </p>
      </body>
    </html>
  `;
  
  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(500)
    .setHeight(250);
  
  ui.showModalDialog(htmlOutput, 'Autorizzazione Salesforce');
  
  Logger.log('=== AUTORIZZAZIONE - startAuth URL ===');
  Logger.log('URL: %s', startAuthUrl);
}

/**
 * Reset completo dell'autorizzazione
 */
function nukeAuth() {
  // Cancella token locali
  PropertiesService.getUserProperties().deleteAllProperties();
  
  // Cancella anche dal sistema centralizzato
  const userEmail = getCurrentUserEmail_();
  if (userEmail) {
    try {
      const key = getTokenKey_(userEmail);
      PropertiesService.getScriptProperties().deleteProperty(key);
      Logger.log("Token centralizzato cancellato per: " + userEmail);
    } catch (e) {
      Logger.log("Impossibile cancellare token centralizzato: " + e.message);
    }
  }
  
  Logger.log("Reset OAuth completato.");
  Logger.log("Esegui authorize() per riautorizzare.");
}

/**
 * Debug del token
 */
function debugAccessToken() {
  Logger.log("=== DEBUG ACCESS TOKEN ===");
  Logger.log("hasValidToken: %s", hasValidToken_());
  
  const token = getStoredToken_();
  if (token) {
    Logger.log("Access token presente: %s", token.access_token ? "SI" : "NO");
    Logger.log("Refresh token presente: %s", token.refresh_token ? "SI" : "NO");
    Logger.log("Instance URL: %s", token.instance_url);
  } else {
    Logger.log("Nessun token salvato. Esegui authorize().");
  }
  
  Logger.log("=== FINE DEBUG ===");
}

function debugToken() {
  const t = getStoredToken_();
  Logger.log(JSON.stringify(t, null, 2));
}

/**
 * Mostra la configurazione OAuth2 corrente
 */
function showConfig() {
  Logger.log("=== CONFIGURAZIONE OAUTH2 ===");
  Logger.log("SF_DOMAIN (Authorization): %s", SF_DOMAIN);
  Logger.log("SF_LOGIN (Token URL): %s", SF_LOGIN);
  Logger.log("Token URL: %s/services/oauth2/token", SF_LOGIN);
  Logger.log("CLIENT_ID: %s", CLIENT_ID);
  Logger.log("CLIENT_SECRET presente: %s", CLIENT_SECRET ? "SI" : "NO");
  Logger.log("Redirect URI: %s", getRedirectFromExec_());
  Logger.log("hasValidToken: %s", hasValidToken_());
  Logger.log("=== FINE CONFIGURAZIONE ===");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Salesforce')
    .addItem('🔐 Autorizza', 'authorize')
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
    .addSeparator()
    .addItem('Invia Dati a InvoiceExcelEditor', 'sendDataToInvoiceExcelEditor')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🔧 Avanzate')
      .addItem('📋 URL Callback per Salesforce', 'showCallbackUrlDialog')
      .addItem('🔍 Diagnostica Completa', 'diagnosticaCompleta')
      .addItem('Reset Autorizzazione', 'nukeAuthWithConfirm')
      .addItem('Verifica Versione', 'verificaVersione'))
    .addToUi();
}

/**
 * Mostra il dialog con l'URL callback esatto da configurare in Salesforce
 */
function showCallbackUrlDialog() {
  const url = getRedirectFromExec_();
  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' +
    'body{font-family:Arial,sans-serif;padding:24px;}' +
    'h3{margin-top:0;}' +
    '.url{background:#f0f0f0;padding:12px;border-radius:4px;word-break:break-all;font-size:13px;margin:16px 0;border:1px solid #ccc;}' +
    '.warn{color:#c00;font-size:12px;margin-top:12px;}' +
    'ol{margin:8px 0;padding-left:20px;} li{margin:6px 0;}' +
    '</style></head><body>' +
    '<h3>📋 URL Callback per Salesforce</h3>' +
    '<p>Copia <b>esattamente</b> questo URL (nessuno spazio, nessun carattere in più):</p>' +
    '<div class="url">' + url + '</div>' +
    '<p><strong>In Salesforce:</strong></p>' +
    '<ol>' +
    '<li>Setup → App Manager → External Client App → Edit</li>' +
    '<li>Callback URL: incolla l\'URL sopra (sostituisci eventuali URL esistenti o aggiungi alla lista)</li>' +
    '<li>Salva</li>' +
    '<li>Attendi 2-10 minuti prima di riprovare l\'autorizzazione</li>' +
    '</ol>' +
    '<p class="warn">Se vedi redirect_uri_mismatch: verifica che l\'URL sia identico. Controlla http/https, presenza di / alla fine, dominio.</p>' +
    '</body></html>'
  ).setWidth(550).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Configurazione Callback Salesforce');
}

/**
 * Reset autorizzazione con conferma
 */
function nukeAuthWithConfirm() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Reset Autorizzazione',
    'Sei sicuro di voler resettare l\'autorizzazione Salesforce?\n\nDovrai riautorizzare per usare le funzioni.',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    nukeAuth();
    ui.alert('Reset completato', 'Autorizzazione resettata.\n\nClicca su "Autorizza" per riautorizzare.', ui.ButtonSet.OK);
  }
}

function syncAll() {
  // Check autorizzazione una volta sola per tutto il sync
  if (!checkAuthOrPrompt_()) return;
  
  // Chiama le funzioni con skipAuthCheck=true per evitare check multipli
  syncComuni(true);
  syncTipoVisita(true);
  syncBeneficiario(true);
  syncCentroMedico(true);
  syncEnteNoProfit(true);
  syncBoolean();  // Questa non richiede autorizzazione
  syncPartner(true);
}


function syncComuni(skipAuthCheck) {
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

  const soql = `
    SELECT Nome_Comune__c, Provincia__c, Regione__c
    FROM Comune__c
    WHERE Nome_Comune__c != null
    ORDER BY Nome_Comune__c ASC
  `.trim();

  const records = queryAll_(instanceUrl, accessToken, soql);

  const values = records.map(r => ([
    r.Nome_Comune__c ?? '',
    r.Provincia__c ?? '',
    r.Regione__c ?? ''
  ]));

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Crealo o verifica il nome.`);

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
  Logger.log(`✅ Sync Comuni completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (A:C)`);
}

function syncTipoVisita(skipAuthCheck) {
  const COL_D = 4; // colonna D
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

  const soql = `
    SELECT Tipo_Visita__c
    FROM Tipo_Visita__c
    WHERE Tipo_Visita__c != null
    ORDER BY Tipo_Visita__c ASC
  `.trim();

  // Corretto: passa service come primo parametro
  const records = queryAll_(instanceUrl, accessToken, soql);

  // Una colonna sola: D
  const values = records.map(r => [r.Tipo_Visita__c ?? '']);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Tipo_Visita completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (colonna D)`);
}

function syncBeneficiario(skipAuthCheck) {
  const COL_E = 5; // colonna E
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

  // Ottieni i valori distinti dalla picklist Visit__c.Beneficiary_Type__c
  // Recupera tutti i record e deduplica in Apps Script
  const soql = `
    SELECT Beneficiary_Type__c
    FROM Visit__c
    WHERE Beneficiary_Type__c != null
    ORDER BY Beneficiary_Type__c ASC
    LIMIT 10000
  `.trim();

  const records = queryAll_(instanceUrl, accessToken, soql);

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
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Beneficiario completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (colonna E)`);
}

function syncCentroMedico(skipAuthCheck) {
  const COL_F = 6; // colonna F
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

  // Ottieni valori distinti da Invoice__c.Medical_Center__c
  // Recupera tutti i record e deduplica in Apps Script
  const soql = `
    SELECT Medical_Center__c
    FROM Invoice__c
    WHERE Medical_Center__c != null
    ORDER BY Medical_Center__c ASC
    LIMIT 10000
  `.trim();

  const records = queryAll_(instanceUrl, accessToken, soql);

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
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Centro Medico completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (colonna F)`);
}

function syncEnteNoProfit(skipAuthCheck) {
  const COL_G = 7; // colonna G - Ente No Profit
  const COL_H = 8; // colonna H - No Profit Category
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

  const soql = `
    SELECT Name, Ente_Categoria__c
    FROM Ente_No_Profit__c
    WHERE Name != null
    ORDER BY Name ASC
  `.trim();

  const records = queryAll_(instanceUrl, accessToken, soql);

  const values = records.map(r => ([
    r.Name ?? '',
    r.Ente_Categoria__c ?? ''
  ]));

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Ente No Profit completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (G:H)`);
}

function syncBoolean() {
  const COL_I = 9; // colonna I
  // Questa funzione non richiede accesso a Salesforce, usa valori statici

  // Valori fissi per Boolean
  const values = [['TRUE'], ['FALSE']];

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Boolean completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (colonna I)`);
}

function syncPartner(skipAuthCheck) {
  const COL_J = 10; // colonna J
  if (!skipAuthCheck && !checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  const instanceUrl = token.instance_url;
  const accessToken = getAccessToken_();

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

  const records = queryAll_(instanceUrl, accessToken, soql);

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
  const sh = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  if (!sh) throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Verifica il nome.`);

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
  Logger.log(`✅ Sync Partner completato: ${values.length} righe scritte su "${SHEET_VALIDAZIONE_DATI}" (colonna J)`);
}

/**
 * Funzione helper per query paginate con gestione refresh token
 */
function queryAll_(instanceUrl, accessToken, soql) {
  let url = `${instanceUrl}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  let out = [];

  while (url) {
    let resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    // Se Salesforce dice "token invalido", forziamo refresh e riproviamo UNA volta
    if (resp.getResponseCode() === 401) {
      const body401 = resp.getContentText();
      if (body401.includes('INVALID_SESSION_ID')) {
        Logger.log('⚠️ Access token non valido. Provo refresh e ritento...');
        accessToken = refreshAccessToken_();
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
  if (!checkAuthOrPrompt_()) return;

  const token = getStoredToken_();
  Logger.log("instance_url: %s", token.instance_url);
  Logger.log("id endpoint: %s", token.id);

  const resp = UrlFetchApp.fetch(token.id, {
    headers: { Authorization: `Bearer ${getAccessToken_()}` },
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
  // Usa le costanti dal file configuration.gs
  
  const ss = SpreadsheetApp.getActive();
  const rendicontazioneSheet = ss.getSheetByName(SHEET_RENDICONTAZIONE);
  const validazioneSheet = ss.getSheetByName(SHEET_VALIDAZIONE_DATI);
  
  if (!rendicontazioneSheet) {
    throw new Error(`Sheet "${SHEET_RENDICONTAZIONE}" non trovato.`);
  }
  
  if (!validazioneSheet) {
    throw new Error(`Sheet "${SHEET_VALIDAZIONE_DATI}" non trovato. Esegui prima la sincronizzazione dei dati.`);
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
        // IMPORTANTE: usiamo il valore ORIGINALE per rilevare spazi extra
        const cellValueOriginal = String(cellValue);
        const cellValueTrimmed = cellValueOriginal.trim();
        const normalizedValue = cellValueTrimmed.toLowerCase();
        
        // Verifica che la lista esista e non sia vuota
        if (!validation.list || validation.list.length === 0) {
          Logger.log(`⚠️ Lista vuota per colonna ${colNumber} (${validation.name})`);
          continue; // Salta questa colonna se la lista è vuota
        }
        
        // Validazione STRICT: il valore deve essere ESATTAMENTE uguale
        // - Case-sensitive
        // - Senza spazi extra (iniziali o finali)
        
        // Prima verifica se ci sono spazi extra
        const hasExtraSpaces = cellValueOriginal !== cellValueTrimmed;
        
        // Validazione case-sensitive: confronto esatto (senza spazi extra)
        const exactMatch = validation.list.find(item => 
          String(item).trim() === cellValueTrimmed
        );
        
        if (exactMatch && !hasExtraSpaces) {
          // Match esatto e nessuno spazio extra: valido
          isValid = true;
        } else {
          // Non valido - cerca il motivo e proponi suggerimento
          isValid = false;
          
          if (hasExtraSpaces && exactMatch) {
            // Il valore è corretto ma ha spazi extra
            suggestion = exactMatch;
            Logger.log(`🔍 Spazi extra rilevati: "${cellValueOriginal}" -> "${exactMatch}"`);
          } else {
            // Cerca match case-insensitive per vedere se è solo un problema di case
            const caseInsensitiveMatch = validation.list.find(item => 
              String(item).trim().toLowerCase() === normalizedValue
            );
            
            if (caseInsensitiveMatch) {
              // Trovato un match case-insensitive: suggerisci il valore corretto
              suggestion = caseInsensitiveMatch;
              if (hasExtraSpaces) {
                Logger.log(`🔍 Case errato + spazi extra: "${cellValueOriginal}" -> "${caseInsensitiveMatch}"`);
              } else {
                Logger.log(`🔍 Case errato: "${cellValueTrimmed}" -> "${caseInsensitiveMatch}"`);
              }
            }
          }
        }
        
        // Se non valido, trova i suggerimenti più simili
        if (!isValid) {
          // Trova i suggerimenti più simili usando l'algoritmo generale
          if (!suggestion) {
            const candidates = findBestMatches_(cellValueTrimmed, normalizedValue, validation.list, validation.name);
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
        // Valida boolean (TRUE/FALSE) - STRICT: case-sensitive e senza spazi extra
        // NOTA: Google Sheets può restituire boolean nativi (true/false JavaScript)
        //       oppure stringhe ("TRUE"/"FALSE")
        
        // Se è un boolean nativo JavaScript, è sempre valido
        if (typeof cellValue === 'boolean') {
          isValid = true;
        } else {
          // È una stringa: validazione strict
          const cellValueOriginal = String(cellValue);
          const cellValueTrimmed = cellValueOriginal.trim();
          const hasExtraSpaces = cellValueOriginal !== cellValueTrimmed;
          
          // Validazione strict: deve essere esattamente "TRUE" o "FALSE"
          const isExactMatch = cellValueTrimmed === 'TRUE' || cellValueTrimmed === 'FALSE';
          
          if (isExactMatch && !hasExtraSpaces) {
            isValid = true;
          } else {
            isValid = false;
            
            // Trova il suggerimento corretto
            const upperValue = cellValueTrimmed.toUpperCase();
            if (upperValue === 'TRUE') {
              suggestion = 'TRUE';
              if (hasExtraSpaces) {
                Logger.log(`🔍 Boolean con spazi extra: "${cellValueOriginal}" -> "TRUE"`);
              } else {
                Logger.log(`🔍 Boolean case errato: "${cellValueTrimmed}" -> "TRUE"`);
              }
            } else if (upperValue === 'FALSE') {
              suggestion = 'FALSE';
              if (hasExtraSpaces) {
                Logger.log(`🔍 Boolean con spazi extra: "${cellValueOriginal}" -> "FALSE"`);
              } else {
                Logger.log(`🔍 Boolean case errato: "${cellValueTrimmed}" -> "FALSE"`);
              }
            } else {
              suggestion = 'TRUE o FALSE';
            }
          }
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
 * Corregge gli errori in modo interattivo, evidenziando la cella errata e mostrando un dialog
 */
function correctErrorsInteractively_(sheet, errorCells) {
  let correctedCount = 0;
  let skippedCount = 0;
  const ui = SpreadsheetApp.getUi();
  
  // Carica le liste di validazione per la rivalidazione
  const validazioneSheet = SpreadsheetApp.getActive().getSheetByName(SHEET_VALIDAZIONE_DATI);
  const validationLists = validazioneSheet ? loadValidationLists_(validazioneSheet) : null;
  
  // Set per tracciare le celle già processate/corrette (formato: "row:col")
  const processedCells = new Set();
  
  for (let i = 0; i < errorCells.length; i++) {
    const error = errorCells[i];
    const cellKey = `${error.row}:${error.col}`;
    
    // Salta le celle già processate/corrette
    if (processedCells.has(cellKey)) {
      continue;
    }
    
    const colLetter = columnNumberToLetter_(error.col);
    const cell = sheet.getRange(error.row, error.col);
    
    // Evidenzia la cella errata selezionandola e scrollando verso di essa
    sheet.setActiveRange(cell);
    
    // Crea il messaggio con il valore errato e il suggerimento
    let message = `📍 Cella ${colLetter}${error.row} - ${error.columnName}\n\n`;
    message += `Valore errato: "${error.value}"\n\n`;
    
    if (error.validation.type === 'boolean') {
      // Per i boolean, chiedi all'utente di inserire TRUE o FALSE
      message += `Valori validi: TRUE o FALSE\n\n`;
      message += `Inserisci il valore corretto:`;
      
      // Evidenzia la cella prima del dialog boolean
      const originalBoolState = {
        isBold: cell.getFontWeight() === 'bold',
        backgroundColor: cell.getBackground()
      };
      cell.setFontWeight('bold');
      cell.setBackground('#ffff00'); // Giallo
      
      // Posiziona la riga della cella come prima riga visibile
      // Strategia: selezionare la cella nella prima colonna (A) della stessa riga
      const firstColCell = sheet.getRange(error.row, 1);
      firstColCell.activate();
      SpreadsheetApp.flush();
      Utilities.sleep(150);
      cell.activate();
      SpreadsheetApp.flush();
      Utilities.sleep(100);
      sheet.setActiveRange(cell);
      SpreadsheetApp.flush();
      
      // Usa un dialog HTML con pulsanti TRUE e FALSE
      const selectedValue = showBooleanDialog_(error.value, colLetter, error.row, error.col, i + 1, errorCells.length, sheet);
      
      if (selectedValue === 'cancelled') {
        // Annullato dall'utente (chiuso il dialog senza selezionare)
        // La cella rimane errata: sfondo rosso, senza grassetto
        cell.setBackground('#ffcccc');
        cell.setFontWeight('normal');
        Logger.log(`⏸️ Processo interrotto dall'utente`);
        break; // Esci dal loop, il riepilogo verrà mostrato dopo
      } else if (selectedValue === false) {
        // Rifiutato - la cella rimane errata: sfondo rosso, senza grassetto
        cell.setBackground('#ffcccc');
        cell.setFontWeight('normal');
        skippedCount++;
        Logger.log(`❌ Rifiutato: ${colLetter}${error.row} - Mantenuto valore errato "${error.value}"`);
      } else if (selectedValue && (selectedValue === 'TRUE' || selectedValue === 'FALSE')) {
        // Valore selezionato - aggiorna tutte le celle nella stessa colonna con lo stesso valore errato
        const updatedCount = updateAllCellsWithSameError_(
          sheet, 
          error.col, 
          error.value, 
          selectedValue, 
          error.validation, 
          validationLists, 
          processedCells
        );
        
        // Segna la cella corrente come processata
        processedCells.add(cellKey);
        
        if (updatedCount > 0) {
          correctedCount += updatedCount;
          Logger.log(`✅ Corrette ${updatedCount} celle nella colonna ${colLetter} con valore "${selectedValue}"`);
        } else {
          // Nessuna cella aggiornata (caso imprevisto - non dovrebbe succedere)
          skippedCount++;
          Logger.log(`⚠️ Nessuna cella aggiornata: ${colLetter}${error.row}`);
        }
      } else {
        // Caso imprevisto
        cell.setBackground('#ffcccc');
        cell.setFontWeight('normal');
        skippedCount++;
        Logger.log(`⚠️ Risultato non valido dalla selezione: ${colLetter}${error.row}`);
      }
      continue; // Passa all'errore successivo
    } else if (error.validation.type === 'date') {
      // Per le date, il suggerimento è solo informativo
      message += error.suggestion || 'Verifica il formato data (es: GG/MM/AAAA)';
      message += '\n\nNota: Correggi manualmente il formato della data nello sheet.';
      
      // Evidenzia la cella prima del dialog date
      const originalDateState = {
        isBold: cell.getFontWeight() === 'bold',
        backgroundColor: cell.getBackground()
      };
      cell.setFontWeight('bold');
      cell.setBackground('#ffff00'); // Giallo
      
      // Posiziona la riga della cella come prima riga visibile
      // Strategia: selezionare la cella nella prima colonna (A) della stessa riga
      const firstColCell = sheet.getRange(error.row, 1);
      firstColCell.activate();
      SpreadsheetApp.flush();
      Utilities.sleep(150);
      cell.activate();
      SpreadsheetApp.flush();
      Utilities.sleep(100);
      sheet.setActiveRange(cell);
      SpreadsheetApp.flush();
      
      const dateResponse = ui.alert(
        `Errore ${i + 1}/${errorCells.length} - Data`,
        message,
        ui.ButtonSet.OK_CANCEL
      );
      
      // Ripristina lo stato: la cella rimane errata quindi sfondo rosso, senza grassetto
      cell.setBackground('#ffcccc');
      cell.setFontWeight('normal');
      
      if (dateResponse === ui.Button.OK) {
        // L'utente ha visto il messaggio, passa al prossimo errore
        skippedCount++;
        Logger.log(`⏭️ Saltato: ${colLetter}${error.row} - Data richiede correzione manuale`);
      } else {
        // Annulla tutto
        Logger.log(`⏸️ Processo interrotto dall'utente`);
        break;
      }
      continue; // Passa all'errore successivo
    } else if (error.suggestion) {
      // Gestisci sia suggerimento singolo che array di candidati
      if (Array.isArray(error.suggestion) && error.suggestion.length > 0) {
        // Più candidati disponibili - usa HTML dialog con pulsanti
        const selectedValue = showCandidatesDialog_(error.suggestion, error.value, colLetter, error.row, error.col, i + 1, errorCells.length, sheet);
        
        if (selectedValue === 'cancelled') {
          // Annullato dall'utente (chiuso il dialog senza selezionare)
          // La cella rimane errata: sfondo rosso, senza grassetto
          cell.setBackground('#ffcccc');
          cell.setFontWeight('normal');
          Logger.log(`⏸️ Processo interrotto dall'utente`);
          break; // Esci dal loop, il riepilogo verrà mostrato dopo
        } else if (selectedValue === false) {
          // Rifiutato - la cella rimane errata: sfondo rosso, senza grassetto
          cell.setBackground('#ffcccc');
          cell.setFontWeight('normal');
          skippedCount++;
          Logger.log(`❌ Rifiutato: ${colLetter}${error.row} - Mantenuto valore errato "${error.value}"`);
        } else if (selectedValue && selectedValue !== 'pending') {
          // Valore selezionato - aggiorna tutte le celle nella stessa colonna con lo stesso valore errato
          const updatedCount = updateAllCellsWithSameError_(
            sheet, 
            error.col, 
            error.value, 
            selectedValue, 
            error.validation, 
            validationLists, 
            processedCells
          );
          
          // Segna la cella corrente come processata
          processedCells.add(cellKey);
          
          if (updatedCount > 0) {
            correctedCount += updatedCount;
            Logger.log(`✅ Corrette ${updatedCount} celle nella colonna ${colLetter} con valore "${selectedValue}"`);
          } else {
            // Nessuna cella aggiornata (caso imprevisto)
            skippedCount++;
            Logger.log(`⚠️ Nessuna cella aggiornata: ${colLetter}${error.row}`);
          }
        } else {
          // Caso imprevisto
          skippedCount++;
          Logger.log(`⚠️ Risultato non valido dalla selezione: ${colLetter}${error.row}`);
        }
      } else if (typeof error.suggestion === 'string') {
        // Singolo suggerimento - usa lo stesso dialog HTML con un solo candidato
        const singleCandidate = [{ value: error.suggestion, score: null }];
        const selectedValue = showCandidatesDialog_(singleCandidate, error.value, colLetter, error.row, error.col, i + 1, errorCells.length, sheet);
        
        if (selectedValue === 'cancelled') {
          // Annullato dall'utente (chiuso il dialog senza selezionare)
          // La cella rimane errata: sfondo rosso, senza grassetto
          cell.setBackground('#ffcccc');
          cell.setFontWeight('normal');
          Logger.log(`⏸️ Processo interrotto dall'utente`);
          break; // Esci dal loop, il riepilogo verrà mostrato dopo
        } else if (selectedValue === false) {
          // Rifiutato - la cella rimane errata: sfondo rosso, senza grassetto
          cell.setBackground('#ffcccc');
          cell.setFontWeight('normal');
          skippedCount++;
          Logger.log(`❌ Rifiutato: ${colLetter}${error.row} - Mantenuto valore errato "${error.value}"`);
        } else if (selectedValue && selectedValue !== 'pending') {
          // Valore selezionato - aggiorna tutte le celle nella stessa colonna con lo stesso valore errato
          const updatedCount = updateAllCellsWithSameError_(
            sheet, 
            error.col, 
            error.value, 
            selectedValue, 
            error.validation, 
            validationLists, 
            processedCells
          );
          
          // Segna la cella corrente come processata
          processedCells.add(cellKey);
          
          if (updatedCount > 0) {
            correctedCount += updatedCount;
            Logger.log(`✅ Corrette ${updatedCount} celle nella colonna ${colLetter} con valore "${selectedValue}"`);
          } else {
            // Nessuna cella aggiornata (caso imprevisto)
            skippedCount++;
            Logger.log(`⚠️ Nessuna cella aggiornata: ${colLetter}${error.row}`);
          }
        } else {
          // Caso imprevisto
          skippedCount++;
          Logger.log(`⚠️ Risultato non valido dalla selezione: ${colLetter}${error.row}`);
        }
      }
    } else {
      // Nessun suggerimento disponibile
      message += `Nessun suggerimento disponibile`;
      skippedCount++;
      Logger.log(`⏭️ Saltato: ${colLetter}${error.row} - Nessun suggerimento applicabile`);
    }
  }
  
  // Mostra il riepilogo DOPO che il loop è completato (o interrotto)
  const wasInterrupted = correctedCount + skippedCount < errorCells.length;
  const summaryMessage = wasInterrupted ? `Correzione interrotta:\n\n` : `Correzione completata:\n\n`;
  const summary = summaryMessage + 
    `✅ Corretti: ${correctedCount}\n` +
    `❌ Rifiutati/Saltati: ${skippedCount}\n` +
    `📊 Totale errori trovati: ${errorCells.length}` +
    (wasInterrupted ? `\n⏸️ Processo interrotto dall'utente` : '');
  
  ui.alert('Riepilogo', summary, ui.ButtonSet.OK);
}

/**
 * Aggiorna tutte le celle nella stessa colonna che hanno lo stesso valore errato
 * Restituisce il numero di celle aggiornate e aggiunge le celle processate al Set
 */
function updateAllCellsWithSameError_(sheet, col, originalErrorValue, newValue, validation, validationLists, processedCells) {
  let updatedCount = 0;
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return updatedCount; // Nessun dato da controllare
  
  // Normalizza il valore errato originale per il confronto
  const normalizedOriginalValue = String(originalErrorValue).trim();
  
  // Trova tutte le celle nella stessa colonna con lo stesso valore errato
  const dataRange = sheet.getRange(2, col, lastRow - 1, 1);
  const values = dataRange.getValues();
  
  const cellsToUpdate = [];
  
  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    const cellValue = values[rowIndex][0];
    const normalizedCellValue = String(cellValue).trim();
    
    // Confronta i valori normalizzati (case-sensitive per alcuni tipi)
    if (normalizedCellValue === normalizedOriginalValue) {
      const actualRow = rowIndex + 2; // +2 perché partiamo dalla riga 2
      const cell = sheet.getRange(actualRow, col);
      cellsToUpdate.push(cell);
    }
  }
  
  // Aggiorna tutte le celle trovate
  for (const cell of cellsToUpdate) {
    const row = cell.getRow();
    const colNum = cell.getColumn();
    const cellKey = `${row}:${colNum}`;
    
    // Segna questa cella come processata
    processedCells.add(cellKey);
    
    cell.setValue(newValue);
    
    // Rivalida la cella
    if (revalidateCell_(cell, validation, validationLists)) {
      // Valore corretto: sfondo bianco, senza grassetto
      cell.setBackground('#ffffff');
      cell.setFontWeight('normal');
      updatedCount++;
    } else {
      // Valore ancora errato: sfondo rosso, senza grassetto
      cell.setBackground('#ffcccc');
      cell.setFontWeight('normal');
    }
  }
  
  if (updatedCount > 0) {
    Logger.log(`✅ Aggiornate ${updatedCount} celle nella colonna ${columnNumberToLetter_(col)} con valore "${newValue}"`);
  }
  
  return updatedCount;
}

/**
 * Mostra un dialog HTML con pulsanti per ogni candidato
 * Restituisce: valore selezionato (string), false se rifiutato, null se annullato
 */
function showCandidatesDialog_(candidates, errorValue, colLetter, row, col, errorNum, totalErrors, sheet) {
  const ui = SpreadsheetApp.getUi();
  
  // Salva lo stato originale della cella e evidenzia con grassetto su sfondo giallo
  let originalState = null;
  if (sheet) {
    const cell = sheet.getRange(row, col);
    
    // Salva lo stato originale della cella
    originalState = {
      isBold: cell.getFontWeight() === 'bold',
      backgroundColor: cell.getBackground()
    };
    
    // Evidenzia la cella: grassetto su sfondo giallo
    cell.setFontWeight('bold');
    cell.setBackground('#ffff00'); // Giallo
    
    // Posiziona la riga della cella come prima riga visibile
    // Strategia: selezionare la cella nella prima colonna (A) della stessa riga
    // Questo porta quella riga come prima riga visibile nello sheet
    const firstColCell = sheet.getRange(row, 1);
    firstColCell.activate();
    SpreadsheetApp.flush();
    Utilities.sleep(150);
    
    // Ora seleziona la cella target nella sua colonna
    cell.activate();
    SpreadsheetApp.flush();
    Utilities.sleep(100);
    
    // Conferma la selezione con setActiveRange per assicurarsi che sia visibile
    sheet.setActiveRange(cell);
    SpreadsheetApp.flush(); // Forza l'aggiornamento dell'UI per assicurarsi che la cella sia evidenziata e visibile
  }
  
  // Crea una chiave univoca per questa selezione (prima di creare l'HTML)
  const selectionKey = `candidateSelection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            margin: 0;
            padding-top: 80px; /* Spazio per la prima riga dello sheet sopra il dialog */
          }
          h2 {
            margin-top: 0;
            color: #333;
          }
          .error-info {
            background-color: #fff3cd;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            border-left: 4px solid #ffc107;
          }
          .candidates-list {
            margin: 15px 0;
          }
          .candidate-button {
            display: block;
            width: 100%;
            padding: 12px 15px;
            margin: 8px 0;
            text-align: left;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
          }
          .candidate-button:hover {
            background-color: #357ae8;
          }
          .candidate-button:active {
            background-color: #2a65d0;
          }
          .candidate-value {
            font-weight: bold;
          }
          .candidate-score {
            font-size: 12px;
            opacity: 0.9;
            margin-left: 5px;
          }
          .reject-button {
            display: block;
            width: 100%;
            padding: 12px 15px;
            margin: 15px 0 0 0;
            text-align: center;
            background-color: #ea4335;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background-color 0.2s;
          }
          .reject-button:hover {
            background-color: #d33b2c;
          }
          .reject-button:active {
            background-color: #b0281a;
          }
        </style>
      </head>
      <body>
        <h2>Errore ${errorNum}/${totalErrors}</h2>
        <div class="error-info">
          <strong>📍 Cella ${colLetter}${row}</strong><br>
          Valore errato: <strong>"${errorValue.replace(/"/g, '&quot;')}"</strong>
        </div>
        <div>
          <p>Trovati ${candidates.length} valore${candidates.length > 1 ? 'i' : ''} simile${candidates.length > 1 ? 'i' : ''}:</p>
          <div class="candidates-list">
            ${candidates.map((candidate, idx) => {
              const candidateValue = typeof candidate === 'object' ? candidate.value : candidate;
              const candidateScore = typeof candidate === 'object' ? candidate.score : null;
              const scoreText = candidateScore ? ` (${(candidateScore * 100).toFixed(0)}% similarità)` : '';
              // Escape del valore per JavaScript e HTML
              const escapedValue = candidateValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
              return `
                <button class="candidate-button" onclick="selectCandidate('${escapedValue}', '${selectionKey}')">
                  <span class="candidate-value">"${candidateValue.replace(/"/g, '&quot;')}"</span>
                  ${scoreText ? `<span class="candidate-score">${scoreText}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
          <button class="reject-button" onclick="rejectSuggestion('${selectionKey}')">Rifiuta suggerimenti</button>
        </div>
        <script>
          function selectCandidate(value, key) {
            // Disabilita i pulsanti per evitare doppi click
            const buttons = document.querySelectorAll('.candidate-button, .reject-button');
            buttons.forEach(btn => btn.disabled = true);
            
            // Salva il valore, poi chiudi il dialog
            // IMPORTANTE: il callback deve completare PRIMA di chiudere il dialog
            google.script.run
              .withSuccessHandler(function() {
                // Dopo che il valore è stato salvato con successo, chiudi il dialog
                // Questo assicura che il valore sia già nelle Properties quando il dialog si chiude
                google.script.host.close();
              })
              .withFailureHandler(function(error) {
                alert('Errore: ' + error.message);
                buttons.forEach(btn => btn.disabled = false);
              })
              .handleCandidateSelection(value, key);
          }
          
          function rejectSuggestion(key) {
            // Disabilita i pulsanti per evitare doppi click
            const buttons = document.querySelectorAll('.candidate-button, .reject-button');
            buttons.forEach(btn => btn.disabled = true);
            
            // Salva il rifiuto, poi chiudi il dialog
            // IMPORTANTE: il callback deve completare PRIMA di chiudere il dialog
            google.script.run
              .withSuccessHandler(function() {
                // Dopo che il rifiuto è stato salvato con successo, chiudi il dialog
                // Questo assicura che il valore sia già nelle Properties quando il dialog si chiude
                google.script.host.close();
              })
              .withFailureHandler(function(error) {
                alert('Errore: ' + error.message);
                buttons.forEach(btn => btn.disabled = false);
              })
              .handleCandidateRejection(key);
          }
          
        </script>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(Math.min(600, 300 + (candidates.length * 60)));
  
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(selectionKey, 'pending');
  
  // Mostra il dialog modale - BLOCCA completamente l'esecuzione fino alla chiusura
  // showModalDialog è sincrono: l'esecuzione riprende solo quando il dialog è completamente chiuso
  ui.showModalDialog(html, `Errore ${errorNum}/${totalErrors} - Selezione valore`);
  
  // Dopo che showModalDialog ritorna, il dialog è chiuso
  // Ora leggiamo il risultato salvato dal callback JavaScript
  // Il callback viene eseguito PRIMA della chiusura del dialog (nel withSuccessHandler)
  // quindi il risultato dovrebbe essere già disponibile, ma facciamo polling per sicurezza
  Utilities.sleep(300); // Aspetta un momento iniziale per assicurarsi che il callback sia completato
  
  let result = properties.getProperty(selectionKey);
  
  // Se ancora pending, aspetta finché il callback non completa
  // Timeout molto lungo (5 minuti) per dare all'utente tutto il tempo necessario
  // Il dialog è già chiuso quando showModalDialog ritorna, quindi questo polling serve solo
  // per assicurarsi che il callback sia completato
  let attempts = 0;
  const maxAttempts = 1500; // 1500 * 200ms = 300 secondi = 5 minuti
  
  while (result === 'pending' && attempts < maxAttempts) {
    Utilities.sleep(200);
    result = properties.getProperty(selectionKey);
    attempts++;
  }
  
  // Se dopo tutti i tentativi è ancora pending, significa che il dialog è stato chiuso senza selezione
  if (result === 'pending') {
    Logger.log(`⚠️ Dialog chiuso senza selezione dopo timeout lungo, considerato come cancellato`);
    result = 'cancelled';
  }
  
  // Pulisci la proprietà
  const finalResult = result;
  properties.deleteProperty(selectionKey);
  
  // Ripristina lo stato originale della cella: rimuovi sempre il grassetto
  // Lo sfondo verrà impostato dalla funzione chiamante in base alla validazione
  if (sheet && originalState) {
    const cell = sheet.getRange(row, col);
    // Rimuovi sempre il grassetto (torna allo stato normale)
    cell.setFontWeight('normal');
    // Lo sfondo verrà impostato dalla funzione chiamante in base alla validazione
    SpreadsheetApp.flush();
  }
  
  // Gestisci i risultati
  if (finalResult === 'rejected') {
    return false; // Rifiutato - continua con il prossimo errore
  } else if (finalResult && finalResult !== 'pending' && finalResult !== 'cancelled') {
    return finalResult; // Valore selezionato
  } else if (finalResult === 'cancelled') {
    Logger.log(`⏸️ Dialog cancellato dall'utente`);
    return 'cancelled'; // Annullato - esce completamente
  } else {
    // Timeout o valore non valido - considera come annullato
    return 'cancelled';
  }
}

/**
 * Mostra un dialog HTML con pulsanti TRUE e FALSE per valori boolean
 * Restituisce: 'TRUE' o 'FALSE' selezionato, false se rifiutato, 'cancelled' se annullato
 */
function showBooleanDialog_(errorValue, colLetter, row, col, errorNum, totalErrors, sheet) {
  const ui = SpreadsheetApp.getUi();
  
  // Salva lo stato originale della cella e evidenzia con grassetto su sfondo giallo
  let originalState = null;
  if (sheet) {
    const cell = sheet.getRange(row, col);
    
    // Salva lo stato originale della cella
    originalState = {
      isBold: cell.getFontWeight() === 'bold',
      backgroundColor: cell.getBackground()
    };
    
    // Evidenzia la cella: grassetto su sfondo giallo
    cell.setFontWeight('bold');
    cell.setBackground('#ffff00'); // Giallo
    
    // Posiziona la riga della cella come prima riga visibile
    // Strategia: selezionare la cella nella prima colonna (A) della stessa riga
    // Questo porta quella riga come prima riga visibile nello sheet
    const firstColCell = sheet.getRange(row, 1);
    firstColCell.activate();
    SpreadsheetApp.flush();
    Utilities.sleep(150);
    
    // Ora seleziona la cella target nella sua colonna
    cell.activate();
    SpreadsheetApp.flush();
    Utilities.sleep(100);
    
    // Conferma la selezione con setActiveRange per assicurarsi che sia visibile
    sheet.setActiveRange(cell);
    SpreadsheetApp.flush(); // Forza l'aggiornamento dell'UI per assicurarsi che la cella sia evidenziata e visibile
  }
  
  // Crea una chiave univoca per questa selezione
  const selectionKey = `booleanSelection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            margin: 0;
            padding-top: 80px; /* Spazio per la prima riga dello sheet sopra il dialog */
          }
          h2 {
            margin-top: 0;
            color: #333;
          }
          .error-info {
            background-color: #fff3cd;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            border-left: 4px solid #ffc107;
          }
          .boolean-buttons {
            margin: 15px 0;
          }
          .boolean-button {
            display: block;
            width: 100%;
            padding: 12px 15px;
            margin: 8px 0;
            text-align: left;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
          }
          .boolean-button:hover {
            background-color: #357ae8;
          }
          .boolean-button:active {
            background-color: #2a65d0;
          }
          .boolean-button.true-button {
            background-color: #34a853;
          }
          .boolean-button.true-button:hover {
            background-color: #2d8e47;
          }
          .boolean-button.false-button {
            background-color: #ea4335;
          }
          .boolean-button.false-button:hover {
            background-color: #d33b2c;
          }
          .boolean-value {
            font-weight: bold;
          }
          .reject-button {
            display: block;
            width: 100%;
            padding: 12px 15px;
            margin: 15px 0 0 0;
            text-align: center;
            background-color: #ea4335;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background-color 0.2s;
          }
          .reject-button:hover {
            background-color: #d33b2c;
          }
          .reject-button:active {
            background-color: #b0281a;
          }
        </style>
      </head>
      <body>
        <h2>Errore ${errorNum}/${totalErrors} - Boolean</h2>
        <div class="error-info">
          <strong>📍 Cella ${colLetter}${row}</strong><br>
          Valore errato: <strong>"${String(errorValue).replace(/"/g, '&quot;')}"</strong><br>
          Seleziona il valore corretto:
        </div>
        <div class="boolean-buttons">
          <button class="boolean-button true-button" onclick="selectBoolean('TRUE', '${selectionKey}')">
            <span class="boolean-value">TRUE</span>
          </button>
          <button class="boolean-button false-button" onclick="selectBoolean('FALSE', '${selectionKey}')">
            <span class="boolean-value">FALSE</span>
          </button>
        </div>
        <button class="reject-button" onclick="rejectBoolean('${selectionKey}')">Rifiuta correzione</button>
        <script>
          function selectBoolean(value, key) {
            // Disabilita i pulsanti per evitare doppi click
            const buttons = document.querySelectorAll('.boolean-button, .reject-button');
            buttons.forEach(btn => btn.disabled = true);
            
            // Salva il valore, poi chiudi il dialog
            google.script.run
              .withSuccessHandler(function() {
                google.script.host.close();
              })
              .withFailureHandler(function(error) {
                alert('Errore: ' + error.message);
                buttons.forEach(btn => btn.disabled = false);
              })
              .handleBooleanSelection(value, key);
          }
          
          function rejectBoolean(key) {
            // Disabilita i pulsanti per evitare doppi click
            const buttons = document.querySelectorAll('.boolean-button, .reject-button');
            buttons.forEach(btn => btn.disabled = true);
            
            // Salva il rifiuto, poi chiudi il dialog
            google.script.run
              .withSuccessHandler(function() {
                google.script.host.close();
              })
              .withFailureHandler(function(error) {
                alert('Errore: ' + error.message);
                buttons.forEach(btn => btn.disabled = false);
              })
              .handleBooleanRejection(key);
          }
        </script>
      </body>
    </html>
  `)
    .setWidth(400)
    .setHeight(350);
  
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(selectionKey, 'pending');
  
  // Mostra il dialog modale
  ui.showModalDialog(html, `Errore ${errorNum}/${totalErrors} - Selezione Boolean`);
  
  // Dopo che showModalDialog ritorna, il dialog è chiuso
  Utilities.sleep(300);
  
  let result = properties.getProperty(selectionKey);
  
  // Se ancora pending, aspetta finché il callback non completa
  // Timeout molto lungo (5 minuti) per dare all'utente tutto il tempo necessario
  let attempts = 0;
  const maxAttempts = 1500; // 1500 * 200ms = 300 secondi = 5 minuti
  
  while (result === 'pending' && attempts < maxAttempts) {
    Utilities.sleep(200);
    result = properties.getProperty(selectionKey);
    attempts++;
  }
  
  // Se dopo tutti i tentativi è ancora pending, significa che il dialog è stato chiuso senza selezione
  if (result === 'pending') {
    Logger.log(`⚠️ Dialog boolean chiuso senza selezione dopo timeout lungo, considerato come cancellato`);
    result = 'cancelled';
  }
  
  // Pulisci la proprietà
  const finalResult = result;
  properties.deleteProperty(selectionKey);
  
  // Ripristina lo stato originale della cella: rimuovi sempre il grassetto
  if (sheet && originalState) {
    const cell = sheet.getRange(row, col);
    // Rimuovi sempre il grassetto (torna allo stato normale)
    cell.setFontWeight('normal');
    // Lo sfondo verrà impostato dalla funzione chiamante in base alla validazione
    SpreadsheetApp.flush();
  }
  
  // Gestisci i risultati
  if (finalResult === 'rejected') {
    return false; // Rifiutato - continua con il prossimo errore
  } else if (finalResult && finalResult !== 'pending' && finalResult !== 'cancelled') {
    return finalResult; // Valore selezionato ('TRUE' o 'FALSE')
  } else if (finalResult === 'cancelled') {
    Logger.log(`⏸️ Dialog boolean cancellato dall'utente`);
    return 'cancelled'; // Annullato - esce completamente
  } else {
    // Timeout o valore non valido - considera come annullato
    return 'cancelled';
  }
}

/**
 * Gestisce la selezione di un candidato (chiamato dall'HTML)
 * IMPORTANTE: questa funzione deve completare PRIMA che il dialog si chiuda
 */
function handleCandidateSelection(value, key) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, value);
    // Forza il flush per assicurarsi che il valore sia salvato immediatamente
    Utilities.sleep(10);
  } catch (error) {
    Logger.log(`Errore nel salvare la selezione: ${error.message}`);
    throw error;
  }
}

/**
 * Gestisce il rifiuto del suggerimento (chiamato dall'HTML)
 * IMPORTANTE: questa funzione deve completare PRIMA che il dialog si chiuda
 */
function handleCandidateRejection(key) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, 'rejected');
    // Forza il flush per assicurarsi che il valore sia salvato immediatamente
    Utilities.sleep(10);
  } catch (error) {
    Logger.log(`Errore nel salvare il rifiuto: ${error.message}`);
    throw error;
  }
}

/**
 * Gestisce la cancellazione del dialog (chiamato quando l'utente chiude il dialog senza selezionare)
 */
function handleCandidateCancellation(key) {
  const currentValue = PropertiesService.getScriptProperties().getProperty(key);
  // Solo se è ancora pending, segna come cancelled
  if (currentValue === 'pending') {
    PropertiesService.getScriptProperties().setProperty(key, 'cancelled');
  }
}

/**
 * Gestisce la selezione di un valore boolean (chiamato dall'HTML)
 * IMPORTANTE: questa funzione deve completare PRIMA che il dialog si chiuda
 */
function handleBooleanSelection(value, key) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, value);
    // Forza il flush per assicurarsi che il valore sia salvato immediatamente
    Utilities.sleep(10);
  } catch (error) {
    Logger.log(`Errore nel salvare la selezione boolean: ${error.message}`);
    throw error;
  }
}

/**
 * Gestisce il rifiuto della correzione boolean (chiamato dall'HTML)
 * IMPORTANTE: questa funzione deve completare PRIMA che il dialog si chiuda
 */
function handleBooleanRejection(key) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, 'rejected');
    // Forza il flush per assicurarsi che il valore sia salvato immediatamente
    Utilities.sleep(10);
  } catch (error) {
    Logger.log(`Errore nel salvare il rifiuto boolean: ${error.message}`);
    throw error;
  }
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
    // Valida contro la lista - STRICT: case-sensitive e senza spazi extra
    const cellValueOriginal = String(cellValue);
    const cellValueTrimmed = cellValueOriginal.trim();
    const hasExtraSpaces = cellValueOriginal !== cellValueTrimmed;
    
    // Se ci sono spazi extra, non è valido
    if (hasExtraSpaces) {
      return false;
    }
    
    // Validazione case-sensitive: confronto esatto
    return validation.list.some(item => 
      String(item).trim() === cellValueTrimmed
    );
  } else if (validation.type === 'date') {
    // Valida formato data
    return isValidDate_(cellValue);
  } else if (validation.type === 'boolean') {
    // Valida boolean (TRUE/FALSE) - STRICT: case-sensitive e senza spazi extra
    // NOTA: Google Sheets può restituire boolean nativi (true/false JavaScript)
    
    // Se è un boolean nativo JavaScript, è sempre valido
    if (typeof cellValue === 'boolean') {
      return true;
    }
    
    // È una stringa: validazione strict
    const cellValueOriginal = String(cellValue);
    const cellValueTrimmed = cellValueOriginal.trim();
    const hasExtraSpaces = cellValueOriginal !== cellValueTrimmed;
    
    // Se ci sono spazi extra, non è valido
    if (hasExtraSpaces) {
      return false;
    }
    
    // Deve essere esattamente "TRUE" o "FALSE"
    return cellValueTrimmed === 'TRUE' || cellValueTrimmed === 'FALSE';
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

/**
 * Legge tutte le righe dello sheet Rendicontazione (escluso l'header) e le invia al componente InvoiceExcelEditor
 * Formatta i dati come TSV (Tab-Separated Values) come quando si copia da Excel
 */
function sendDataToInvoiceExcelEditor() {
  // Usa le costanti dal file configuration.gs
  
  const ss = SpreadsheetApp.getActive();
  const rendicontazioneSheet = ss.getSheetByName(SHEET_RENDICONTAZIONE);
  
  if (!rendicontazioneSheet) {
    SpreadsheetApp.getUi().alert('Errore', `Sheet "${SHEET_RENDICONTAZIONE}" non trovato.`, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Ottieni tutti i dati dallo sheet Rendicontazione (escludendo l'intestazione)
  const lastRow = rendicontazioneSheet.getLastRow();
  const lastCol = rendicontazioneSheet.getLastColumn();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Errore', 'Nessun dato da inviare nello sheet Rendicontazione.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Leggi tutti i dati (dalla riga 2 in poi, senza header)
  const dataRange = rendicontazioneSheet.getRange(2, 1, lastRow - 1, lastCol);
  const dataValues = dataRange.getValues();
  
  // Converti i dati in formato TSV (Tab-Separated Values) come quando si copia da Excel
  const tsvLines = [];
  for (let rowIndex = 0; rowIndex < dataValues.length; rowIndex++) {
    const row = dataValues[rowIndex];
    const tsvRow = [];
    
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const value = row[colIndex];
      
      // Gestisci i valori null/undefined/vuoti
      if (value === null || value === undefined || value === '') {
        tsvRow.push('');
      } else if (value instanceof Date) {
        // Formatta le date come stringa nel formato GG/MM/AAAA
        const day = String(value.getDate()).padStart(2, '0');
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const year = value.getFullYear();
        tsvRow.push(`${day}/${month}/${year}`);
      } else {
        // Converti in stringa e pulisci caratteri nascosti
        // IMPORTANTE: I tab vengono aggiunti come delimitatori quando uniamo i valori con join('\t')
        // quindi qui puliamo solo i caratteri nascosti DENTRO ogni valore
        let stringValue = String(value);
        // Rimuovi spazi iniziali e finali (trim) per evitare problemi di validazione
        stringValue = stringValue.trim();
        // Rimuovi caratteri Unicode invisibili comuni
        stringValue = stringValue.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width spaces, zero-width non-joiner, zero-width joiner, BOM
        // Rimuovi caratteri di controllo (eccetto tab=0x09, newline=0x0A, carriage return=0x0D)
        // Nota: normalmente non dovrebbero esserci tab/newline dentro un valore singolo, ma li manteniamo per sicurezza
        stringValue = stringValue.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
        // Rimuovi carriage return standalone
        stringValue = stringValue.replace(/\r(?!\n)/g, '');
        // Rimuovi eventuali spazi multipli consecutivi (normalizza spazi ma mantieni il contenuto)
        stringValue = stringValue.replace(/[ ]+/g, ' ');
        // Rimuovi eventuali spazi iniziali/finali rimasti dopo le sostituzioni
        stringValue = stringValue.trim();
        tsvRow.push(stringValue);
      }
    }
    
    // Unisci i valori con tab
    tsvLines.push(tsvRow.join('\t'));
  }
  
  // Unisci tutte le righe con newline
  const tsvData = tsvLines.join('\n');
  
  const base64Data = Utilities.base64Encode(tsvData);
  const url = INVOICE_EXCEL_EDITOR_URL;
  
  Logger.log('=== DATI TSV PER InvoiceExcelEditor ===');
  Logger.log(`Righe inviate: ${tsvLines.length}`);
  Logger.log(`Dimensione dati: ${tsvData.length} caratteri`);
  Logger.log(`Dimensione base64: ${base64Data.length} caratteri`);
  Logger.log('=== FINE DATI TSV ===');
  
  // I dati vengono salvati in localStorage del dominio Salesforce tramite una pagina ponte,
  // poi il componente LWC li legge da localStorage. Questo evita il limite di dimensione degli URL.
  const sfOrigin = INVOICE_EXCEL_EDITOR_URL.match(/^https?:\/\/[^/]+/)[0];
  
  const htmlOutput = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .info-box { background-color: #e8f0fe; padding: 15px; border-radius: 4px; margin: 10px 0; border-left: 4px solid #4285f4; }
          button { background-color: #4285f4; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-top: 10px; margin-right: 10px; }
          button:hover { background-color: #357ae8; }
          button.secondary { background-color: #ea4335; }
          button.secondary:hover { background-color: #d33b2c; }
          #status { margin-top: 12px; font-size: 13px; color: #666; }
        </style>
      </head>
      <body>
        <h3>Dati pronti per InvoiceExcelEditor</h3>
        <div class="info-box">
          <strong>Righe:</strong> ${tsvLines.length}<br>
          <strong>Dimensione dati:</strong> ${Math.round(base64Data.length / 1024)} KB
        </div>
        <button id="sendBtn" onclick="sendData()">Apri e invia dati a Salesforce</button>
        <button onclick="google.script.host.close();" class="secondary">Chiudi</button>
        <p id="status"></p>
        <script>
          var base64Data = ${JSON.stringify(base64Data)};
          var targetUrl = ${JSON.stringify(url)};
          
          function sendData() {
            document.getElementById('sendBtn').disabled = true;
            document.getElementById('status').textContent = 'Apertura Salesforce...';
            var w = window.open(targetUrl + '?c__pasteDataPending=1', '_blank');
            
            // Invia i dati via postMessage quando la finestra è pronta
            var attempts = 0;
            var maxAttempts = 60;
            var interval = setInterval(function() {
              attempts++;
              try {
                w.postMessage({ type: 'gsheetsData', pasteData: base64Data }, '*');
                document.getElementById('status').textContent = 'Dati inviati (tentativo ' + attempts + '). Se il componente non li riceve, riprova.';
              } catch(e) {}
              if (attempts >= maxAttempts) {
                clearInterval(interval);
                document.getElementById('status').textContent = 'Invio completato. Puoi chiudere questa finestra.';
                document.getElementById('sendBtn').disabled = false;
              }
            }, 1000);
          }
        </script>
      </body>
    </html>
  `)
    .setWidth(500)
    .setHeight(300);
  
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Invio dati a InvoiceExcelEditor');
}

function doGet(e) {
  try {
    Logger.log('=== doGet chiamato ===');
    Logger.log('Parameters: ' + JSON.stringify(e.parameter));
    
    const action = (typeof e.parameter.action === 'string') ? e.parameter.action : (Array.isArray(e.parameter.action) ? e.parameter.action[0] : '');
    
    // Test semplice: se nessun parametro, mostra pagina di test
    if (!e.parameter || Object.keys(e.parameter).length === 0) {
      return HtmlService.createHtmlOutput(
        '<h2>Deployment attivo ✅</h2>' +
        '<p>Il deployment funziona correttamente.</p>' +
        '<p>Email: ' + Session.getEffectiveUser().getEmail() + '</p>'
      );
    }
    
    // Gestisce richieste di recupero token dalle copie
    if (action === 'getToken') {
      return handleGetTokenRequest_(e);
    }
    
    // Gestisce avvio OAuth: genera state, associa a email, redirect a Salesforce
    if (action === 'startAuth') {
      return handleStartAuth_(e);
    }
    
    // Mostra l'URL di callback da configurare in Salesforce
    if (action === 'showCallback') {
      return handleShowCallback_();
    }
    
    // Diagnostica: restituisce il redirect_uri usato (apri in browser per verificare il deployment live)
    if (action === 'checkCallback') {
      const uri = getRedirectFromExec_();
      return ContentService.createTextOutput(uri).setMimeType(ContentService.MimeType.TEXT);
    }
    
    // Gestisce il callback OAuth da Salesforce
    return authCallback(e);
    
  } catch (error) {
    Logger.log('ERRORE in doGet: ' + error.toString());
    return HtmlService.createHtmlOutput(
      '<h2 style="color:red;">Errore</h2>' +
      '<p>' + error.toString() + '</p>'
    );
  }
}

/**
 * Gestisce l'avvio OAuth: genera state random, associa all'email, redirect a Salesforce
 * Endpoint: ?action=startAuth&email=xxx
 */
function handleStartAuth_(e) {
  let email = (e.parameter.email || '').trim();
  if (!email) {
    // Fallback se l'email non è disponibile (alcune org Google)
    try {
      email = Session.getEffectiveUser().getEmail();
    } catch (e2) {}
  }
  if (!email) {
    return HtmlService.createHtmlOutput(
      '<h2 style="color:red;">Errore</h2><p>Impossibile determinare l\'email. Assicurati di avviare l\'autorizzazione dal menu Salesforce nel foglio.</p>'
    );
  }
  
  // NOTA: Il parametro state viene rifiutato da Salesforce ("token state non valido").
  // Lo omettiamo per far funzionare l'OAuth. Il callback usa getEffectiveUser().
  const params = [
    'response_type=code',
    'client_id=' + encodeURIComponent(CLIENT_ID),
    'redirect_uri=' + encodeURIComponent(getRedirectFromExec_()),
    'scope=' + encodeURIComponent('api refresh_token'),
    'prompt=consent'
  ].join('&');
  
  // Usa SF_LOGIN (login.salesforce.com) per OAuth - SF_DOMAIN/my.salesforce.com può rifiutare la connessione
  const salesforceUrl = SF_LOGIN + '/services/oauth2/authorize?' + params;
  
  Logger.log('startAuth: email=' + email + ', redirect_uri=' + getRedirectFromExec_());
  
  // Pagina con link cliccabile (no meta-refresh: evita "refused to connect")
  const safeUrl = salesforceUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' +
    'body{font-family:Arial,sans-serif;padding:40px;text-align:center;}' +
    '.btn{display:inline-block;background:#0176d3;color:white;padding:14px 28px;text-decoration:none;border-radius:4px;font-size:16px;margin:20px 0;cursor:pointer;border:none;}' +
    '.btn:hover{background:#014a8c;}' +
    'p{color:#666;}' +
    '</style></head><body>' +
    '<h2>Autorizzazione Salesforce</h2>' +
    '<p>Clicca il pulsante qui sotto per continuare su Salesforce:</p>' +
    '<button onclick="window.open(\'' + safeUrl + '\', \'_blank\', \'noopener,noreferrer\');" class="btn">Vai a Salesforce per autorizzare</button>' +
    '<p style="font-size:12px;">Si aprirà una nuova scheda con la pagina di login/autorizzazione di Salesforce.</p>' +
    '</body></html>'
  );
}

/**
 * Mostra la pagina con l'URL callback da configurare in Salesforce
 */
function handleShowCallback_() {
  const callbackUrl = getRedirectFromExec_();
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' +
    'body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto;}' +
    'h2{color:#333;}' +
    '.url-box{background:#f5f5f5;padding:15px;border-radius:4px;word-break:break-all;font-size:13px;margin:20px 0;border:1px solid #ddd;}' +
    '.steps{background:#e8f4f8;padding:20px;border-radius:4px;margin-top:20px;}' +
    'ol{margin:10px 0;padding-left:20px;}' +
    'li{margin:8px 0;}' +
    '</style></head><body>' +
    '<h2>Configurazione Callback URL</h2>' +
    '<p>Copia questo URL e incollalo nella Connected App in Salesforce:</p>' +
    '<div class="url-box">' + callbackUrl + '</div>' +
    '<div class="steps">' +
    '<strong>Passi (servono 2 deployment sul master):</strong><ol>' +
    '<li><b>Deploy 1</b> (getToken, startAuth): Esegui come = ME, Chi può accedere = Chiunque</li>' +
    '<li><b>Deploy 2</b> (callback): Esegui come = Utente che accede, Chi può accedere = Chiunque con account Google</li>' +
    '<li>In configuration.gs: WEB_APP_EXEC = URL deploy 1, WEB_APP_CALLBACK = URL deploy 2</li>' +
    '<li>Salesforce Setup → App Manager → External Client App → Edit</li>' +
    '<li>Callback URL: incolla l\'URL sopra</li>' +
    '<li>Salva e attendi 1-2 minuti</li>' +
    '</ol></div>' +
    '</body></html>'
  );
}

/**
 * Gestisce la richiesta di recupero token dalle copie
 * Endpoint: ?action=getToken&email=xxx
 */
function handleGetTokenRequest_(e) {
  const email = e.parameter.email;
  const secret = e.parameter.secret;
  
  if (typeof AUTH_SHARED_SECRET !== 'undefined' && AUTH_SHARED_SECRET) {
    if (secret !== AUTH_SHARED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Autenticazione richiesta non valida'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  if (!email) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Email non specificata'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const token = getTokenCentralized_(email);
    
    if (token) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        token: token
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Token non trovato per questo utente'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * DIAGNOSTICA COMPLETA - Esegui questa funzione per verificare tutto
 */
function diagnosticaCompleta() {
  Logger.log('========================================');
  Logger.log('DIAGNOSTICA COMPLETA AUTORIZZAZIONE');
  Logger.log('========================================');
  
  // 1. Configurazione base
  Logger.log('\n1. CONFIGURAZIONE BASE:');
  Logger.log('   SF_LOGIN: ' + SF_LOGIN);
  Logger.log('   SF_DOMAIN: ' + SF_DOMAIN);
  Logger.log('   CLIENT_ID: ' + CLIENT_ID);
  Logger.log('   CLIENT_SECRET presente: ' + (CLIENT_SECRET ? 'SI (' + CLIENT_SECRET.substring(0, 10) + '...)' : 'NO'));
  Logger.log('   WEB_APP_EXEC: ' + WEB_APP_EXEC);
  if (WEB_APP_EXEC.indexOf('/dev') >= 0) {
    Logger.log('   ⚠️ WEB_APP_EXEC usa /dev. Le copie NON possono raggiungerlo. Usa /exec.');
  }
  if (typeof WEB_APP_CALLBACK !== 'undefined' && WEB_APP_CALLBACK) {
    Logger.log('   WEB_APP_CALLBACK: ' + WEB_APP_CALLBACK);
  }
  
  // 2. URL di callback
  Logger.log('\n2. URL CALLBACK (dove Salesforce reindirizza dopo OAuth):');
  const redirectUri = getRedirectFromExec_();
  Logger.log('   Da WEB_APP_EXEC si ricava .../usercallback (stesso host, path OAuth)');
  Logger.log('   Callback URL: ' + redirectUri);
  Logger.log('   Encoded: ' + encodeURIComponent(redirectUri));
  
  // 3. URL di autorizzazione
  Logger.log('\n3. URL AUTORIZZAZIONE:');
  const authParams = [
    'response_type=code',
    'client_id=' + encodeURIComponent(CLIENT_ID),
    'redirect_uri=' + encodeURIComponent(redirectUri),
    'scope=' + encodeURIComponent('api refresh_token'),
    'prompt=consent'
  ].join('&');
  const authUrl = SF_LOGIN + '/services/oauth2/authorize?' + authParams;
  Logger.log('   URL completo: ' + authUrl);
  
  // 4. Token esistenti
  Logger.log('\n4. TOKEN ESISTENTI:');
  Logger.log('   hasValidToken: ' + (hasValidToken_() ? 'SI' : 'NO'));
  try {
    const token = getStoredToken_();
    if (token) {
      Logger.log('   Token presente: SI');
      Logger.log('   Access token: ' + (token.access_token ? 'SI (' + token.access_token.substring(0, 20) + '...)' : 'NO'));
      Logger.log('   Refresh token: ' + (token.refresh_token ? 'SI' : 'NO'));
      Logger.log('   Instance URL: ' + (token.instance_url || 'N/A'));
    } else {
      Logger.log('   Token presente: NO');
    }
  } catch (e) {
    Logger.log('   Errore lettura token: ' + e.message);
  }
  
  // 5. Verifica deployment
  Logger.log('\n5. DEPLOYMENT:');
  try {
    const scriptUrl = ScriptApp.getService().getUrl();
    Logger.log('   Script URL (questo foglio): ' + (scriptUrl || 'NON DISPONIBILE'));
    if (scriptUrl) {
      const expectedCallback = scriptUrl.replace(/\/(exec|dev)$/, '/usercallback');
      Logger.log('   Callback di questo foglio: ' + expectedCallback);
      const configCallback = redirectUri;
      const isCopy = (expectedCallback !== configCallback);
      if (isCopy) {
        Logger.log('   Rilevata COPIA: usa callback del MASTER (config WEB_APP_EXEC) - normale ✅');
        Logger.log('   Callback OAuth (master): ' + configCallback);
      } else {
        Logger.log('   MASTER: callback coincidono ✅');
      }
    }
  } catch (e) {
    Logger.log('   Errore verifica deployment: ' + e.message);
  }
  
  // 5b. Verifica che i deployment in config siano attivi (non archivistati)
  Logger.log('\n5b. VERIFICA DEPLOYMENT CONFIG (attivi = non archivistati):');
  const urlsToCheck = [[ 'WEB_APP_EXEC', WEB_APP_EXEC ], [ 'WEB_APP_CALLBACK', typeof WEB_APP_CALLBACK !== 'undefined' && WEB_APP_CALLBACK ? WEB_APP_CALLBACK : null ]];
  for (const [name, url] of urlsToCheck) {
    if (!url) { Logger.log('   ' + name + ': non configurato (usa WEB_APP_EXEC)'); continue; }
    try {
      const r = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: false });
      const c = r.getResponseCode();
      const loc = (r.getHeaders()['Location'] || '').toString();
      let status;
      if (c === 200) status = 'Attivo ✅';
      else if (c === 302 && loc.indexOf('accounts.google.com') >= 0) status = 'Redirect a login (ok per callback)';
      else if (c === 404 || c === 410) status = '⚠️ ARCHIVIATO o URL errato - crea nuovo deployment!';
      else if (c === 302) status = 'Redirect → ' + (loc ? loc.substring(0, 50) + '...' : '');
      else status = 'HTTP ' + c;
      Logger.log('   ' + name + ': ' + status);
    } catch (e3) {
      Logger.log('   ' + name + ': Errore - ' + (e3.message || e3));
    }
  }
  
  // 6. Test connessione al master (per le copie)
  let scriptUrlForTest = '';
  try {
    scriptUrlForTest = ScriptApp.getService().getUrl() || '';
  } catch (e) {}
  const configCallbackForTest = getRedirectFromExec_();
  if (scriptUrlForTest && scriptUrlForTest.replace(/\/(exec|dev)$/, '/usercallback') !== configCallbackForTest) {
    Logger.log('\n6. TEST CONNESSIONE AL MASTER (copia):');
    const testEmail = getCurrentUserEmail_();
    Logger.log('   Email utente: ' + (testEmail || '(vuota - impossibile recuperare)'));
    if (testEmail) {
      try {
        const testUrl = WEB_APP_EXEC + '?action=getToken&email=' + encodeURIComponent(testEmail) +
          (typeof AUTH_SHARED_SECRET !== 'undefined' ? '&secret=' + encodeURIComponent(AUTH_SHARED_SECRET || '') : '');
        Logger.log('   Chiamata a: ' + WEB_APP_EXEC + '?action=getToken&email=...');
        const resp = UrlFetchApp.fetch(testUrl, { method: 'get', muteHttpExceptions: true });
        const code = resp.getResponseCode();
        const body = resp.getContentText();
        Logger.log('   HTTP ' + code + ': ' + (body.length > 200 ? body.substring(0, 200) + '...' : body));
        if (code === 200) {
          const j = JSON.parse(body);
          if (j.success && j.token) {
            Logger.log('   Token recuperato dal master: SI ✅');
          } else {
            Logger.log('   Token recuperato: NO - ' + (j.error || 'risposta inattesa'));
            if ((j.error || '').indexOf('non trovato') >= 0) {
              Logger.log('   → Esegui "Autorizza" dal menu e completa OAuth. Loggati come: ' + testEmail);
            }
          }
        } else if (code === 302) {
          Logger.log('   ⚠️ HTTP 302: WEB_APP_EXEC richiede login. Serve deployment con "Chiunque".');
          Logger.log('      "Chiunque" appare solo con "Esegui come: ME". Soluzione: 2 deployment.');
          Logger.log('      Deploy 1 (ME + Chiunque) per getToken/startAuth. Deploy 2 (Utente + Chiunque con account) per callback.');
        } else {
          Logger.log('   Errore: master ha risposto ' + code);
        }
      } catch (e2) {
        Logger.log('   Errore fetch: ' + (e2.message || e2.toString()));
      }
    }
  }
  
  Logger.log('\n========================================');
  Logger.log('COPIA QUESTO OUTPUT E INCOLLALO IN SALESFORCE');
  Logger.log('Callback URL da configurare:');
  Logger.log(redirectUri);
  Logger.log('========================================');
}
