public without sharing class InvoiceTriggerHandler {
  private static Boolean isReentry = false;
  private static Boolean skipAlignment = false;
  private static Set<Id> programsToAlign = new Set<Id>();
  
  public static void setSkipAlignment(Boolean skip) {
    skipAlignment = skip;
  }

  // Minimal DML helper to bypass sharing only for shadow inserts
  private without sharing class ShadowDml {
    public void insertAll(List<Fattura_Shadow__c> records) {
      insert records;
    }
  }

  public static void run(Boolean isBefore, Boolean isAfter, Boolean isInsert, Boolean isUpdate, Boolean isDelete,
                         List<Invoice__c> newList, Map<Id, Invoice__c> oldMap, List<Invoice__c> oldList) {
    if (isBefore) {
      if (isInsert || isUpdate) {
        programsToAlign = new Set<Id>();
      }
      if (isInsert || isUpdate) {
        beforeUpsert(newList, oldMap);
      }
    }
    if (isAfter) {
      if (isInsert || isUpdate) {
        afterUpsert(newList, oldMap);
      }
    }
    if (isDelete) {
      beforeDelete(oldList);
    }
  }

  /*──────────────────────────────────────────────────────────────────
   * BEFORE INSERT/UPDATE
   * - Enforce uniqueness (Invoice_Number__c + Date__c + Medical_Center__c)
   * - Resolve Overview_Budget_per_Anno__c from Budget__c + Anno
   * - Resolve Reporting_Year__c (and Account__c if needed) from Program/Year
   *─────────────────────────────────────────────────────────────────*/
  private static void beforeUpsert(List<Invoice__c> news, Map<Id, Invoice__c> oldMap) {
    if (news.isEmpty()) return;

    // Skip records flagged to bypass
    List<Invoice__c> work = new List<Invoice__c>();
    for (Invoice__c inv : news) {
      if (inv.Bypass_Flow__c == true) continue;
      work.add(inv);
    }
    if (work.isEmpty()) return;

    Map<Id, Invoice__c> workById = new Map<Id, Invoice__c>();
    Map<Id, String> newAnnoByInv = new Map<Id, String>();
    Set<Id> yearChanged = new Set<Id>();
    Set<Id> budgetChanged = new Set<Id>();
    Set<Id> accountChanged = new Set<Id>();
    if (oldMap == null) oldMap = new Map<Id, Invoice__c>();
    for (Invoice__c inv : work) {
      workById.put(inv.Id, inv);
      String currAnno = resolveAnno(inv);
      newAnnoByInv.put(inv.Id, currAnno);
      Invoice__c oldInv = oldMap.get(inv.Id);
      if (oldInv == null) continue;
      String prevAnno = resolveAnno(oldInv);
      if (currAnno != prevAnno) yearChanged.add(inv.Id);
      if (inv.Budget__c != oldInv.Budget__c) budgetChanged.add(inv.Id);
      if (inv.Account__c != oldInv.Account__c) accountChanged.add(inv.Id);
    }

    // 0) Resolve default/free Account as early as possible
    Id defaultAccountId = null, freeAccountId = null;
    for (Account a : [SELECT Id, DEFAULT__c, GRATUITO__c FROM Account WHERE DEFAULT__c = true OR GRATUITO__c = true LIMIT 200]) {
      if (a.DEFAULT__c == true && defaultAccountId == null) defaultAccountId = a.Id;
      if (a.GRATUITO__c == true && freeAccountId == null) freeAccountId = a.Id;
    }
    for (Invoice__c inv : work) {
      if (inv.Account__c == null) {
        if (inv.Prestazione_Gratuita__c == true && freeAccountId != null) inv.Account__c = freeAccountId;
        else if (defaultAccountId != null) inv.Account__c = defaultAccountId;
      }
    }

    // 1) Uniqueness within this batch
    Set<String> batchKeys = new Set<String>();
    for (Invoice__c inv : work) {
      String k = key(inv.Invoice_Number__c, inv.Date__c, inv.Medical_Center__c);
      if (k != null) {
        if (batchKeys.contains(k)) {
          inv.addError('Numero fattura già presente per stessa data e centro medico (batch).');
        } else {
          batchKeys.add(k);
        }
      }
    }

    // 2) Uniqueness vs DB (query superset by IN on individual fields, then reduce in Apex)
    Set<String> keys = new Set<String>();
    Set<String> nums = new Set<String>();
    Set<Date> dates = new Set<Date>();
    Set<String> centers = new Set<String>();
    for (Invoice__c inv : work) {
      String k = key(inv.Invoice_Number__c, inv.Date__c, inv.Medical_Center__c);
      if (k == null) continue;
      keys.add(k);
      nums.add(inv.Invoice_Number__c);
      dates.add(inv.Date__c);
      centers.add(inv.Medical_Center__c);
    }
    if (!keys.isEmpty()) {
      List<Invoice__c> cands = [
        SELECT Id, Invoice_Number__c, Date__c, Medical_Center__c
        FROM Invoice__c
        WHERE Invoice_Number__c IN :nums
          AND Date__c IN :dates
          AND Medical_Center__c IN :centers
      ];
      Map<String, Set<Id>> keyToIds = new Map<String, Set<Id>>();
      for (Invoice__c other : cands) {
        String otherKey = key(other.Invoice_Number__c, other.Date__c, other.Medical_Center__c);
        if (otherKey == null) continue;
        if (!keyToIds.containsKey(otherKey)) keyToIds.put(otherKey, new Set<Id>());
        keyToIds.get(otherKey).add(other.Id);
      }
      for (Invoice__c inv : work) {
        String k = key(inv.Invoice_Number__c, inv.Date__c, inv.Medical_Center__c);
        if (k == null) continue;
        Boolean dup = false;
        Set<Id> ids = keyToIds.get(k);
        if (ids != null && !ids.isEmpty()) {
          if (inv.Id == null) {
            dup = true;
          } else if (ids.size() > 1 || !ids.contains(inv.Id)) {
            dup = true;
          }
        }
        if (dup) {
          inv.addError('Non puoi usare questo numero di fattura perché ne esiste già uno a sistema per la stessa data.');
        }
      }
    }

    // 3) Resolve Overview_Budget_per_Anno__c from Budget__c + Anno (senza scrivere campi su Invoice)
    Map<String, Id> obByBudgetAnno = new Map<String, Id>();
    Set<Id> budIds = new Set<Id>();
    Set<String> anni = new Set<String>();
    Set<Id> invNeedsOb = new Set<Id>();
    Map<Id, Id> fallbackObByBudget = new Map<Id, Id>();
    for (Invoice__c inv : work) {
      String anno = newAnnoByInv.get(inv.Id);
      Boolean yearOrBudgetChanged = yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id);
      if (inv.Budget__c != null && !String.isBlank(anno)) {
        if (inv.Overview_Budget_per_Anno__c == null || yearOrBudgetChanged) {
          budIds.add(inv.Budget__c);
          anni.add(anno);
          invNeedsOb.add(inv.Id);
        }
      }
    }
    if (!budIds.isEmpty() && !anni.isEmpty()) {
      List<Overview_Budget_per_Anno__c> obs = [
        SELECT Id, Budget__c, Anno__c, Programma__c
        FROM Overview_Budget_per_Anno__c
        WHERE Budget__c IN :budIds AND Anno__c IN :anni
      ];
      for (Overview_Budget_per_Anno__c o : obs) {
        obByBudgetAnno.put(String.valueOf(o.Budget__c) + '|' + o.Anno__c, o.Id);
      }
    }
    for (Invoice__c inv : work) {
      String anno = newAnnoByInv.get(inv.Id);
      Boolean yearOrBudgetChanged = yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id);
      Id obId = null;
      if (invNeedsOb.contains(inv.Id) && inv.Budget__c != null && !String.isBlank(anno)) {
        obId = obByBudgetAnno.get(String.valueOf(inv.Budget__c) + '|' + anno);
        if (obId == null) {
          if (!fallbackObByBudget.containsKey(inv.Budget__c)) {
            List<Overview_Budget_per_Anno__c> anyOb = [
              SELECT Id FROM Overview_Budget_per_Anno__c
              WHERE Budget__c = :inv.Budget__c
              LIMIT 2
            ];
            if (anyOb.size() == 1) {
              fallbackObByBudget.put(inv.Budget__c, anyOb[0].Id);
            } else {
              fallbackObByBudget.put(inv.Budget__c, null);
            }
          }
          obId = fallbackObByBudget.get(inv.Budget__c);
        }
      }
      if (obId != null) {
        inv.Overview_Budget_per_Anno__c = obId;
      } else if (yearOrBudgetChanged) {
        inv.Overview_Budget_per_Anno__c = null;
      }
    }

    // 5) Resolve Reporting_Year__c (based on Program + Year)
    //    Program is taken from OB.Programma__c if available, otherwise from Invoice.Programma__c
    Set<Id> obIds = new Set<Id>();
    for (Invoice__c inv : work) if (inv.Overview_Budget_per_Anno__c != null) obIds.add(inv.Overview_Budget_per_Anno__c);
    for (Invoice__c oldInv : oldMap.values())
      if (oldInv != null && oldInv.Overview_Budget_per_Anno__c != null)
        obIds.add(oldInv.Overview_Budget_per_Anno__c);
    Map<Id, Overview_Budget_per_Anno__c> obById = new Map<Id, Overview_Budget_per_Anno__c>();
    if (!obIds.isEmpty()) {
      obById = new Map<Id, Overview_Budget_per_Anno__c>([
        SELECT Id, Programma__c
        FROM Overview_Budget_per_Anno__c
        WHERE Id IN :obIds
      ]);
    }

    // Fallback: derive Program from Budget when missing
    Set<Id> budIdsForProg = new Set<Id>();
    for (Invoice__c inv : work) if (inv.Budget__c != null && inv.Programma__c == null) budIdsForProg.add(inv.Budget__c);
    for (Invoice__c oldInv : oldMap.values())
      if (oldInv != null && oldInv.Budget__c != null && oldInv.Programma__c == null)
        budIdsForProg.add(oldInv.Budget__c);
    Map<Id, Id> budToProgram = new Map<Id, Id>();
    if (!budIdsForProg.isEmpty()) {
      for (GiftDesignation gd : [SELECT Id, Program__c FROM GiftDesignation WHERE Id IN :budIdsForProg])
        budToProgram.put(gd.Id, gd.Program__c);
    }

    // Collect RY query keys
    Set<String> ryKeys = new Set<String>();
    Map<Id, String> invToRyKey = new Map<Id, String>();
    Set<Id> invNeedsRyClear = new Set<Id>();
    for (Invoice__c inv : work) {
      Boolean mustResolve = inv.Reporting_Year__c == null
        || yearChanged.contains(inv.Id)
        || budgetChanged.contains(inv.Id)
        || accountChanged.contains(inv.Id);
      if (!mustResolve) continue;

      String anno = newAnnoByInv.get(inv.Id);
      if (String.isBlank(anno)) {
        if (yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id)) invNeedsRyClear.add(inv.Id);
        continue;
      }

      Id programId = null;
      if (inv.Overview_Budget_per_Anno__c != null && obById.containsKey(inv.Overview_Budget_per_Anno__c)) {
        programId = obById.get(inv.Overview_Budget_per_Anno__c).Programma__c;
      }
      if (programId == null) programId = inv.Programma__c;
      if (programId == null && inv.Budget__c != null && budToProgram.containsKey(inv.Budget__c)) {
        programId = budToProgram.get(inv.Budget__c);
      }
      if (programId == null) {
        if (yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id)) invNeedsRyClear.add(inv.Id);
        continue;
      }

      Id accId = inv.Account__c;
      if (accId == null) {
        if (yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id) || accountChanged.contains(inv.Id)) invNeedsRyClear.add(inv.Id);
        continue;
      }
      String ky = String.valueOf(accId).left(18) + '|' + anno + '|' + programId;
      ryKeys.add(ky);
      invToRyKey.put(inv.Id, ky);
    }

    if (!ryKeys.isEmpty()) {
      Map<String, Id> ryByKey = new Map<String, Id>();
      for (Reporting_Year__c ry : [
        SELECT Id, Account__c, Year__c, Programma__c
        FROM Reporting_Year__c
        WHERE Account__c != null AND Year__c != null AND Programma__c != null
      ]) {
        String ky = String.valueOf(ry.Account__c).left(18) + '|' + ry.Year__c + '|' + ry.Programma__c;
        if (!ryByKey.containsKey(ky)) ryByKey.put(ky, ry.Id);
      }
      for (Invoice__c inv : work) {
        String ky = invToRyKey.get(inv.Id);
        if (ky != null) {
          Id ryId = ryByKey.get(ky);
          if (ryId != null) {
            inv.Reporting_Year__c = ryId;
            invNeedsRyClear.remove(inv.Id);
          } else if (yearChanged.contains(inv.Id) || budgetChanged.contains(inv.Id)) {
            invNeedsRyClear.add(inv.Id);
          }
        }
      }
    }
    for (Id invId : invNeedsRyClear) {
      if (workById.containsKey(invId)) {
        workById.get(invId).Reporting_Year__c = null;
      }
    }

    for (Invoice__c inv : work) {
      registerProgramForAlignment(inv, obById, budToProgram);
      Invoice__c oldInv = oldMap.get(inv.Id);
      if (oldInv != null) registerProgramForAlignment(oldInv, obById, budToProgram);
    }
  }

  /*──────────────────────────────────────────────────────────────────
   * AFTER INSERT/UPDATE
   * - Create Fattura_Shadow__c if missing and link it back
   *─────────────────────────────────────────────────────────────────*/
  private static void afterUpsert(List<Invoice__c> news, Map<Id, Invoice__c> oldMap) {
    if (isReentry) return; // avoid loops
    if (skipAlignment) return; // skip alignment when explicitly set
    if (news.isEmpty()) return;

    List<Invoice__c> work = new List<Invoice__c>();
    for (Invoice__c inv : news) {
      if (inv.Bypass_Flow__c == true) continue;
      work.add(inv);
    }
    if (work.isEmpty()) return;

    // Need OB.Totali_Budget_Anno__c and RY.Totali_Donatore_Anno__c
    Set<Id> obIds = new Set<Id>();
    Set<Id> ryIds = new Set<Id>();
    for (Invoice__c inv : work) {
      if (inv.Overview_Budget_per_Anno__c != null) obIds.add(inv.Overview_Budget_per_Anno__c);
      if (inv.Reporting_Year__c != null) ryIds.add(inv.Reporting_Year__c);
    }
    Map<Id, Overview_Budget_per_Anno__c> obById = new Map<Id, Overview_Budget_per_Anno__c>();
    Map<Id, Reporting_Year__c> ryById = new Map<Id, Reporting_Year__c>();
    if (!obIds.isEmpty()) {
      obById = new Map<Id, Overview_Budget_per_Anno__c>([
        SELECT Id, Totali_Budget_Anno__c
        FROM Overview_Budget_per_Anno__c WHERE Id IN :obIds
      ]);
    }
    if (!ryIds.isEmpty()) {
      ryById = new Map<Id, Reporting_Year__c>([
        SELECT Id, Totali_Donatore_Anno__c
        FROM Reporting_Year__c WHERE Id IN :ryIds
      ]);
    }

    Map<Id, Id> desiredTotBud = new Map<Id, Id>();
    Map<Id, Id> desiredTotDon = new Map<Id, Id>();
    Set<Id> existingShadowIds = new Set<Id>();
    for (Invoice__c inv : work) {
      Id totBud = (inv.Overview_Budget_per_Anno__c != null && obById.containsKey(inv.Overview_Budget_per_Anno__c))
        ? obById.get(inv.Overview_Budget_per_Anno__c).Totali_Budget_Anno__c : null;
      Id totDon = (inv.Reporting_Year__c != null && ryById.containsKey(inv.Reporting_Year__c))
        ? ryById.get(inv.Reporting_Year__c).Totali_Donatore_Anno__c : null;
      desiredTotBud.put(inv.Id, totBud);
      desiredTotDon.put(inv.Id, totDon);

      if (inv.Fattura_Shadow__c != null) {
        existingShadowIds.add(inv.Fattura_Shadow__c);
      }
    }

    List<Fattura_Shadow__c> toInsert = new List<Fattura_Shadow__c>();
    Map<Id, Id> invToShadow = new Map<Id, Id>();
    for (Invoice__c inv : work) {
      if (inv.Fattura_Shadow__c != null) continue;
      Id totBud = desiredTotBud.get(inv.Id);
      Id totDon = desiredTotDon.get(inv.Id);
      // Crea la shadow solo se possiamo valorizzare i lookup richiesti
      if (totBud == null || totDon == null) continue;
      Fattura_Shadow__c sh = new Fattura_Shadow__c();
      sh.Name = inv.Name + ' - Shadow';
      sh.Fattura__c = inv.Id;
      sh.Totali_Budget_Anno__c = totBud;
      sh.Totali_Donatore_Anno__c = totDon;
      toInsert.add(sh);
    }

    if (!toInsert.isEmpty()) {
      // Insert shadows without sharing to avoid cross-reference access errors
      // when linking to Totali_* records not visible to the running user
      new ShadowDml().insertAll(toInsert);
      for (Fattura_Shadow__c sh : toInsert) invToShadow.put(sh.Fattura__c, sh.Id);
      List<Invoice__c> upd = new List<Invoice__c>();
      for (Invoice__c inv : work) {
        Id shId = invToShadow.get(inv.Id);
        if (shId != null) {
          Invoice__c u = new Invoice__c(Id = inv.Id, Fattura_Shadow__c = shId);
          upd.add(u);
        }
      }
      if (!upd.isEmpty()) {
        isReentry = true;
        try { update upd; } finally { isReentry = false; }
      }
    }

    if (!existingShadowIds.isEmpty()) {
      Map<Id, Fattura_Shadow__c> shadowById = new Map<Id, Fattura_Shadow__c>([
        SELECT Id, Fattura__c, Totali_Budget_Anno__c, Totali_Donatore_Anno__c
        FROM Fattura_Shadow__c WHERE Id IN :existingShadowIds
      ]);
      List<Fattura_Shadow__c> shadowUpdates = new List<Fattura_Shadow__c>();
      for (Fattura_Shadow__c sh : shadowById.values()) {
        Id invId = sh.Fattura__c;
        Id targetBud = desiredTotBud.get(invId);
        Id targetDon = desiredTotDon.get(invId);
        Boolean needsUpdate = false;
        Fattura_Shadow__c upd = new Fattura_Shadow__c(Id = sh.Id);
        if (targetBud != sh.Totali_Budget_Anno__c) {
          upd.Totali_Budget_Anno__c = targetBud;
          needsUpdate = true;
        }
        if (targetDon != sh.Totali_Donatore_Anno__c) {
          upd.Totali_Donatore_Anno__c = targetDon;
          needsUpdate = true;
        }
        if (needsUpdate) shadowUpdates.add(upd);
      }
      if (!shadowUpdates.isEmpty()) update shadowUpdates;
    }

    if (!programsToAlign.isEmpty()) {
      List<AllineaProgrammaAction.Input> inputs = new List<AllineaProgrammaAction.Input>();
      for (Id progId : programsToAlign) {
        if (progId == null) continue;
        AllineaProgrammaAction.Input rec = new AllineaProgrammaAction.Input();
        rec.programId = String.valueOf(progId);
        inputs.add(rec);
      }
      if (!inputs.isEmpty()) {
        AllineaProgrammaAction.run(inputs);
      }
      programsToAlign.clear();
    }
  }

  /*──────────────────────────────────────────────────────────────────
   * BEFORE DELETE
   * - Delete related Fattura_Shadow__c (by Fattura__c)
   *─────────────────────────────────────────────────────────────────*/
  private static void beforeDelete(List<Invoice__c> olds) {
    if (olds.isEmpty()) return;
    Set<Id> invIds = new Set<Id>();
    for (Invoice__c i : olds) invIds.add(i.Id);
    List<Fattura_Shadow__c> children = [SELECT Id FROM Fattura_Shadow__c WHERE Fattura__c IN :invIds];
    if (!children.isEmpty()) delete children;
  }

  private static String resolveAnno(Invoice__c inv) {
    if (inv == null) return null;
    if (inv.Data_di_Competenza__c != null) return String.valueOf(inv.Data_di_Competenza__c.year());
    if (!String.isBlank(inv.Anno_di_Competenza__c)) return inv.Anno_di_Competenza__c.trim();
    return null;
  }

  private static void registerProgramForAlignment(Invoice__c inv,
                                                  Map<Id, Overview_Budget_per_Anno__c> obById,
                                                  Map<Id, Id> budToProgram) {
    if (inv == null) return;
    Id programId = inv.Programma__c;
    if (programId == null && inv.Overview_Budget_per_Anno__c != null && obById != null && obById.containsKey(inv.Overview_Budget_per_Anno__c)) {
      programId = obById.get(inv.Overview_Budget_per_Anno__c).Programma__c;
    }
    if (programId == null && inv.Budget__c != null && budToProgram != null && budToProgram.containsKey(inv.Budget__c)) {
      programId = budToProgram.get(inv.Budget__c);
    }
    if (programId != null) programsToAlign.add(programId);
  }

  private static String key(String num, Date d, String center) {
    if (String.isBlank(num) || d == null || String.isBlank(center)) return null;
    return num + '|' + String.valueOf(d) + '|' + center;
  }
}
