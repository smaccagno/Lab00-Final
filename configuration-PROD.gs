/**
 * =====================================================
 * CONFIGURAZIONE PRODUZIONE
 * =====================================================
 * 
 * Copia questo contenuto nel file configuration.gs
 * del progetto Google Apps Script di PRODUZIONE
 */

// =====================================================
// SALESFORCE - Configurazione OAuth2
// =====================================================

/**
 * URL di login per Salesforce
 * PRODUZIONE usa login.salesforce.com
 */
const SF_LOGIN = 'https://login.salesforce.com';

/**
 * Dominio specifico della tua org Salesforce PRODUZIONE
 */
const SF_DOMAIN = 'https://fondazionelab00ets.lightning.force.com';

/**
 * Client ID della Connected App in Salesforce PRODUZIONE
 * SOSTITUISCI CON IL CLIENT ID DELLA CONNECTED APP DI PROD
 */
const CLIENT_ID = 'INSERISCI_CLIENT_ID_PROD';

/**
 * Client Secret della Connected App in Salesforce PRODUZIONE
 * SOSTITUISCI CON IL CLIENT SECRET DELLA CONNECTED APP DI PROD
 */
const CLIENT_SECRET = 'INSERISCI_CLIENT_SECRET_PROD';

/**
 * Versione API Salesforce da utilizzare
 */
const SF_API_VERSION = 'v60.0';

// =====================================================
// GOOGLE APPS SCRIPT - Configurazione Web App
// =====================================================

/**
 * URL del deployment della Web App PRODUZIONE (termina con /exec)
 * SOSTITUISCI CON L'URL DEL DEPLOYMENT DELLA WEB APP DI PROD
 */
const WEB_APP_EXEC = 'INSERISCI_URL_WEB_APP_PROD/exec';

// =====================================================
// GOOGLE SHEETS - Nomi degli Sheet
// =====================================================

/**
 * Nome dello sheet che contiene i dati di validazione (dropdown)
 */
const SHEET_VALIDAZIONE_DATI = 'Validazione Dati';

/**
 * Nome dello sheet che contiene i dati da validare/esportare
 */
const SHEET_RENDICONTAZIONE = 'Rendicontazione';

// =====================================================
// SALESFORCE LIGHTNING - URL Componenti
// =====================================================

/**
 * URL del componente InvoiceExcelEditor in Salesforce PRODUZIONE
 */
const INVOICE_EXCEL_EDITOR_URL = 'https://fondazionelab00ets.lightning.force.com/lightning/n/InvoiceExcelEditor';
