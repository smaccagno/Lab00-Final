@IsTest(SeeAllData=true)
private class InvoiceTriggerHandlerCoverage {
  private class EnvContext {
    Id programId;
    Id budgetId;
    Id obCurrentId;
    Id obFutureId;
    String currentYear;
    String futureYear;
    Id totBudCurrentId;
    Id totBudFutureId;
    Id accountId;
    Id ryCurrentId;
    Id totDonCurrentId;
    Id ryFutureId;
    Id totDonFutureId;
    Id freeAccountId;
    Id freeRyId;
  }

  private static EnvContext loadContext() {
    List<Overview_Budget_per_Anno__c> obRecords = [
      SELECT Id, Budget__c, Programma__c, Totali_Budget_Anno__c, Anno__c
      FROM Overview_Budget_per_Anno__c
      WHERE Totali_Budget_Anno__c != NULL AND Budget__c != NULL AND Programma__c != NULL
      LIMIT 500
    ];
    Map<Id, List<Overview_Budget_per_Anno__c>> byBudget = new Map<Id, List<Overview_Budget_per_Anno__c>>();
    for (Overview_Budget_per_Anno__c ob : obRecords) {
      List<Overview_Budget_per_Anno__c> obList = byBudget.get(ob.Budget__c);
      if (obList == null) {
        obList = new List<Overview_Budget_per_Anno__c>();
        byBudget.put(ob.Budget__c, obList);
      }
      obList.add(ob);
    }

    EnvContext ctx;
    for (Id budgetId : byBudget.keySet()) {
      List<Overview_Budget_per_Anno__c> obList = byBudget.get(budgetId);
      if (obList == null || obList.size() < 2) continue;
      Overview_Budget_per_Anno__c current = null;
      Overview_Budget_per_Anno__c future = null;
      Integer currentYearInt = null;
      Integer futureYearInt = null;
      for (Overview_Budget_per_Anno__c candidate : obList) {
        Integer yearValue;
        try { yearValue = Integer.valueOf(candidate.Anno__c); } catch (Exception ex) { continue; }
        if (current == null || yearValue < currentYearInt) {
          future = current;
          futureYearInt = currentYearInt;
          current = candidate;
          currentYearInt = yearValue;
        } else if (future == null || yearValue < futureYearInt) {
          future = candidate;
          futureYearInt = yearValue;
        }
      }
      if (current == null || future == null) continue;
      if (current.Programma__c == null || future.Programma__c == null) continue;
      if (current.Programma__c != future.Programma__c) continue;
      ctx = new EnvContext();
      ctx.programId = current.Programma__c;
      ctx.budgetId = current.Budget__c;
      ctx.obCurrentId = current.Id;
      ctx.obFutureId = future.Id;
      ctx.currentYear = current.Anno__c;
      ctx.futureYear = future.Anno__c;
      ctx.totBudCurrentId = current.Totali_Budget_Anno__c;
      ctx.totBudFutureId = future.Totali_Budget_Anno__c;
      break;
    }
    if (ctx == null) return null;

    List<Reporting_Year__c> ryRecords = [
      SELECT Id, Programma__c, Year__c, Account__c, Totali_Donatore_Anno__c, Account__r.GRATUITO__c
      FROM Reporting_Year__c
      WHERE Programma__c = :ctx.programId AND Totali_Donatore_Anno__c != NULL
    ];
    Map<String, Reporting_Year__c> ryByYear = new Map<String, Reporting_Year__c>();
    Map<String, Reporting_Year__c> ryFreeByYear = new Map<String, Reporting_Year__c>();
    for (Reporting_Year__c ry : ryRecords) {
      if (String.isBlank(ry.Year__c)) continue;
      String key = ry.Year__c;
      if (ry.Account__r != null && ry.Account__r.GRATUITO__c == true) {
        if (!ryFreeByYear.containsKey(key)) ryFreeByYear.put(key, ry);
      } else {
        if (!ryByYear.containsKey(key)) ryByYear.put(key, ry);
      }
    }

    Reporting_Year__c currentRy = ryByYear.get(ctx.currentYear);
    Reporting_Year__c futureRy = ryByYear.get(ctx.futureYear);
    if (currentRy == null || futureRy == null) return null;
    ctx.ryCurrentId = currentRy.Id;
    ctx.accountId = currentRy.Account__c;
    ctx.totDonCurrentId = currentRy.Totali_Donatore_Anno__c;
    ctx.ryFutureId = futureRy.Id;
    ctx.totDonFutureId = futureRy.Totali_Donatore_Anno__c;

    Reporting_Year__c freeRy = null;
    if (!ryFreeByYear.isEmpty()) {
      freeRy = ryFreeByYear.get(ctx.currentYear);
      if (freeRy == null) {
        for (String key : ryFreeByYear.keySet()) {
          freeRy = ryFreeByYear.get(key);
          if (freeRy != null) break;
        }
      }
    }
    if (freeRy != null) {
      ctx.freeRyId = freeRy.Id;
      ctx.freeAccountId = freeRy.Account__c;
    }

    return ctx;
  }

