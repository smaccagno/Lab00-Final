public with sharing class FlowUtils {
  /*────────────────────────  METODI PUBBLICI  ────────────────────────*/

  /*──────────────────────── 1) API pubbliche ─────────────────────*/

  @AuraEnabled(cacheable=true)
  public static String convertToJSON(List<SObject> records) {
    try {
      return JSON.serialize(records);
    } catch (Exception e) {
      return '{"error": "' + e.getMessage() + '"}';
    }
  }

  /** Inserisce Visit__c da JSON replicando la logica “Crea Comune”.
   *  Se tipoVisitaId è assente ma è presente il nome (tipoVisita),
   *  crea o riutilizza un record Tipo_Visita__c con quel Name e lo collega.
   */
  @AuraEnabled
  public static List<Id> insertVisitaRecordsFromJSONString(String jsonString) {
    /* ─ 1. Parse e prima validazione */
    if (String.isBlank(jsonString))
      throw new AuraHandledException('Errore: Il JSON in input è vuoto.');
    Object parsedObj = JSON.deserializeUntyped(jsonString);
    if (!(parsedObj instanceof List<Object>))
      throw new AuraHandledException(
        'Errore: Il JSON ricevuto non è una lista.'
      );

    List<Visit__c> visitaRecords = new List<Visit__c>();
    /*  lista “richieste Comune”  { chiave, nome, prov, reg }           */
    List<ComuneRequest> comuniRichiesti = new List<ComuneRequest>();
    /*  nomi Tipo_Visita da garantire (se manca Id) */
    Set<String> tipoNamesToEnsure = new Set<String>();
    /*  parallel list per tenere il nome associato ad ogni Visit */
    List<String> tipoNameByIndex = new List<String>();

    for (Object obj : (List<Object>) parsedObj) {
      if (!(obj instanceof Map<String, Object>))
        continue;
      Map<String, Object> rec = (Map<String, Object>) obj;

      /* ---------- Campi obbligatori Visit__c ---------- */
      if (rec.get('invoiceId') == null)
        throw new AuraHandledException(
          'Errore: Il campo Fattura è obbligatorio.'
        );
      // Richiede almeno un nome per il tipo visita
      if (rec.get('tipoVisita') == null && rec.get('tipoVisitaId') == null)
        throw new AuraHandledException('Errore: Il Tipo Visita è obbligatorio.');

      String nome = (String) rec.get('comune');
      String prov = (String) rec.get('provincia');
      String reg = (String) rec.get('regione');
      if (String.isBlank(nome) || String.isBlank(prov) || String.isBlank(reg))
        throw new AuraHandledException(
          'Errore: Comune, Provincia e Regione sono obbligatori.'
        );

      /* ---------- popolazione Visit__c ---------- */
      Visit__c v = new Visit__c();
      Id invoiceId = toIdSafe(rec.get('invoiceId'));
      if (invoiceId == null)
        throw new AuraHandledException('Errore: Id Fattura non valido o mancante.');
      v.Invoice__c = invoiceId;
      Id tipoId = toIdSafe(rec.get('tipoVisitaId'));
      String tipoName = (String) rec.get('tipoVisita');
      v.Tipo_Visita__c = tipoId; // può essere null: lo risolviamo dopo
      v.Visit_Type__c = tipoName;
      v.Beneficiary_Type__c = (String) rec.get('beneficiaryType');
      v.Quantity__c = toIntegerSafe(rec.get('numeroVisite'));
      v.Duration_in_minutes__c = toIntegerSafe(rec.get('totaleMinuti'));
      v.Amount__c = toDecimalSafe(rec.get('amount'));
      v.Data_della_Visita__c = toDateSafe(rec.get('dataVisita'));
      v.City__c = nome;
      v.Province__c = prov;
      v.Region__c = reg;

      // Validazioni minime lato server per errori chiari
      if (String.isBlank(v.Visit_Type__c))
        throw new AuraHandledException('Errore: Il Nome del Tipo Visita è obbligatorio.');
      if (String.isBlank(v.Beneficiary_Type__c))
        throw new AuraHandledException('Errore: Seleziona il Tipo Beneficiario.');
      if (v.Quantity__c == null || v.Quantity__c <= 0)
        throw new AuraHandledException('Errore: Numero di Visite deve essere maggiore di 0.');
      if (v.Duration_in_minutes__c == null || v.Duration_in_minutes__c <= 0)
        throw new AuraHandledException('Errore: Totale Minuti di Visita deve essere maggiore di 0.');

      visitaRecords.add(v);
      comuniRichiesti.add(new ComuneRequest(nome, prov, reg));
      tipoNameByIndex.add(tipoName);
      if (tipoId == null && !String.isBlank(tipoName))
        tipoNamesToEnsure.add(tipoName.trim());
    }

    /* ─ 2. Up-sert comuni (solo se necessario) */
    Map<String, Comune__c> comuniMap = upsertComuni(comuniRichiesti);
    // Se in futuro vorrai salvare il lookup:
    // for (Visit__c v : visitaRecords)
    //     v.Comune__c = comuniMap.get(buildComuneKey(v.City__c,v.Province__c,v.Region__c)).Id;

    /* ─ 3. Up-sert Tipi Visita mancanti e collega gli Id */
    if (!tipoNamesToEnsure.isEmpty()) {
      Map<String, Id> name2Id = upsertTipoVisiteByName(tipoNamesToEnsure);
      for (Integer i = 0; i < visitaRecords.size(); i++) {
        if (visitaRecords[i].Tipo_Visita__c == null) {
          String n = tipoNameByIndex[i];
          if (!String.isBlank(n)) {
            Id rid = name2Id.get(n.trim().toLowerCase());
            if (rid != null) visitaRecords[i].Tipo_Visita__c = rid;
          }
        }
      }
    }
    // Fallback robusto: se ancora mancasse l'Id ma è presente il nome, tenta un ultimo upsert puntuale
    Set<String> lastMissing = new Set<String>();
    for (Integer i = 0; i < visitaRecords.size(); i++) {
      if (visitaRecords[i].Tipo_Visita__c == null) {
        String n = tipoNameByIndex[i];
        if (!String.isBlank(n)) lastMissing.add(n.trim());
      }
    }
    if (!lastMissing.isEmpty()) {
      Map<String, Id> name2Id2 = upsertTipoVisiteByName(lastMissing);
      for (Integer i = 0; i < visitaRecords.size(); i++) {
        if (visitaRecords[i].Tipo_Visita__c == null) {
          String n = tipoNameByIndex[i];
          if (!String.isBlank(n)) {
            Id rid = name2Id2.get(n.trim().toLowerCase());
            if (rid != null) visitaRecords[i].Tipo_Visita__c = rid;
          }
        }
      }
    }
    // Se per qualche motivo non riusciamo ancora a popolare il lookup, alza errore esplicito
    for (Integer i = 0; i < visitaRecords.size(); i++) {
      if (visitaRecords[i].Tipo_Visita__c == null) {
        throw new AuraHandledException('Errore: Tipo Visita non riconosciuto: ' + (tipoNameByIndex[i] == null ? '' : tipoNameByIndex[i]));
      }
    }

    /* ─ 4. Insert visite & output */
    try {
      insert visitaRecords;
    } catch (DmlException e) {
      // Espone un messaggio leggibile al client
      String msg = e.getDmlMessage(0);
      throw new AuraHandledException('Errore salvataggio Visite: ' + msg);
    }
    List<Id> outIds = new List<Id>();
    for (Visit__c v : visitaRecords)
      outIds.add(v.Id);
    return outIds;
  }

  /** Aggiorna Visit__c esistenti da JSON. Ogni item deve contenere visitId. */
  @AuraEnabled
  public static List<Id> updateVisitaRecordsFromJSONString(String jsonString) {
    if (String.isBlank(jsonString))
      throw new AuraHandledException('Errore: Il JSON in input è vuoto.');
    Object parsedObj = JSON.deserializeUntyped(jsonString);
    if (!(parsedObj instanceof List<Object>))
      throw new AuraHandledException('Errore: Il JSON ricevuto non è una lista.');

    List<Visit__c> updates = new List<Visit__c>();
    List<ComuneRequest> comuniRichiesti = new List<ComuneRequest>();
    Set<String> tipoNamesToEnsure = new Set<String>();
    List<String> tipoNameByIndex = new List<String>();

    for (Object obj : (List<Object>) parsedObj) {
      if (!(obj instanceof Map<String, Object>)) continue;
      Map<String, Object> rec = (Map<String, Object>) obj;
      Id vId = toIdSafe(rec.get('visitId'));
      if (vId == null)
        throw new AuraHandledException('Errore: manca l\'Id della visita da aggiornare.');

      String nome = (String) rec.get('comune');
      String prov = (String) rec.get('provincia');
      String reg = (String) rec.get('regione');
      if (String.isBlank(nome) || String.isBlank(prov) || String.isBlank(reg))
        throw new AuraHandledException('Errore: Comune, Provincia e Regione sono obbligatori.');

      Visit__c v = new Visit__c();
      v.Id = vId;
      Id tipoId = toIdSafe(rec.get('tipoVisitaId'));
      String tipoName = (String) rec.get('tipoVisita');
      if (tipoId != null) v.Tipo_Visita__c = tipoId;
      if (tipoName != null) v.Visit_Type__c = tipoName;
      v.Beneficiary_Type__c = (String) rec.get('beneficiaryType');
      v.Quantity__c = toIntegerSafe(rec.get('numeroVisite'));
      v.Duration_in_minutes__c = toIntegerSafe(rec.get('totaleMinuti'));
      v.Amount__c = toDecimalSafe(rec.get('amount'));
      v.Data_della_Visita__c = toDateSafe(rec.get('dataVisita'));
      v.City__c = nome;
      v.Province__c = prov;
      v.Region__c = reg;
      updates.add(v);
      comuniRichiesti.add(new ComuneRequest(nome, prov, reg));
      tipoNameByIndex.add(tipoName);
      if (tipoId == null && !String.isBlank(tipoName))
        tipoNamesToEnsure.add(tipoName.trim());
    }

    upsertComuni(comuniRichiesti);
    if (!tipoNamesToEnsure.isEmpty()) {
      Map<String, Id> name2Id = upsertTipoVisiteByName(tipoNamesToEnsure);
      for (Integer i = 0; i < updates.size(); i++) {
        if (updates[i].Tipo_Visita__c == null) {
          String n = tipoNameByIndex[i];
          if (!String.isBlank(n)) {
            Id rid = name2Id.get(n.trim().toLowerCase());
            if (rid != null) updates[i].Tipo_Visita__c = rid;
          }
        }
      }
    }
    // Fallback per update
    Set<String> lastMissingUp = new Set<String>();
    for (Integer i = 0; i < updates.size(); i++) {
      if (updates[i].Tipo_Visita__c == null) {
        String n = tipoNameByIndex[i];
        if (!String.isBlank(n)) lastMissingUp.add(n.trim());
      }
    }
    if (!lastMissingUp.isEmpty()) {
      Map<String, Id> name2Id3 = upsertTipoVisiteByName(lastMissingUp);
      for (Integer i = 0; i < updates.size(); i++) {
        if (updates[i].Tipo_Visita__c == null) {
          String n = tipoNameByIndex[i];
          if (!String.isBlank(n)) {
            Id rid = name2Id3.get(n.trim().toLowerCase());
            if (rid != null) updates[i].Tipo_Visita__c = rid;
          }
        }
      }
    }
    try {
      update updates;
    } catch (DmlException e) {
      String msg = e.getDmlMessage(0);
      throw new AuraHandledException('Errore aggiornamento Visite: ' + msg);
    }
    List<Id> ids = new List<Id>();
    for (Visit__c v : updates) ids.add(v.Id);

    // Allinea i valori statici della Fattura Shadow collegata alle visite aggiornate
    alignFatturaShadowStaticValues(new Set<Id>(ids));

    return ids;
  }

  /*──────────────────────── 2) NUOVO helper pubblico ─────────────*/

  /**
   * Riceve una lista di triple (nome, provincia, regione) e restituisce
   * una mappa chiave → record Comune__c contenente sia i record già
   * esistenti sia quelli appena creati.
   */
  public class ComuneRequest {
    public String nome, prov, reg;
    public ComuneRequest(String n, String p, String r) {
      nome = n;
      prov = p;
      reg = r;
    }
  }

  @AuraEnabled(cacheable=true)
  public static Map<String, Comune__c> upsertComuni(List<ComuneRequest> reqs) {
    Map<String, Comune__c> result = new Map<String, Comune__c>();
    if (reqs == null || reqs.isEmpty())
      return result;

    Set<String> nomiDaQuery = new Set<String>();
    for (ComuneRequest cr : reqs) {
      String key = buildComuneKey(cr.nome, cr.prov, cr.reg);
      nomiDaQuery.add(cr.nome);
      // inizialmente mettiamo null, poi lo riempiremo
      if (!result.containsKey(key))
        result.put(key, null);
    }

    /* 1. Query esistenti */
    if (!nomiDaQuery.isEmpty()) {
      for (Comune__c c : [
        SELECT Id, Nome_Comune__c, Provincia__c, Regione__c
        FROM Comune__c
        WHERE Nome_Comune__c IN :nomiDaQuery
      ]) {
        String k = buildComuneKey(
          c.Nome_Comune__c,
          c.Provincia__c,
          c.Regione__c
        );
        result.put(k, c);
      }
    }

    /* 2. Individua quelli da inserire */
    List<Comune__c> toInsert = new List<Comune__c>();
    for (ComuneRequest cr : reqs) {
      String k = buildComuneKey(cr.nome, cr.prov, cr.reg);
      if (result.get(k) == null) {
        Comune__c nc = new Comune__c(
          Nome_Comune__c = cr.nome,
          Provincia__c = cr.prov,
          Regione__c = cr.reg
        );
        toInsert.add(nc);
        result.put(k, nc); // placeholder, verrà ri-id-ato dopo l’insert
      }
    }
    if (!toInsert.isEmpty())
      insert toInsert;

    return result; // contiene i record definitivi (Id incluso)
  }

  /*──────────────────  METODI AUSILIARI  ──────────────────*/

  // Chiave “nome|provincia|regione” case-insensitive
  private static String buildComuneKey(String nome, String prov, String reg) {
    return (String.isBlank(nome) ? '' : nome.trim().toLowerCase()) +
      '|' +
      (String.isBlank(prov) ? '' : prov.trim().toLowerCase()) +
      '|' +
      (String.isBlank(reg) ? '' : reg.trim().toLowerCase());
  }

  // Crea (se mancante) i record Tipo_Visita__c in base al Name e
  // restituisce una mappa nameLowerCase → Id
  private static Map<String, Id> upsertTipoVisiteByName(Set<String> names) {
    Map<String, Id> out = new Map<String, Id>();
    if (names == null || names.isEmpty()) return out;

    // Normalizza input
    Set<String> normalized = new Set<String>();
    for (String n : names)
      if (!String.isBlank(n)) normalized.add(n.trim());

    if (normalized.isEmpty()) return out;

    // 1) Query esistenti per Name OPPURE per campo univoco Tipo_Visita__c
    for (Tipo_Visita__c tv : [
      SELECT Id, Name, Tipo_Visita__c
      FROM Tipo_Visita__c
      WHERE Name IN :normalized OR Tipo_Visita__c IN :normalized
    ]) {
      if (!String.isBlank(tv.Name)) out.put(tv.Name.trim().toLowerCase(), tv.Id);
      if (!String.isBlank(tv.Tipo_Visita__c)) out.put(tv.Tipo_Visita__c.trim().toLowerCase(), tv.Id);
    }

    // 2) Inserisci mancanti: serve valorizzare ANCHE il campo richiesto univoco Tipo_Visita__c
    List<Tipo_Visita__c> toInsert = new List<Tipo_Visita__c>();
    for (String n : normalized) {
      String key = n.trim().toLowerCase();
      if (!out.containsKey(key)) {
        toInsert.add(new Tipo_Visita__c(Name = n, Tipo_Visita__c = n));
      }
    }
    if (!toInsert.isEmpty()) {
      try {
        insert toInsert;
      } catch (DmlException e) {
        // Propaga un errore leggibile
        throw new AuraHandledException('Errore creazione Tipo_Visita__c: ' + e.getDmlMessage(0));
      }
      for (Tipo_Visita__c tv : toInsert) {
        if (!String.isBlank(tv.Name)) out.put(tv.Name.trim().toLowerCase(), tv.Id);
        if (!String.isBlank(tv.Tipo_Visita__c)) out.put(tv.Tipo_Visita__c.trim().toLowerCase(), tv.Id);
      }
    }
    return out;
  }

  private static Integer toIntegerSafe(Object o) {
    if (o == null)
      return 0;
    try {
      return Integer.valueOf(o.toString());
    } catch (Exception e) {
      return 0;
    }
  }

  private static Decimal toDecimalSafe(Object o) {
    if (o == null)
      return 0.00;
    try {
      return Decimal.valueOf(o.toString());
    } catch (Exception e) {
      return 0.00;
    }
  }

  private static Date toDateSafe(Object o) {
    if (o == null)
      return null;
    try {
      return Date.valueOf(o.toString());
    } catch (Exception e) {
      return null;
    }
  }

  // Converte un valore generico in Id se valido, altrimenti null
  private static Id toIdSafe(Object o) {
    if (o == null) return null;
    String s = String.valueOf(o);
    if (String.isBlank(s)) return null;
    try {
      return (Id) s;
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Richiama il Flow "Aggiorna Valori Statici Fattura Shadow" per ciascuna
   * fattura shadow collegata alle visite aggiornate, in modo da riallineare
   * i campi statici dopo la modifica delle visite.
   */
  private static void alignFatturaShadowStaticValues(Set<Id> visitIds) {
    if (visitIds == null || visitIds.isEmpty()) return;

    // 1) Recupera le fatture associate alle visite aggiornate
    Set<Id> invoiceIds = new Set<Id>();
    for (Visit__c v : [
      SELECT Invoice__c
      FROM Visit__c
      WHERE Id IN :visitIds AND Invoice__c != NULL
    ]) {
      invoiceIds.add(v.Invoice__c);
    }

    if (invoiceIds.isEmpty()) return;

    // 2) Recupera le Fattura_Shadow collegate alle fatture
    Set<Id> shadowIds = new Set<Id>();
    Map<Id, Invoice__c> invoiceByShadow = new Map<Id, Invoice__c>();
    for (Invoice__c inv : [
      SELECT Fattura_Shadow__c,
             Totale_Fattura__c,
             Totale_Biglietti__c,
             Total_Number_of_Visits__c,
             Total_Duration_in_minutes__c,
             Overview_Budget_per_Anno__r.Totali_Budget_Anno__c,
             Reporting_Year__r.Totali_Donatore_Anno__c
      FROM Invoice__c
      WHERE Id IN :invoiceIds AND Fattura_Shadow__c != NULL
    ]) {
      if (inv.Fattura_Shadow__c != null) {
        shadowIds.add(inv.Fattura_Shadow__c);
        invoiceByShadow.put(inv.Fattura_Shadow__c, inv);
      }
    }

    if (shadowIds.isEmpty() || Test.isRunningTest()) return;

    // 3) Invoca il Flow per ciascuna Fattura_Shadow
    for (Id shadowId : shadowIds) {
      try {
        Invoice__c inv = invoiceByShadow.get(shadowId);
        Map<String, Object> params = new Map<String, Object>{
          'recordId' => shadowId,
          'input_skip_lookup' => true
        };
        if (inv != null) {
          params.put('input_totale_fattura', inv.Totale_Fattura__c);
          params.put('input_totale_durata', inv.Total_Duration_in_minutes__c);
          params.put('input_totale_visite', inv.Total_Number_of_Visits__c);
          params.put('input_totale_biglietti', inv.Totale_Biglietti__c);
          params.put(
            'input_totali_budget_id',
            inv.Overview_Budget_per_Anno__r != null
              ? inv.Overview_Budget_per_Anno__r.Totali_Budget_Anno__c
              : null
          );
          params.put(
            'input_totali_donatore_id',
            inv.Reporting_Year__r != null
              ? inv.Reporting_Year__r.Totali_Donatore_Anno__c
              : null
          );
        }
        Flow.Interview.Aggiorna_Valori_Statici_Fattura_Shadow_autolaunched flowInstance =
          new Flow.Interview.Aggiorna_Valori_Statici_Fattura_Shadow_autolaunched(params);
        flowInstance.start();
      } catch (Exception e) {
        System.debug('alignFatturaShadowStaticValues – errore su shadow ' + shadowId + ': ' + e.getMessage());
      }
    }
  }

  /*──────────────────────── 3) DELETE visite ─────────────────────*/
  @AuraEnabled
  public static void deleteVisits(List<Id> visitIds) {
    if (visitIds == null || visitIds.isEmpty()) return;
    List<Visit__c> toDelete = [SELECT Id FROM Visit__c WHERE Id IN :visitIds];
    if (!toDelete.isEmpty()) delete toDelete;
  }

  /*──────────────────────── 4) GET visita per precompilazione ───*/
  @AuraEnabled(cacheable=true)
  public static Visit__c getVisitById(Id visitId) {
    if (visitId == null) return null;
    List<Visit__c> res = [
      SELECT Id, Invoice__c, Tipo_Visita__c, Tipo_Visita__r.Name, Visit_Type__c, Beneficiary_Type__c,
             Quantity__c, Duration_in_minutes__c, Amount__c, Data_della_Visita__c,
             City__c, Province__c, Region__c
      FROM Visit__c
      WHERE Id = :visitId
      LIMIT 1
    ];
    return res.isEmpty() ? null : res[0];
  }
}