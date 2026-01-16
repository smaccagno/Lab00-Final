/**
 *  AllineaBudgetAnnoAction
 *
 *  Bulk-safe Apex che replica il flow “Allinea Budget Anno”.
 *  API 63.0
 */
public without sharing class AllineaBudgetAnnoAction {
  /*==================================================================
   *  INVOCABLE TYPES
   *================================================================*/
  public class Input {
    @InvocableVariable(required=false)
    public String budgetId;

    @InvocableVariable(required=false)
    public String budgetAnnoId;
  }

  public class Output {
    @InvocableVariable
    public String message;
    public Output(String msg) {
      message = msg;
    }
  }

  /*==================================================================
   *  ENTRY POINT
   *================================================================*/
  @InvocableMethod
  public static List<Output> execute(List<Input> inputs) {
    /* 1. Validazione */
    if (inputs == null || inputs.isEmpty())
      return wrap('Nessun elemento in input');

    /* 2. Raccolta id di partenza */
    Set<Id> budgetIds = new Set<Id>();
    Set<Id> budgetAnnoIds = new Set<Id>();

    for (Input inRec : inputs) {
      if (!String.isBlank(inRec.budgetId))
        budgetIds.add((Id) inRec.budgetId);
      if (!String.isBlank(inRec.budgetAnnoId))
        budgetAnnoIds.add((Id) inRec.budgetAnnoId);
    }

    /* 3. Se ho solo budgetAnnoId ➜ risalgo al Budget */
    if (!budgetAnnoIds.isEmpty()) {
      for (Overview_Budget_per_Anno__c oba : [
        SELECT Budget__c
        FROM Overview_Budget_per_Anno__c
        WHERE Id IN :budgetAnnoIds
      ]) {
        budgetIds.add(oba.Budget__c);
      }
    }
    if (budgetIds.isEmpty())
      return wrap('Nessun Budget valido');

    /* 4. Query Budget (GiftDesignation) */
    Map<Id, GiftDesignation> budgetById = new Map<Id, GiftDesignation>(
      [
        SELECT
          Id,
          Program__c,
          Program__r.Name,
          Partner__c,
          Partner__r.Nome_Donatore__c
        FROM GiftDesignation
        WHERE Id IN :budgetIds
      ]
    );

    if (budgetById.isEmpty())
      return wrap('Id Budget non trovati');

    /* 5. Primo anno di ProgramEnrollment ------------------------ */
    Set<Id> partnerIds = new Set<Id>();
    Set<Id> programIds = new Set<Id>();
    for (GiftDesignation gd : budgetById.values()) {
      partnerIds.add(gd.Partner__c);
      programIds.add(gd.Program__c);
    }

    Map<String, Date> firstEnroll = new Map<String, Date>();
    if (!partnerIds.isEmpty()) {
      for (ProgramEnrollment pe : [
        SELECT AccountId, ProgramId, StartDate
        FROM ProgramEnrollment
        WHERE
          IsActive = TRUE
          AND AccountId IN :partnerIds
          AND ProgramId IN :programIds
      ]) {
        String k = key(pe.AccountId, pe.ProgramId);
        if (!firstEnroll.containsKey(k) || pe.StartDate < firstEnroll.get(k))
          firstEnroll.put(k, pe.StartDate);
      }
    }

    /* 6. Anni reportistica per i program ------------------------ */
    Map<Id, Anno_Reportistica__c> annoById = new Map<Id, Anno_Reportistica__c>();
    if (!programIds.isEmpty()) {
      for (Anno_Reportistica__c ar : [
        SELECT Id, Name, Programma__c
        FROM Anno_Reportistica__c
        WHERE Programma__c IN :programIds
      ]) {
        annoById.put(ar.Id, ar);
      }
    }

    /* 7. Coppie (Budget, Anno) --------------------------------- */
    List<PairKey> pairs = new List<PairKey>();

    Map<Id, Id> annoSingolo = new Map<Id, Id>();
    if (!budgetAnnoIds.isEmpty()) {
      for (Overview_Budget_per_Anno__c oba : [
        SELECT Id, Budget__c, Anno_Reportistica__c
        FROM Overview_Budget_per_Anno__c
        WHERE Id IN :budgetAnnoIds
      ]) {
        annoSingolo.put(oba.Budget__c, oba.Anno_Reportistica__c);
      }
    }

    for (GiftDesignation gd : budgetById.values()) {
      Set<Id> anniOk = new Set<Id>();
      if (annoSingolo.containsKey(gd.Id)) {
        anniOk.add(annoSingolo.get(gd.Id));
      } else {
        for (Anno_Reportistica__c ar : annoById.values())
          if (ar.Programma__c == gd.Program__c)
            anniOk.add(ar.Id);
      }

      String kAP = key(gd.Partner__c, gd.Program__c);
      Integer firstY = firstEnroll.containsKey(kAP)
        ? firstEnroll.get(kAP).year()
        : null;

      for (Id annoId : anniOk) {
        Anno_Reportistica__c ar = annoById.get(annoId);
        if (ar == null)
          continue;
        Integer y;
        try {
          y = Integer.valueOf(ar.Name);
        } catch (Exception e) {
          continue;
        }
        if (firstY == null || y >= firstY)
          pairs.add(new PairKey(gd.Id, annoId));
      }
    }
    if (pairs.isEmpty())
      return wrap('Nessun anno da processare');

    /* 8. Overview_Budget_per_Anno esistenti --------------------- */
    Map<String, Overview_Budget_per_Anno__c> obaByCmp = new Map<String, Overview_Budget_per_Anno__c>();
    for (Overview_Budget_per_Anno__c oba : [
      SELECT
        Id,
        Budget__c,
        Anno_Reportistica__c,
        Name,
        Totali_Budget_Anno__c,
        Anno__c
      FROM Overview_Budget_per_Anno__c
      WHERE
        Budget__c IN :budgetIds
        AND Anno_Reportistica__c IN :annoById.keySet()
    ]) {
      obaByCmp.put(key(oba.Budget__c, oba.Anno_Reportistica__c), oba);
    }

    /* 9. Totali esistenti --------------------------------------- */
    Set<Id> totIds = new Set<Id>();
    for (Overview_Budget_per_Anno__c o : obaByCmp.values())
      if (o.Totali_Budget_Anno__c != null)
        totIds.add(o.Totali_Budget_Anno__c);

    Map<Id, Totali_Budget_Anno__c> totById = totIds.isEmpty()
      ? new Map<Id, Totali_Budget_Anno__c>()
      : new Map<Id, Totali_Budget_Anno__c>(
          [SELECT Id, Name FROM Totali_Budget_Anno__c WHERE Id IN :totIds]
        );

    /* 10. Prepara DML ------------------------------------------- */
    List<Overview_Budget_per_Anno__c> obaIns = new List<Overview_Budget_per_Anno__c>(),
      obaUpd = new List<Overview_Budget_per_Anno__c>(),
      obaPatch = new List<Overview_Budget_per_Anno__c>();
    List<Totali_Budget_Anno__c> totIns = new List<Totali_Budget_Anno__c>();
    List<Totali_Budget_Anno__c> totUpd = new List<Totali_Budget_Anno__c>();
    Set<Id> existing = new Set<Id>();

    for (PairKey pk : pairs) {
      GiftDesignation gd = budgetById.get(pk.budgetId);
      Anno_Reportistica__c ar = annoById.get(pk.annoId);
      if (gd == null || ar == null)
        continue;

      String base =
        'Budget - ' +
        gd.Partner__r.Nome_Donatore__c +
        ' - ' +
        gd.Program__r.Name;
      String obaName = base + ' - ' + ar.Name;
      String totName = 'Totali ' + base + ' - ' + ar.Name;

      String cmp = pk.composite();
      Overview_Budget_per_Anno__c oba = obaByCmp.get(cmp);

      if (oba == null) {
        oba = new Overview_Budget_per_Anno__c(
          Name = obaName,
          Budget__c = gd.Id,
          Anno_Reportistica__c = ar.Id,
          Programma__c = gd.Program__c,
          Anno__c = ar.Name
        );
        obaIns.add(oba);
      } else {
        existing.add(oba.Id);
        Boolean needsUpdate = false;
        if (oba.Name != obaName) {
          oba.Name = obaName;
          needsUpdate = true;
        }
        if (oba.Anno__c != ar.Name) {
          oba.Anno__c = ar.Name;
          needsUpdate = true;
        }
        if (needsUpdate)
          obaUpd.add(oba);
      }
      pk.oba = oba;

      Totali_Budget_Anno__c existingTot = oba != null &&
        oba.Totali_Budget_Anno__c != null
        ? totById.get(oba.Totali_Budget_Anno__c)
        : null;

      if (existingTot != null) {
        if (existingTot.Name != totName) {
          existingTot.Name = totName;
          totUpd.add(existingTot);
        }
      } else {
        Totali_Budget_Anno__c t = new Totali_Budget_Anno__c(
          Name = totName,
          Budget__c = gd.Id,
          Donatore__c = gd.Partner__c
        );
        totIns.add(t);
        pk.tot = t;
      }
    }

    /* 11. DML bulk ---------------------------------------------- */
    if (!obaIns.isEmpty())
      insert obaIns;
    if (!obaUpd.isEmpty())
      update obaUpd;
    if (!totIns.isEmpty())
      insert totIns;
    if (!totUpd.isEmpty())
      update totUpd;

    for (PairKey p : pairs) {
      if (p.tot != null && p.oba != null) {
        p.oba.Totali_Budget_Anno__c = p.tot.Id;
        obaPatch.add(p.oba);
      }
    }
    if (!obaPatch.isEmpty())
      update obaPatch;

    /* 12. Aggiorna campi statici -------------------------------- */
    updateStaticFields(existing);

    /* 13. Output */
    return wrap(
      'Budget elaborati: ' +
        budgetIds.size() +
        ' | OBA insert ' +
        obaIns.size() +
        ', update ' +
        obaUpd.size() +
        ' | Totali insert ' +
        totIns.size() +
        ', update ' +
        totUpd.size()
    );
  }

  /*-------------- Helper struct & funcs ---------------------------*/
  private class PairKey {
    Id budgetId;
    Id annoId;
    Overview_Budget_per_Anno__c oba;
    Totali_Budget_Anno__c tot;
    PairKey(Id b, Id a) {
      budgetId = b;
      annoId = a;
    }
    String composite() {
      return key(budgetId, annoId);
    }
  }
  private static String key(Id a, Id b) {
    return String.valueOf(a) + '|' + String.valueOf(b);
  }
  private static List<Output> wrap(String msg) {
    return new List<Output>{ new Output(msg) };
  }
  /*==================================================================
   *  HELPER – Riallinea campi statici con le rispettive formule
   *================================================================*/
  private class FieldPair {
    String staticField;
    String formulaField;
    FieldPair(String s, String f) {
      staticField = s;
      formulaField = f;
    }
  }

  private static void updateStaticFields(Set<Id> obaIds) {
    if (obaIds == null || obaIds.isEmpty())
      return;

    /* 1. Mappatura campi statici ⇆ formule --------------------- */
    List<FieldPair> pairs = new List<FieldPair>{
      new FieldPair(
        'Ammontare_Pagamenti_Da_Pagare__c',
        'Ammontare_Pagamenti_Da_Pagare_formula__c'
      ),
      new FieldPair(
        'Ammontare_Pagamenti_Fatti__c',
        'Ammontare_Pagamenti_Fatti_formula__c'
      ),
      new FieldPair(
        'Numero_Distribuzioni_NON_Pagate_Static__c',
        'Numero_Distribuzioni_NON_Pagate__c'
      ),
      new FieldPair(
        'Numero_Distribuzioni__c',
        'Numero_Distribuzioni_Formula__c'
      ),
      new FieldPair('Numero_di_Fatture__c', 'Numero_di_Fatture_formula__c'),
      new FieldPair('Totale_Allocato_Static__c', 'Totale_Allocato__c'),
      new FieldPair(
        'Totale_Ammontare_Fatture__c',
        'Totale_Ammontare_Fatture_formula__c'
      ),
      new FieldPair(
        'Totale_Distribuito_NON_Pagato__c',
        'Totale_Distribuito_NON_Pagato_Formula__c'
      ),
      new FieldPair(
        'Totale_Distribuito_Pagato__c',
        'Totale_Distribuito_Pagato_Formula__c'
      ),
      new FieldPair(
        'Totale_Minuti_di_Visita__c',
        'Totale_Minuti_di_Visita_formula__c'
      ),
      new FieldPair(
        'Totale_Numero_di_Visite__c',
        'Totale_Numero_di_Visite_formula__c'
      )
    };

    /* 2. Costruzione dinamic-SOQL ----------------------------- */
    String soql = 'SELECT Id';
    for (FieldPair p : pairs)
      soql += ', ' + p.staticField + ', ' + p.formulaField;
    soql += ' FROM Overview_Budget_per_Anno__c WHERE Id IN :obaIds';

    List<Overview_Budget_per_Anno__c> obaRecords = Database.query(soql);
    List<Overview_Budget_per_Anno__c> updates = new List<Overview_Budget_per_Anno__c>();

    /* 3. Confronto & aggiornamento ---------------------------- */
    for (Overview_Budget_per_Anno__c oba : obaRecords) {
      Boolean changed = false;
      for (FieldPair p : pairs) {
        Object formulaVal = oba.get(p.formulaField);
        Object staticVal = oba.get(p.staticField);
        if (formulaVal != staticVal) {
          // gestisce anche i NULL
          oba.put(p.staticField, formulaVal);
          changed = true;
        }
      }
      if (changed)
        updates.add(oba);
    }
    /* 4. DML bulk -------------------------------------------- */
    if (!updates.isEmpty())
      update updates;
  }
}