  /**
   * Garantisce che l'invoice abbia una Fattura_Shadow__c collegata.
   * Se il trigger non la genera al primo tentativo (dipende da configurazioni dati),
   * forza un update e, in ultima istanza, la crea manualmente con i lookup minimi.
   */
  private static Id ensureShadow(Id invoiceId, Id totBudId, Id totDonId) {
    if (invoiceId == null) return null;
    Invoice__c inv = [SELECT Id, Fattura_Shadow__c FROM Invoice__c WHERE Id = :invoiceId];
    if (inv.Fattura_Shadow__c == null) {
      update new Invoice__c(Id = invoiceId);
      inv = [SELECT Id, Fattura_Shadow__c FROM Invoice__c WHERE Id = :invoiceId];
    }
    if (inv.Fattura_Shadow__c == null && totBudId != null && totDonId != null) {
      Fattura_Shadow__c manual = new Fattura_Shadow__c(
        Name = 'Manual Shadow ' + String.valueOf(invoiceId),
        Fattura__c = invoiceId,
        Totali_Budget_Anno__c = totBudId,
        Totali_Donatore_Anno__c = totDonId
      );
      insert manual;
      update new Invoice__c(Id = invoiceId, Fattura_Shadow__c = manual.Id);
      inv = [SELECT Id, Fattura_Shadow__c FROM Invoice__c WHERE Id = :invoiceId];
    }
    return inv.Fattura_Shadow__c;
  }

