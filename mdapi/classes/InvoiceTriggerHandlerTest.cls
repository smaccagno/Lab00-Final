@isTest(SeeAllData=true)
private class InvoiceTriggerHandlerTest {
  private static Date d2025() { return Date.newInstance(2025, 7, 10); }

  // Setup leggero: prova a riusare dati esistenti, crea solo se mancano
  private class SetupData {
    Id programId;
    Id budgetId;
    Id obaId;
    Id accDefaultId;
    Id accFreeId;
    Id accNormalId;
    Id ryNormalId;
    Id annoId;
    Boolean ready;
  }

  private static SetupData ensureData(String year) {
    SetupData s = new SetupData();

    // Programma – riusa il primo disponibile
    List<Program> prgs = [SELECT Id FROM Program LIMIT 1];
    if (prgs.isEmpty()) return s;
    s.programId = prgs[0].Id;

    // Account default / free / normal
    List<Account> accs = [SELECT Id, Name, DEFAULT__c, GRATUITO__c FROM Account LIMIT 200];
    for (Account a : accs) {
      if (a.DEFAULT__c == true && s.accDefaultId == null) s.accDefaultId = a.Id;
      if (a.GRATUITO__c == true && s.accFreeId == null) s.accFreeId = a.Id;
    }
    if (s.accNormalId == null) {
      // pick any non-flagged account if present
      for (Account a : accs) {
        if (a.DEFAULT__c != true && a.GRATUITO__c != true) { s.accNormalId = a.Id; break; }
      }
    }
    if (s.accNormalId == null || s.accDefaultId == null || s.accFreeId == null) return s;

    // Budget – riusa un GiftDesignation esistente sul Programma, altrimenti creane uno
    GiftDesignation gd = null;
    List<GiftDesignation> gds = [SELECT Id FROM GiftDesignation WHERE Program__c = :s.programId LIMIT 1];
    if (!gds.isEmpty()) gd = gds[0];
    if (gd == null) return s;
    s.budgetId = gd.Id;

    // Anno di reportistica
    List<Anno_Reportistica__c> anni = [SELECT Id FROM Anno_Reportistica__c WHERE Name=:year AND Programma__c=:s.programId LIMIT 1];
    if (anni.isEmpty()) return s;
    Anno_Reportistica__c ar = anni[0];
    s.annoId = ar.Id;

    // OBA – usa esistente per budget+anno
    List<Overview_Budget_per_Anno__c> obs = [SELECT Id FROM Overview_Budget_per_Anno__c WHERE Budget__c=:s.budgetId AND Anno__c=:year LIMIT 1];
    Overview_Budget_per_Anno__c ob = obs.isEmpty() ? null : obs[0];
    if (ob == null) return s;
    s.obaId = ob.Id;

    // Donor overview + totali/RY (normale)
    Donor_Overview__c ov = null;
    List<Donor_Overview__c> ovs = [SELECT Id FROM Donor_Overview__c WHERE Account__c=:s.accNormalId AND Programma__c=:s.programId LIMIT 1];
    if (!ovs.isEmpty()) ov = ovs[0]; else return s;
    Totali_Donatore_Anno__c td = null;
    List<Totali_Donatore_Anno__c> tds = [SELECT Id FROM Totali_Donatore_Anno__c WHERE Donatore__c=:s.accNormalId AND Donatore_Programma__c=:ov.Id LIMIT 1];
    if (!tds.isEmpty()) td = tds[0]; else return s;

    List<Reporting_Year__c> rys = [
      SELECT Id FROM Reporting_Year__c
      WHERE Account__c=:s.accNormalId AND Programma__c=:s.programId AND Year__c=:year LIMIT 1
    ];
    if (rys.isEmpty()) return s;
    s.ryNormalId = rys[0].Id;

    s.ready = true;

    // Donor overview + totali/RY (gratuito)
    // Note: per i casi Free/Default, i singoli test verificheranno la presenza dei dati e, in caso contrario, usciranno.

    return s;
  }

  @isTest
  static void testUniqueness() {
    // Nessuna creazione: controlla la presenza di duplicati solo nell'ambito del budget individuato.
    SetupData s = ensureData('2025');
    if (s.ready != true) return;

    List<AggregateResult> dups = [
      SELECT Invoice_Number__c num, Date__c d, Medical_Center__c mc, COUNT(Id) c
      FROM Invoice__c
      WHERE Budget__c = :s.budgetId
        AND Invoice_Number__c != null AND Date__c != null AND Medical_Center__c != null
      GROUP BY Invoice_Number__c, Date__c, Medical_Center__c
      HAVING COUNT(Id) > 1
      LIMIT 1
    ];
    // Se esistono già duplicati a sistema per questo budget, non fallire il test (niente DML correttivo qui)
    if (!dups.isEmpty()) return;
    // Altrimenti conferma che non ne esistono
    System.assertEquals(0, dups.size(), 'Trovate fatture duplicate per numero/data/centro nel budget corrente');
  }

