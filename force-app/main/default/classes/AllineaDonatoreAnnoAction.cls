/**
 *  AllineaDonatoreAnnoAction
 *
 *  Replica in Apex (bulkificato) l’intero flow “Allinea Donatore Anno”,
 *  includendo la logica dei sub-flow:
 *    • Crea_Overview_Donatore_Anno
 *    • Aggiorna_Valori_Statici_Donatore_Anno_autolaunched
 *
 *  Compatibile con l’oggetto standard ProgramEnrollment.
 *  API 63.0
 */
public without sharing class AllineaDonatoreAnnoAction {
  /*======================================================================
   *  TIPI INVOCABILI
   *====================================================================*/
  public class Input {
    @InvocableVariable(label='Id Overview Donatore' required=false)
    public String overviewDonatoreId;
    @InvocableVariable(label='Id Donatore Anno' required=false)
    public String donatoreAnnoId;
  }

  public class Output {
    @InvocableVariable(label='Messaggio di esito')
    public String message;
    public Output(String msg) {
      this.message = msg;
    }
  }

  /*======================================================================
   *  METODO PRINCIPALE
   *====================================================================*/
  @InvocableMethod
  public static List<Output> execute(List<Input> inputList) {
    /*---------- VALIDAZIONE INPUT -----------------------------------*/
    if (inputList == null || inputList.isEmpty()) {
      return new List<Output>{ new Output('Nessun elemento in input') };
    }

    /*---------- RACCOLTA ID ----------------------------------------*/
    Set<Id> overviewIds = new Set<Id>();
    Set<Id> reportingYearIdsInp = new Set<Id>();

    for (Input req : inputList) {
      if (!String.isBlank(req.overviewDonatoreId))
        overviewIds.add((Id) req.overviewDonatoreId);
      if (!String.isBlank(req.donatoreAnnoId))
        reportingYearIdsInp.add((Id) req.donatoreAnnoId);
    }

    /* Se ho passato solo donatoreAnnoId devo risalire all’Overview */
    Map<Id, Reporting_Year__c> ryById = new Map<Id, Reporting_Year__c>();
    if (!reportingYearIdsInp.isEmpty()) {
      ryById.putAll(
        [
          SELECT Id, Donor_Overview__c, Anno__c
          FROM Reporting_Year__c
          WHERE Id IN :reportingYearIdsInp
        ]
      );
      for (Reporting_Year__c ry : ryById.values()) {
        overviewIds.add(ry.Donor_Overview__c);
      }
    }

    if (overviewIds.isEmpty())
      return new List<Output>{ new Output('Nessun Overview valido') };

    /*---------- DONOR OVERVIEW + RELAZIONI --------------------------*/
    Map<Id, Donor_Overview__c> donorOvById = new Map<Id, Donor_Overview__c>(
      [
        SELECT
          Id,
          Programma__c,
          Programma__r.Name,
          Account__c,
          Account__r.Nome_Donatore__c
        FROM Donor_Overview__c
        WHERE Id IN :overviewIds
      ]
    );

    if (donorOvById.isEmpty())
      return new List<Output>{ new Output('Id Overview non trovati') };

    /*---------- PROGRAM ENROLLMENT (primo anno) ---------------------*/
    Set<Id> accountIds = new Set<Id>();
    Set<Id> programIds = new Set<Id>();
    for (Donor_Overview__c ov : donorOvById.values()) {
      accountIds.add(ov.Account__c);
      programIds.add(ov.Programma__c);
    }

    Map<String, Date> firstEnrollYearByAccPrg = new Map<String, Date>();

    if (!accountIds.isEmpty()) {
      for (ProgramEnrollment pe : [
        SELECT AccountId, ProgramId, StartDate
        FROM ProgramEnrollment
        WHERE
          AccountId IN :accountIds
          AND ProgramId IN :programIds
          AND IsActive = TRUE
      ]) {
        String key = buildCompositeKey(pe.AccountId, pe.ProgramId);
        if (
          !firstEnrollYearByAccPrg.containsKey(key) ||
          pe.StartDate < firstEnrollYearByAccPrg.get(key)
        ) {
          firstEnrollYearByAccPrg.put(key, pe.StartDate);
        }
      }
    }

    /*---------- ANNI REPORTISTICA -----------------------------------*/
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

    /*---------- COSTRUZIONE COPPIE (overview, anno) -----------------*/
    List<PairKey> pairs = new List<PairKey>();

    for (Donor_Overview__c ov : donorOvById.values()) {
      /* anni forniti in input “singolo” */
      Set<Id> anniRilevanti = new Set<Id>();
      for (Reporting_Year__c ry : ryById.values()) {
        if (ry.Donor_Overview__c == ov.Id)
          anniRilevanti.add(ry.Anno__c);
      }

      /* tutti gli anni del programma, se non specificati */
      if (anniRilevanti.isEmpty()) {
        for (Anno_Reportistica__c ar : annoById.values()) {
          if (ar.Programma__c == ov.Programma__c)
            anniRilevanti.add(ar.Id);
        }
      }

      /* filtro anni < primo enrollment */
      String accPrgKey = buildCompositeKey(ov.Account__c, ov.Programma__c);
      Date firstStart = firstEnrollYearByAccPrg.get(accPrgKey);
      Integer firstYear = firstStart != null ? firstStart.year() : null;

      for (Id annoId : anniRilevanti) {
        Anno_Reportistica__c ar = annoById.get(annoId);
        if (ar == null)
          continue;

        Integer currentYear;
        try {
          currentYear = Integer.valueOf(ar.Name);
        } catch (Exception e) {
          continue;
        }

        if (firstYear == null || currentYear >= firstYear) {
          pairs.add(new PairKey(ov.Id, annoId));
        }
      }
    }

    if (pairs.isEmpty())
      return new List<Output>{ new Output('Nessun anno da processare') };

    /*---------- REPORTING_YEAR ESISTENTI -----------------------------*/
    Map<String, Reporting_Year__c> repYearsByComposite = new Map<String, Reporting_Year__c>();

    for (Reporting_Year__c ry : [
      SELECT Id, Name, Donor_Overview__c, Anno__c, Totali_Donatore_Anno__c
      FROM Reporting_Year__c
      WHERE Donor_Overview__c IN :overviewIds AND Anno__c IN :annoById.keySet()
    ]) {
      repYearsByComposite.put(
        buildCompositeKey(ry.Donor_Overview__c, ry.Anno__c),
        ry
      );
    }

    /*---------- TOTALI ESISTENTI -------------------------------------*/
    Set<Id> totaliIds = new Set<Id>();
    for (Reporting_Year__c ry : repYearsByComposite.values()) {
      if (ry.Totali_Donatore_Anno__c != null)
        totaliIds.add(ry.Totali_Donatore_Anno__c);
    }
    Map<Id, Totali_Donatore_Anno__c> totaliById = totaliIds.isEmpty()
      ? new Map<Id, Totali_Donatore_Anno__c>()
      : new Map<Id, Totali_Donatore_Anno__c>(
          [SELECT Id, Name FROM Totali_Donatore_Anno__c WHERE Id IN :totaliIds]
        );

    /*---------- LISTE DML -------------------------------------------*/
    List<Reporting_Year__c> repYearsToInsert = new List<Reporting_Year__c>();
    List<Reporting_Year__c> repYearsToUpdate = new List<Reporting_Year__c>();
    List<Totali_Donatore_Anno__c> totaliToInsert = new List<Totali_Donatore_Anno__c>();
    List<Totali_Donatore_Anno__c> totaliToUpdate = new List<Totali_Donatore_Anno__c>();
    Set<Id> existingRyIdsForStatic = new Set<Id>();

    for (PairKey pk : pairs) {
      Donor_Overview__c ov = donorOvById.get(pk.overviewId);
      Anno_Reportistica__c ar = annoById.get(pk.annoId);
      if (ov == null || ar == null)
        continue;

      String expectedRyName =
        ov.Account__r.Nome_Donatore__c +
        ' - ' +
        ov.Programma__r.Name +
        ' - ' +
        ar.Name;

      String compKey = pk.composite();
      Reporting_Year__c ry = repYearsByComposite.get(compKey);

      if (ry == null) {
        /* ===== CREAZIONE reporting year (sub-flow Crea_… ) ===== */
        ry = new Reporting_Year__c(
          Name = expectedRyName,
          Donor_Overview__c = pk.overviewId,
          Anno__c = pk.annoId,
          Account__c = ov.Account__c,
          Programma__c = ov.Programma__c,
          Year__c = ar.Name
        );
        repYearsToInsert.add(ry);
        // Niente static-update su record appena creati (rispecchia il flow)
      } else {
        /* ===== RECORD ESISTENTE ===== */
        existingRyIdsForStatic.add(ry.Id);

        if (ry.Name != expectedRyName) {
          ry.Name = expectedRyName;
          repYearsToUpdate.add(ry);
        }
      }
      pk.reportingYearRecord = ry;

      /* ===== TOTALI ===== */

      String expectedTotName = 'Totali ' + expectedRyName;

      if (ry.Totali_Donatore_Anno__c != null) {
        Totali_Donatore_Anno__c existingTot = totaliById.get(
          ry.Totali_Donatore_Anno__c
        );
        if (existingTot != null && existingTot.Name != expectedTotName) {
          existingTot.Name = expectedTotName;
          totaliToUpdate.add(existingTot); // ✅ update, non insert
        }
      } else {
        Totali_Donatore_Anno__c tot = new Totali_Donatore_Anno__c(
          Name = expectedTotName,
          Donatore_Programma__c = pk.overviewId,
          Donatore__c = ov.Account__c
        );
        totaliToInsert.add(tot);
        pk.newTotaliPlaceholder = tot;
      }
    }

    /*---------- DML PRINCIPALI ---------------------------------------*/
    if (!repYearsToInsert.isEmpty())
      insert repYearsToInsert;
    if (!repYearsToUpdate.isEmpty())
      update repYearsToUpdate;
    if (!totaliToInsert.isEmpty())
      insert totaliToInsert;
    if (!totaliToUpdate.isEmpty())
      update totaliToUpdate;

    /*---------- PATCH lookup Totali_Donatore_Anno__c -----------------*/
    List<Reporting_Year__c> repYearsToPatch = new List<Reporting_Year__c>();
    for (PairKey pk : pairs) {
      if (pk.newTotaliPlaceholder != null && pk.reportingYearRecord != null) {
        pk.reportingYearRecord.Totali_Donatore_Anno__c = pk.newTotaliPlaceholder.Id;
        repYearsToPatch.add(pk.reportingYearRecord);
      }
    }
    if (!repYearsToPatch.isEmpty())
      update repYearsToPatch;

    /*==================================================================
     *  LOGICA SUB-FLOW Aggiorna_Valori_Statici_Donatore_Anno
     *  (solo sugli Overview_Anno già esistenti)
     *==================================================================*/
    if (!existingRyIdsForStatic.isEmpty()) {
      List<Reporting_Year__c> rySnapshot = [
        SELECT
          Id,
          Donato_Originale_formula__c,
          Allocabile_formula__c,
          Totale_Numero_Donazioni_formula__c,
          Totale_Fattura_formula__c,
          Totale_Durata_Visite_formula__c,
          Totale_Numero_di_Visite_formula__c,
          Totale_Numero_Fatture_formula__c
        FROM Reporting_Year__c
        WHERE Id IN :existingRyIdsForStatic
      ];

      List<Reporting_Year__c> ryStaticUpdate = new List<Reporting_Year__c>();
      for (Reporting_Year__c ry : rySnapshot) {
        ryStaticUpdate.add(
          new Reporting_Year__c(
            Id = ry.Id,
            Ammontare_Originale_Donato_Anno_Corrente__c = ry.Donato_Originale_formula__c,
            Current_Year_Donation_Amount__c = ry.Allocabile_formula__c,
            Current_Year_Donation_Number__c = ry.Totale_Numero_Donazioni_formula__c,
            Total_Invoice_Amount__c = ry.Totale_Fattura_formula__c,
            Total_Minutes_of_Visits__c = ry.Totale_Durata_Visite_formula__c,
            Total_Visits_done__c = ry.Totale_Numero_di_Visite_formula__c,
            Totale_Numero_di_Fatture__c = ry.Totale_Numero_Fatture_formula__c
          )
        );
      }
      if (!ryStaticUpdate.isEmpty())
        update ryStaticUpdate; // 5° DML
    }

    /*---------- OUTPUT FINALE ----------------------------------------*/
    return new List<Output>{
      new Output(
        'Anni processati: ' +
          pairs.size() +
          ' | Insert OverviewAnno: ' +
          repYearsToInsert.size() +
          ' | Update OverviewAnno: ' +
          repYearsToUpdate.size() +
          ' | Insert Totali: ' +
          totaliToInsert.size() +
          ' | Static-update: ' +
          existingRyIdsForStatic.size()
      )
    };
  }

  /*======================================================================
   *  HELPER
   *====================================================================*/
  private class PairKey {
    Id overviewId;
    Id annoId;
    Totali_Donatore_Anno__c newTotaliPlaceholder;
    Reporting_Year__c reportingYearRecord;
    PairKey(Id o, Id a) {
      overviewId = o;
      annoId = a;
    }
    String composite() {
      return buildCompositeKey(overviewId, annoId);
    }
  }

  /** Chiave testuale Id1|Id2 per mappe composite */
  private static String buildCompositeKey(Id id1, Id id2) {
    return (id1 != null &&
      id2 != null)
      ? String.valueOf(id1) + '|' + String.valueOf(id2)
      : null;
  }
}