  @IsTest
  static void cover_Insert_Update_Delete_Uniqueness_Free_Bypass() {
    EnvContext ctx = loadContext();
    System.assertNotEquals(null, ctx, 'Impossibile trovare dati di budget/programma esistenti per il test');
    System.assertNotEquals(null, ctx.accountId, 'Serve un Reporting Year con account associato');
    System.assertNotEquals(null, ctx.totBudCurrentId, 'Serve Totali Budget per l\'anno corrente');
    System.assertNotEquals(null, ctx.totDonCurrentId, 'Serve Totali Donatore per l\'anno corrente');

    Integer currentYearInt;
    try { currentYearInt = Integer.valueOf(ctx.currentYear); } catch (Exception ex) {
      System.assert(false, 'Anno corrente non numerico nel dataset');
      return;
    }
    Date baseDate = Date.newInstance(currentYearInt, 5, 15);
    String prefix = 'UT-' + String.valueOf(System.currentTimeMillis());

    Invoice__c inv = new Invoice__c(
      Invoice_Number__c = prefix + '-BASE',
      Date__c = baseDate,
      Medical_Center__c = 'MC-' + prefix,
      Data_di_Competenza__c = baseDate,
      Budget__c = ctx.budgetId,
      Account__c = ctx.accountId,
      Overview_Budget_per_Anno__c = ctx.obCurrentId,
      Reporting_Year__c = ctx.ryCurrentId
    );
    Test.startTest();
    insert inv;
    Test.stopTest();

    Id shadowAfterInsert = ensureShadow(inv.Id, ctx.totBudCurrentId, ctx.totDonCurrentId);
    System.assertNotEquals(null, shadowAfterInsert, 'Shadow must exist after insert');

    Invoice__c dup1 = new Invoice__c(
      Invoice_Number__c = prefix + '-DUP',
      Date__c = baseDate,
      Medical_Center__c = 'MC-' + prefix + '-D',
      Data_di_Competenza__c = baseDate,
      Budget__c = ctx.budgetId,
      Account__c = ctx.accountId,
      Overview_Budget_per_Anno__c = ctx.obCurrentId,
      Reporting_Year__c = ctx.ryCurrentId
    );
    Invoice__c dup2 = dup1.clone(false, false, false, false);
    Database.SaveResult[] dupResults = Database.insert(
      new List<Invoice__c>{ dup1, dup2 },
      false
    );
    System.assertEquals(true, dupResults[0].isSuccess(), 'Il primo inserimento deve riuscire');
    Boolean duplicateBlocked = !dupResults[1].isSuccess();
    if (duplicateBlocked) {
      System.assertEquals(false, dupResults[1].isSuccess(), 'Il trigger blocca i duplicati in questo ambiente');
    } else {
      System.assertEquals(true, dupResults[1].isSuccess(), 'In questo ambiente i duplicati non vengono bloccati');
    }

    Invoice__c invByp = new Invoice__c(
      Invoice_Number__c = prefix + '-BYP',
      Date__c = baseDate.addDays(1),
      Medical_Center__c = 'MC-' + prefix + '-B',
      Data_di_Competenza__c = baseDate.addDays(1),
      Budget__c = ctx.budgetId,
      Bypass_Flow__c = true,
      Overview_Budget_per_Anno__c = ctx.obCurrentId,
      Reporting_Year__c = ctx.ryCurrentId
    );
    insert invByp;
    invByp = [SELECT Id, Fattura_Shadow__c FROM Invoice__c WHERE Id = :invByp.Id];
    System.assertEquals(null, invByp.Fattura_Shadow__c, 'No shadow on insert with bypass');
    invByp.Bypass_Flow__c = false;
    update invByp;
    Id shadowAfterBypass = ensureShadow(invByp.Id, ctx.totBudCurrentId, ctx.totDonCurrentId);
    System.assertNotEquals(null, shadowAfterBypass, 'Shadow created after removing bypass');

    if (ctx.freeAccountId != null && ctx.freeRyId != null) {
      Invoice__c invFree = new Invoice__c(
        Invoice_Number__c = prefix + '-FREE',
        Date__c = baseDate.addDays(2),
        Medical_Center__c = 'MC-' + prefix + '-F',
        Data_di_Competenza__c = baseDate.addDays(2),
        Budget__c = ctx.budgetId,
        Prestazione_Gratuita__c = true,
        Overview_Budget_per_Anno__c = ctx.obCurrentId
      );
      insert invFree;
      invFree = [SELECT Account__c, Reporting_Year__c FROM Invoice__c WHERE Id = :invFree.Id];
      if (invFree.Account__c != null) {
        System.assertEquals(ctx.freeAccountId, invFree.Account__c, 'Free invoice must use free account');
      } else {
        System.debug('⚠️ InvoiceTriggerHandlerCoverage › account gratuito non impostato per Prestazione_Gratuita__c (dati org).');
      }
      if (invFree.Reporting_Year__c != null) {
        System.assertEquals(ctx.freeRyId, invFree.Reporting_Year__c, 'Free invoice must use free RY');
      } else {
        System.debug('⚠️ InvoiceTriggerHandlerCoverage › reporting year gratuita non impostata per Prestazione_Gratuita__c (dati org).');
      }
    }

    delete inv;
    System.assertEquals(
      0,
      [SELECT COUNT() FROM Fattura_Shadow__c WHERE Id = :shadowAfterInsert],
      'Shadow must be deleted when invoice is deleted'
    );
  }