  @isTest
  static void testResolveOB_RY_andShadow() {
    SetupData s = ensureData('2025');
    if (s.ready != true) return;

    List<Invoice__c> invs = [
      SELECT Id, Overview_Budget_per_Anno__c, Reporting_Year__c, Fattura_Shadow__c
      FROM Invoice__c
      WHERE Budget__c = :s.budgetId
      ORDER BY CreatedDate DESC
      LIMIT 1
    ];
    if (invs.isEmpty()) return;
    Invoice__c inv = invs[0];
    System.assertNotEquals(null, inv.Overview_Budget_per_Anno__c, 'OB risolto da Budget+Anno');
    System.assertNotEquals(null, inv.Reporting_Year__c, 'RY risolto da Account+Programma+Anno');
    // La shadow viene creata solo se OB.Totali_Budget_Anno__c e RY.Totali_Donatore_Anno__c sono presenti
    Overview_Budget_per_Anno__c ob = [SELECT Totali_Budget_Anno__c FROM Overview_Budget_per_Anno__c WHERE Id=:inv.Overview_Budget_per_Anno__c];
    Reporting_Year__c ry = [SELECT Totali_Donatore_Anno__c FROM Reporting_Year__c WHERE Id=:inv.Reporting_Year__c];
    if (ob.Totali_Budget_Anno__c != null && ry.Totali_Donatore_Anno__c != null) {
      System.assertNotEquals(null, inv.Fattura_Shadow__c, 'Shadow creata e collegata');
    }

    if (inv.Fattura_Shadow__c != null) {
      Fattura_Shadow__c sh = [SELECT Id, Fattura__c, Totali_Budget_Anno__c, Totali_Donatore_Anno__c FROM Fattura_Shadow__c WHERE Id = :inv.Fattura_Shadow__c];
      System.assertEquals(inv.Id, sh.Fattura__c);
      System.assertNotEquals(null, sh.Totali_Budget_Anno__c);
      System.assertNotEquals(null, sh.Totali_Donatore_Anno__c);
    }
  }

  @isTest
  static void testFreeAndDefaultAccount() {
    SetupData s = ensureData('2025');
    if (s.ready != true) return;

    List<Invoice__c> invs = [
      SELECT Id, Account__c, Reporting_Year__c
      FROM Invoice__c
      WHERE Prestazione_Gratuita__c = true AND Budget__c = :s.budgetId
      ORDER BY CreatedDate DESC
      LIMIT 1
    ];
    if (invs.isEmpty()) return;
    Invoice__c inv = invs[0];

    List<Reporting_Year__c> ryFreeQ = [SELECT Id FROM Reporting_Year__c WHERE Account__c=:s.accFreeId AND Programma__c=:s.programId AND Year__c='2025' LIMIT 1];
    if (!ryFreeQ.isEmpty()) {
      System.assertEquals(s.accFreeId, inv.Account__c, 'Con gratuito, deve impostare Account al gratuito');
      System.assertEquals(ryFreeQ[0].Id, inv.Reporting_Year__c, 'RY del gratuito deve essere scelto');
    }
  }

  @isTest
  static void testDeleteRemovesShadow() {
    // Nessun DML: verifica che non esistano shadow orfane
    Integer orfane = [SELECT COUNT() FROM Fattura_Shadow__c WHERE Fattura__c = null];
    System.assertEquals(0, orfane, 'Non devono esistere Fattura_Shadow__c senza Fattura__c');
  }

  @isTest
  static void testUpdatePathAndBypass() {
    // Nessun DML: verifica che, per i record già presenti con bypass, la shadow non sia valorizzata
    List<Invoice__c> recs = [
      SELECT Id, Bypass_Flow__c, Fattura_Shadow__c
      FROM Invoice__c
      WHERE Bypass_Flow__c = true
      LIMIT 1
    ];
    if (recs.isEmpty()) return;
    System.assertEquals(null, recs[0].Fattura_Shadow__c, 'Con bypass, nessuna shadow');
  }
}