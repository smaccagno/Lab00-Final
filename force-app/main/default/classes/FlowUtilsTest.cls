@IsTest(SeeAllData=true)
private class FlowUtilsTest {
  /*────────────── Helper utility comuni al test ─────────────*/
  private static String pickFirst(Schema.SObjectField f) {
    List<Schema.PicklistEntry> vals = f.getDescribe().getPicklistValues();
    return vals.isEmpty() ? null : vals[0].getValue();
  }
  private static Tipo_Visita__c ensureTipo() {
    List<Tipo_Visita__c> tv = [SELECT Id, Name FROM Tipo_Visita__c LIMIT 1];
    if (!tv.isEmpty())
      return tv[0];
    try {
      Tipo_Visita__c rec = new Tipo_Visita__c(Name = 'Tipo-UT');
      insert rec;
      return rec;
    } catch (Exception e) {
      return null;
    }
  }
  private static String provSafe() {
    String p = pickFirst(Invoice__c.Province__c);
    return String.isBlank(p) ? 'PR' : p;
  }
  private static String regSafe() {
    String r = pickFirst(Invoice__c.Region__c);
    return String.isBlank(r) ? 'RG' : r;
  }

  /*────────────────── 1) convertToJSON ──────────────────────*/
  @IsTest
  static void convertToJSON_ok() {
    Account a = new Account(Name = 'ACC-JSON');
    insert a;
    String js = FlowUtils.convertToJSON(new List<SObject>{ a });
    System.assert(js.startsWith('[') && js.contains(a.Id));
  }

  /*────────────────── 2) insertVisita – input malformato ────*/
  @IsTest
  static void insertVisita_errors() {
    /* ①  input che DEVONO generare AuraHandledException */
    for (String badJson : new List<String>{ '', '{"a":1}' }) {
      Boolean raised = false;
      try {
        FlowUtils.insertVisitaRecordsFromJSONString(badJson);
      } catch (AuraHandledException e) {
        raised = true;
      }
      System.assert(raised, 'Doveva fallire per input: ' + badJson);
    }

    /* ②  lista di primitivi: non più errore, deve restituire size = 0 */
    List<Id> ids = FlowUtils.insertVisitaRecordsFromJSONString('["p","q"]');
    System.assertEquals(
      0,
      ids.size(),
      'Con lista di primitivi deve restituire 0 record creati'
    );
  }

  /*────────────────── 3) JSON senza invoiceId ───────────────*/
  @IsTest
  static void insertVisita_missingInvoice() {
    Tipo_Visita__c tv = ensureTipo();
    if (tv == null)
      return;
    String json =
      '[{"tipoVisitaId":"' +
      tv.Id +
      '","tipoVisita":"' +
      tv.Name +
      '","comune":"Roma","provincia":"' +
      provSafe() +
      '","regione":"' +
      regSafe() +
      '"}]';
    Boolean raised = false;
    try {
      FlowUtils.insertVisitaRecordsFromJSONString(json);
    } catch (Exception e) {
      raised = true;
    }
    System.assert(raised);
  }

  /*────────────────── 4) Inserimento completo OK ────────────*/
  @IsTest
  static void insertVisita_success() {
    Account acc = new Account(Name = 'ACC-UT');
    insert acc;
    GiftDesignation gd = new GiftDesignation(
      Name = 'GD-UT',
      Partner__c = acc.Id
    );
    insert gd;
    Invoice__c inv = new Invoice__c(
      Account__c = acc.Id,
      Budget__c = gd.Id,
      Province__c = provSafe(),
      Region__c = regSafe(),
      Invoice_Number__c = 'INV-UT'
    );
    insert inv;
    Tipo_Visita__c tv = ensureTipo();
    if (tv == null)
      return;

    String json =
      '[{"invoiceId":"' +
      inv.Id +
      '","tipoVisitaId":"' +
      tv.Id +
      '","tipoVisita":"' +
      tv.Name +
      '","beneficiaryType":"' +
      pickFirst(Visit__c.Beneficiary_Type__c) +
      '","numeroVisite":1,' +
      '"totaleMinuti":10,"amount":5,"dataVisita":"' +
      Date.today().format() +
      '","comune":"TestVille","provincia":"' +
      provSafe() +
      '","regione":"' +
      regSafe() +
      '"}]';

    List<Id> ids = FlowUtils.insertVisitaRecordsFromJSONString(json);
    System.assertEquals(1, ids.size());
    Visit__c v = [
      SELECT Invoice__c, Tipo_Visita__c, City__c
      FROM Visit__c
      WHERE Id = :ids[0]
    ];
    System.assertEquals(inv.Id, v.Invoice__c);
    System.assertEquals(tv.Id, v.Tipo_Visita__c);
    System.assertEquals('TestVille', v.City__c);
  }

  /*────────────────── 5) invoiceId inesistente ──────────────*/
  @IsTest
  static void insertVisita_invalidInvoice() {
    Tipo_Visita__c tv = ensureTipo();
    if (tv == null)
      return;
    String json =
      '[{"invoiceId":"001000000000000AAA","tipoVisitaId":"' +
      tv.Id +
      '","tipoVisita":"' +
      tv.Name +
      '","comune":"GhostTown","provincia":"' +
      provSafe() +
      '","regione":"' +
      regSafe() +
      '"}]';
    Boolean raised = false;
    try {
      FlowUtils.insertVisitaRecordsFromJSONString(json);
    } catch (Exception e) {
      raised = true;
    }
    System.assert(raised);
  }