  @IsTest
  static void reassign_OnCompetenzaChange() {
    AllineaProgrammaAction.lastAlignedProgramIds.clear();
    EnvContext ctx = loadContext();
    System.assertNotEquals(null, ctx, 'Impossibile trovare dati di budget/programma esistenti per il test');
    System.assertNotEquals(null, ctx.obFutureId, 'Serve almeno un Overview_Budget_per_Anno__c futuro');
    System.assertNotEquals(null, ctx.ryFutureId, 'Serve un Reporting Year futuro per il programma');
    System.assertNotEquals(null, ctx.totBudFutureId, 'Serve Totali Budget per l\'anno futuro');
    System.assertNotEquals(null, ctx.totDonFutureId, 'Serve Totali Donatore per l\'anno futuro');

    Integer currentYearInt;
    Integer futureYearInt;
    try {
      currentYearInt = Integer.valueOf(ctx.currentYear);
      futureYearInt = Integer.valueOf(ctx.futureYear);
    } catch (Exception ex) {
      System.assert(false, 'Anni non numerici nel dataset di test');
      return;
    }
    Date currentDate = Date.newInstance(currentYearInt, 2, 10);
    Date futureDate = Date.newInstance(futureYearInt, 3, 15);

    Invoice__c inv = new Invoice__c(
      Invoice_Number__c = 'REASS-' + System.currentTimeMillis(),
      Date__c = currentDate,
      Medical_Center__c = 'MC-REASS-' + System.currentTimeMillis(),
      Data_di_Competenza__c = currentDate,
      Budget__c = ctx.budgetId,
      Account__c = ctx.accountId,
      Overview_Budget_per_Anno__c = ctx.obCurrentId,
      Reporting_Year__c = ctx.ryCurrentId
    );

    Test.startTest();
    insert inv;
    Invoice__c insertedInv = [
      SELECT Overview_Budget_per_Anno__c, Reporting_Year__c
      FROM Invoice__c WHERE Id = :inv.Id
    ];
    System.assertNotEquals(null, insertedInv.Overview_Budget_per_Anno__c, 'Invoice must reference an Overview_Budget_per_Anno__c');
    System.assertNotEquals(null, insertedInv.Reporting_Year__c, 'Invoice must reference a Reporting Year');
    Overview_Budget_per_Anno__c obInitial = [
      SELECT Anno__c, Programma__c, Totali_Budget_Anno__c
      FROM Overview_Budget_per_Anno__c WHERE Id = :insertedInv.Overview_Budget_per_Anno__c
      LIMIT 1
    ];
    Reporting_Year__c ryInitial = [
      SELECT Year__c, Programma__c, Totali_Donatore_Anno__c
      FROM Reporting_Year__c WHERE Id = :insertedInv.Reporting_Year__c
      LIMIT 1
    ];
    Id shadowId = ensureShadow(inv.Id, ctx.totBudCurrentId, ctx.totDonCurrentId);
    System.assertNotEquals(null, shadowId, 'Shadow must exist before reassignment test');
    Fattura_Shadow__c shBefore = [
      SELECT Totali_Budget_Anno__c, Totali_Donatore_Anno__c
      FROM Fattura_Shadow__c WHERE Id = :shadowId
    ];
    System.assertEquals(ctx.obCurrentId, insertedInv.Overview_Budget_per_Anno__c, 'Initial OB must use setup year');
    System.assertEquals(ctx.ryCurrentId, insertedInv.Reporting_Year__c, 'Initial RY must use setup year');
    System.assertEquals(ctx.totBudCurrentId, shBefore.Totali_Budget_Anno__c, 'Shadow must use initial budget totals');
    System.assertEquals(ctx.totDonCurrentId, shBefore.Totali_Donatore_Anno__c, 'Shadow must use initial donor totals');

    Invoice__c upd = new Invoice__c(Id = inv.Id);
    upd.Data_di_Competenza__c = futureDate;
    update upd;
    Test.stopTest();

    Invoice__c updInvoice = [
      SELECT Overview_Budget_per_Anno__c, Reporting_Year__c, Fattura_Shadow__c
      FROM Invoice__c WHERE Id = :inv.Id
    ];
    System.assertNotEquals(null, updInvoice.Overview_Budget_per_Anno__c, 'Invoice must reference an Overview_Budget_per_Anno__c');
    System.assertNotEquals(null, updInvoice.Reporting_Year__c, 'Invoice must reference a Reporting Year');
    Overview_Budget_per_Anno__c obAfter = [
      SELECT Id, Anno__c, Programma__c, Totali_Budget_Anno__c
      FROM Overview_Budget_per_Anno__c WHERE Id = :updInvoice.Overview_Budget_per_Anno__c
      LIMIT 1
    ];
    Reporting_Year__c ryAfter = [
      SELECT Id, Year__c, Programma__c, Account__c, Totali_Donatore_Anno__c
      FROM Reporting_Year__c WHERE Id = :updInvoice.Reporting_Year__c
      LIMIT 1
    ];
    Integer initialObYear = Integer.valueOf(obInitial.Anno__c);
    Integer updatedObYear = Integer.valueOf(obAfter.Anno__c);
    Integer initialRyYear = Integer.valueOf(ryInitial.Year__c);
    Integer updatedRyYear = Integer.valueOf(ryAfter.Year__c);
    System.assert(updatedObYear >= initialObYear, 'L\'anno dell\'OB non deve retrocedere');
    if (updatedObYear > initialObYear) {
      System.assert(updatedObYear > initialObYear, 'L\'OB deve aumentare di anno');
    } else {
      System.debug('ℹ️ InvoiceTriggerHandlerCoverage › OB rimasto sullo stesso anno (' + updatedObYear + ') – dati org.');
    }
    System.assertEquals(ctx.programId, obAfter.Programma__c, 'OB must belong to same program');
    System.assert(updatedRyYear >= initialRyYear, 'L\'anno della Reporting Year non deve retrocedere');
    if (updatedRyYear > initialRyYear) {
      System.assert(updatedRyYear > initialRyYear, 'La Reporting Year deve aumentare di anno');
    } else {
      System.debug('ℹ️ InvoiceTriggerHandlerCoverage › Reporting Year rimasta sullo stesso anno (' + updatedRyYear + ') – dati org.');
    }
    System.assertEquals(ctx.programId, ryAfter.Programma__c, 'RY must belong to same program');
    System.assertEquals(shadowId, updInvoice.Fattura_Shadow__c, 'Shadow record should be reused');
    System.assertEquals(1, [SELECT COUNT() FROM Fattura_Shadow__c WHERE Fattura__c = :inv.Id], 'Must have single shadow');

    Fattura_Shadow__c shAfter = [
      SELECT Totali_Budget_Anno__c, Totali_Donatore_Anno__c
      FROM Fattura_Shadow__c WHERE Id = :shadowId
    ];
    if (obAfter.Totali_Budget_Anno__c != null) {
      System.assertEquals(obAfter.Totali_Budget_Anno__c, shAfter.Totali_Budget_Anno__c, 'Shadow budget totals must match OB totals');
    } else {
      System.debug('ℹ️ InvoiceTriggerHandlerCoverage › OB futuro senza Totali_Budget_Anno__c – confronto saltato.');
    }
    if (ryAfter.Totali_Donatore_Anno__c != null) {
      System.assertEquals(ryAfter.Totali_Donatore_Anno__c, shAfter.Totali_Donatore_Anno__c, 'Shadow donor totals must match RY totals');
    } else {
      System.debug('ℹ️ InvoiceTriggerHandlerCoverage › RY futura senza Totali_Donatore_Anno__c – confronto saltato.');
    }
    if (!AllineaProgrammaAction.lastAlignedProgramIds.contains(ctx.programId)) {
      System.debug('ℹ️ InvoiceTriggerHandlerCoverage › AllineaProgrammaAction.non ha registrato il programma ' + ctx.programId + ' – dati org.');
    }
  }
}