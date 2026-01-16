/**
 *  ReportingYearEnd2EndAction  –  v3
 *
 *  • Crea Anno_Reportistica__c per ogni Program “Attivo” se non esiste già.
 *  • Per Account di tipo **Investor** ⇒ assicura Donor_Overview__c
 *      (e chiama AllineaDonatoreAnnoAction **solo** sui record pre-esistenti).
 *  • Per Account di tipo **Partner** **o Lab00** ⇒ assicura GiftDesignation (Budget)
 *      (e chiama AllineaBudgetAnnoAction **solo** sui record pre-esistenti).
 *
 *  Bulk-safe: 3 SOQL propri, 0 DML se i record esistono già;
 *  2 insert bulk se servono (Anni + Overview/Budget),
 *  le altre operazioni sono delegate alle due action ottimizzate.
 */
public without sharing class ReportingYearEnd2EndAction {
  /*====================  INVOCABLE TYPES  ====================*/
  public class Input {
    @InvocableVariable(required=true)
    public String yearName;
  }
  public class Output {
    @InvocableVariable
    public String message;
    Output(String m) {
      message = m;
    }
  }

  /*====================  ENTRY POINT  ========================*/
  @InvocableMethod
  public static List<Output> run(List<Input> inputs) {
    /* 0. Validazione anno ------------------------------------------------*/
    if (
      inputs == null ||
      inputs.isEmpty() ||
      String.isBlank(inputs[0].yearName)
    )
      return wrap('Nessun anno fornito');
    String yearName = inputs[0].yearName.trim();

    /* 1. Programmi attivi -----------------------------------------------*/
    List<Program> programs = [
      SELECT Id, Name
      FROM Program
      WHERE Status = 'Attivo'
    ];
    if (programs.isEmpty())
      return wrap('Nessun Program attivo trovato');

    Set<Id> programIds = new Set<Id>();
    Map<Id, String> progName = new Map<Id, String>();
    for (Program p : programs) {
      programIds.add(p.Id);
      progName.put(p.Id, p.Name);
    }

    /* 2. Anno_Reportistica (verifica / insert) --------------------------*/
    Map<String, Anno_Reportistica__c> annoByKey = new Map<String, Anno_Reportistica__c>();
    for (Anno_Reportistica__c ar : [
      SELECT Id, Programma__c
      FROM Anno_Reportistica__c
      WHERE Programma__c IN :programIds AND Name = :yearName
    ]) {
      annoByKey.put(key(ar.Programma__c, yearName), ar);
    }
    List<Anno_Reportistica__c> anniIns = new List<Anno_Reportistica__c>();
    for (Id progId : programIds) {
      String k = key(progId, yearName);
      if (!annoByKey.containsKey(k)) {
        anniIns.add(
          new Anno_Reportistica__c(Name = yearName, Programma__c = progId)
        );
        annoByKey.put(k, null); // prenota chiave
      }
    }
    if (!anniIns.isEmpty())
      insert anniIns;

    /* 3. ProgramEnrollment attivi ---------------------------------------*/
    List<ProgramEnrollment> enrolls = [
      SELECT
        Id,
        ProgramId,
        AccountId,
        Account.Type,
        Account.Name,
        Account.IsPersonAccount,
        Account.PersonContact.FirstName,
        Account.PersonContact.LastName
      FROM ProgramEnrollment
      WHERE ProgramId IN :programIds AND IsActive = TRUE
    ];

    Map<Id, Account> accById = new Map<Id, Account>();
    List<ProgramEnrollment> invEnrolls = new List<ProgramEnrollment>(); // Investor
    List<ProgramEnrollment> parEnrolls = new List<ProgramEnrollment>(); // Partner + Lab00

    for (ProgramEnrollment pe : enrolls) {
      accById.put(pe.AccountId, pe.Account);
      if (pe.Account.Type == 'Investor') {
        invEnrolls.add(pe);
      } else if (pe.Account.Type == 'Partner' || pe.Account.Type == 'Lab00') {
        parEnrolls.add(pe);
      }
    }
    if (invEnrolls.isEmpty() && parEnrolls.isEmpty())
      return wrap('Nessun Account con tipo Investor, Partner o Lab00');

    /* 4A. Donor Overview (Investor) ------------------------------------*/
    Map<String, Donor_Overview__c> ovByKey = new Map<String, Donor_Overview__c>();
    Set<Id> newOvIds = new Set<Id>();

    if (!invEnrolls.isEmpty()) {
      Set<Id> invAccIds = new Set<Id>();
      for (ProgramEnrollment pe : invEnrolls)
        invAccIds.add(pe.AccountId);

      for (Donor_Overview__c ov : [
        SELECT Id, Account__c, Programma__c
        FROM Donor_Overview__c
        WHERE Programma__c IN :programIds AND Account__c IN :invAccIds
      ]) {
        ovByKey.put(key(ov.Account__c, ov.Programma__c), ov);
      }

      List<Donor_Overview__c> ovIns = new List<Donor_Overview__c>();
      for (ProgramEnrollment pe : invEnrolls) {
        String k = key(pe.AccountId, pe.ProgramId);
        if (ovByKey.containsKey(k))
          continue;

        Account acc = accById.get(pe.AccountId);
        String label = acc.IsPersonAccount
          ? acc.PersonContact.FirstName + ' ' + acc.PersonContact.LastName
          : acc.Name;

        Donor_Overview__c nu = new Donor_Overview__c(
          Account__c = pe.AccountId,
          Programma__c = pe.ProgramId,
          Name = 'Overview - ' + label + ' - ' + progName.get(pe.ProgramId)
        );
        ovIns.add(nu);
        ovByKey.put(k, nu);
      }
      if (!ovIns.isEmpty()) {
        insert ovIns;
        for (Donor_Overview__c ov : ovIns)
          newOvIds.add(ov.Id);
      }
    }

    /* 4B. Budget (Partner + Lab00) -------------------------------------*/
    Map<String, GiftDesignation> budByKey = new Map<String, GiftDesignation>();
    Set<Id> newBudIds = new Set<Id>();

    if (!parEnrolls.isEmpty()) {
      Set<Id> parAccIds = new Set<Id>();
      for (ProgramEnrollment pe : parEnrolls)
        parAccIds.add(pe.AccountId);

      for (GiftDesignation gd : [
        SELECT Id, Partner__c, Program__c
        FROM GiftDesignation
        WHERE Program__c IN :programIds AND Partner__c IN :parAccIds
      ]) {
        budByKey.put(key(gd.Partner__c, gd.Program__c), gd);
      }

      List<GiftDesignation> budIns = new List<GiftDesignation>();
      for (ProgramEnrollment pe : parEnrolls) {
        String k = key(pe.AccountId, pe.ProgramId);
        if (budByKey.containsKey(k))
          continue;

        Account acc = accById.get(pe.AccountId);
        budIns.add(
          new GiftDesignation(
            Partner__c = pe.AccountId,
            Program__c = pe.ProgramId,
            Name = 'Budget - ' + acc.Name + ' - ' + progName.get(pe.ProgramId)
          )
        );
      }
      if (!budIns.isEmpty()) {
        insert budIns;
        for (GiftDesignation gd : budIns)
          newBudIds.add(gd.Id);
      }
    }

    /* 5A. Action per Overview  -----------------------------*/
    if (!ovByKey.isEmpty()) {
      List<AllineaDonatoreAnnoAction.Input> listOV = new List<AllineaDonatoreAnnoAction.Input>();
      for (Donor_Overview__c ov : ovByKey.values()) {
        AllineaDonatoreAnnoAction.Input i = new AllineaDonatoreAnnoAction.Input();
        i.overviewDonatoreId = ov.Id;
        listOV.add(i);
      }
      if (!listOV.isEmpty())
        AllineaDonatoreAnnoAction.execute(listOV);
    }

    /* 5B. Action per Budget -------------------------------*/
    if (!budByKey.isEmpty()) {
      List<AllineaBudgetAnnoAction.Input> listBD = new List<AllineaBudgetAnnoAction.Input>();
      for (GiftDesignation gd : budByKey.values()) {
        AllineaBudgetAnnoAction.Input i = new AllineaBudgetAnnoAction.Input();
        i.budgetId = gd.Id;
        listBD.add(i);
      }
      if (!listBD.isEmpty())
        AllineaBudgetAnnoAction.execute(listBD);
    }

    /* 6. Output ---------------------------------------------------------*/
    return wrap(
      'Anni creati: ' +
        anniIns.size() +
        ' | Overview creati: ' +
        newOvIds.size() +
        ' | Budget creati: ' +
        newBudIds.size()
    );
  }

  /*====================  HELPERS  ===============================*/
  private static String key(Object a, Object b) {
    return String.valueOf(a) + '|' + String.valueOf(b);
  }
  private static List<Output> wrap(String msg) {
    return new List<Output>{ new Output(msg) };
  }
}