  /*────────────────── 6) upsertComuni – lista vuota ─────────*/
  @IsTest
  static void upsertComuni_empty() {
    Map<String, Comune__c> m1 = FlowUtils.upsertComuni(
      new List<FlowUtils.ComuneRequest>()
    );
    System.assertEquals(0, m1.size());
  }

  /*────────────────── 7) upsertComuni – insert & riuso ──────*/
  @IsTest
  static void upsertComuni_insertAndReuse() {
    String nome =
      'UTComune' + String.valueOf(Math.mod(DateTime.now().getTime(), 100000));
    String prov = provSafe(), reg = regSafe();
    FlowUtils.ComuneRequest req = new FlowUtils.ComuneRequest(nome, prov, reg);

    /* prima esecuzione: inserisce */
    Map<String, Comune__c> first = FlowUtils.upsertComuni(
      new List<FlowUtils.ComuneRequest>{ req }
    );
    String key = (nome.trim().toLowerCase() +
    '|' +
    prov.trim().toLowerCase() +
    '|' +
    reg.trim().toLowerCase());
    System.assert(first.containsKey(key) && first.get(key).Id != null);

    Id createdId = first.get(key).Id;

    /* seconda esecuzione: deve ri-utilizzare lo stesso record */
    Map<String, Comune__c> second = FlowUtils.upsertComuni(
      new List<FlowUtils.ComuneRequest>{ req }
    );
    System.assertEquals(
      createdId,
      second.get(key).Id,
      'La seconda chiamata deve restituire lo stesso Comune (no duplicati)'
    );
  }

  /*────────────────── 8) updateVisita – successo ───────────*/
  @IsTest
  static void updateVisita_success() {
    Account acc = new Account(Name = 'ACC-UPD');
    insert acc;
    GiftDesignation gd = new GiftDesignation(Name = 'GD-UPD', Partner__c = acc.Id);
    insert gd;
    Invoice__c inv = new Invoice__c(
      Account__c = acc.Id,
      Budget__c = gd.Id,
      Province__c = provSafe(),
      Region__c = regSafe(),
      Invoice_Number__c = 'INV-UPD'
    );
    insert inv;

    Tipo_Visita__c tv = ensureTipo();
    if (tv == null) return;

    String jsonIns = '[{"invoiceId":"' + inv.Id + '",' +
      '"tipoVisitaId":"' + tv.Id + '",' +
      '"tipoVisita":"' + tv.Name + '",' +
      '"beneficiaryType":"' + pickFirst(Visit__c.Beneficiary_Type__c) + '",' +
      '"numeroVisite":1,"totaleMinuti":10,"amount":5,' +
      '"dataVisita":"' + Date.today().format() + '",' +
      '"comune":"CittaUpd","provincia":"' + provSafe() + '",' +
      '"regione":"' + regSafe() + '"}]';

    List<Id> ids = FlowUtils.insertVisitaRecordsFromJSONString(jsonIns);
    System.assertEquals(1, ids.size(), 'Inserimento visita preliminare fallito');

    // Aggiorna quantità/minuti/amount e città
    String jsonUpd = '[{"visitId":"' + ids[0] + '",' +
      '"tipoVisita":"' + tv.Name + '",' +
      '"beneficiaryType":"' + pickFirst(Visit__c.Beneficiary_Type__c) + '",' +
      '"numeroVisite":3,"totaleMinuti":30,"amount":12,' +
      '"dataVisita":"' + Date.today().addDays(1).format() + '",' +
      '"comune":"NuovaCitta","provincia":"' + provSafe() + '",' +
      '"regione":"' + regSafe() + '"}]';

    List<Id> updIds = FlowUtils.updateVisitaRecordsFromJSONString(jsonUpd);
    System.assertEquals(1, updIds.size());

    Visit__c after = [
      SELECT Quantity__c, Duration_in_minutes__c, Amount__c, City__c, Data_della_Visita__c
      FROM Visit__c WHERE Id = :ids[0]
    ];
    System.assertEquals(3, after.Quantity__c);
    System.assertEquals(30, after.Duration_in_minutes__c);
    System.assertEquals(12, Integer.valueOf(String.valueOf(after.Amount__c)));
    System.assertEquals('NuovaCitta', after.City__c);

    // getVisitById
    Visit__c fetched = FlowUtils.getVisitById(ids[0]);
    System.assertNotEquals(null, fetched);
    System.assertEquals(after.City__c, fetched.City__c);

    // deleteVisits
    FlowUtils.deleteVisits(new List<Id>{ ids[0] });
    System.assertEquals(0, [SELECT COUNT() FROM Visit__c WHERE Id = :ids[0]]);
  }

  /*────────────────── 9) getVisitById / deleteVisits – edge ─────*/
  @IsTest
  static void getVisit_delete_edge() {
    System.assertEquals(null, FlowUtils.getVisitById(null));
    // deleteVisits con lista vuota/non nulla non deve fallire
    FlowUtils.deleteVisits(new List<Id>());
  }
}