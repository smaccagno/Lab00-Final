public with sharing class RetrieveDonatore {
  public class DonorProgrammaAggregate {
    @AuraEnabled
    public String fakeId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id programmaId;
    @AuraEnabled
    public String programmaName;

    @AuraEnabled
    public Decimal totalOriginalDonation = 0;
    @AuraEnabled
    public Decimal totalAllocable = 0;
    @AuraEnabled
    public Integer totalDonations = 0;
    @AuraEnabled
    public Decimal totalInvoiced = 0;
    @AuraEnabled
    public Decimal notInvoiced = 0;
    @AuraEnabled
    public Integer numInvoices = 0;

    @AuraEnabled
    public String donorName;
    @AuraEnabled
    public String donorLink;

    @AuraEnabled
    public Map<String, Object> extraFields; // valori dinamici
  }

  public class ProgramResult {
    @AuraEnabled
    public Id programmaId;
    @AuraEnabled
    public String programmaName;
    @AuraEnabled
    public DonorProgrammaAggregate aggregate; // 🔵 riga aggregata (solo se holding)
    @AuraEnabled
    public List<DonorProgrammaAggregate> dettagli; // 🔵 figli (solo se holding)
    @AuraEnabled
    public List<DonorProgrammaAggregate> rows; // 🔵 fallback per figlio singolo
    @AuraEnabled
    public List<ProgramFieldConfigUtil.FieldConf> dynamicFields;
  }

  @AuraEnabled(cacheable=true)
  public static List<ProgramResult> getRelatedRecords(Id accountId) {
    if (accountId == null)
      throw new AuraHandledException('Id account non può essere nullo');

    // 1. Recupera il Donor_Overview principale
    Donor_Overview__c current = [
      SELECT Id, Account__c, Holding__c, Nome_Donatore__c
      FROM Donor_Overview__c
      WHERE Account__c = :accountId
      LIMIT 1
    ];

    Boolean isHolding = String.isBlank(current.Holding__c);
    String holdingId15 = String.valueOf(current.Account__c).substring(0, 15);

    // 2. Recupera i Programmi attivi
    List<ProgramEnrollment> enrollments = ProgramEnrollmentService.getActiveEnrollmentsByAccount(
      accountId
    );
    if (enrollments.isEmpty())
      return new List<ProgramResult>();

    Set<Id> programIds = new Set<Id>();
    Map<Id, String> programNames = new Map<Id, String>();
    for (ProgramEnrollment pe : enrollments) {
      programIds.add(pe.ProgramId);
      programNames.put(pe.ProgramId, pe.Program.Name);
    }

    // 3. Recupera tutti i Donor_Overview rilevanti per i programmi attivi
    // 3. Costruisci i campi della SELECT
    Set<String> baseFields = new Set<String>{
      'Id',
      'Name',
      'Account__c',
      'Holding__c',
      'Programma__c',
      'Programma__r.Name',
      'Nome_Donatore__c',
      'Total_Original_Donation_Amount__c',
      'Total_Donation_Amount_formula__c',
      'Total_Donation_Number__c',
      'Total_Invoice_Amount__c',
      'Totale_Numero_Fatture__c',
      'Not_Invoiced_Amount__c'
    };

    // Aggiungi tutti i campi dinamici da tutti i programmi
    Set<String> dynamicFieldsGlobal = new Set<String>();
    for (Id progId : programIds) {
      String progName = programNames.get(progId);
      String devName = progName.replace(' ', '_');
      Map<String, List<ProgramFieldConfigUtil.FieldConf>> configMap = ProgramFieldConfigUtil.getFieldConfig(
        devName,
        new Set<String>{ 'Donor_Overview__c' },
        null
      );
      List<ProgramFieldConfigUtil.FieldConf> dynamicFields = configMap.get(
        'Donor_Overview__c'
      );

      if (dynamicFields != null) {
        for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
          dynamicFieldsGlobal.add(f.fieldApi);
        }
      }
    }

    for (String field : dynamicFieldsGlobal) {
      baseFields.add(field);
    }

    // Componi SELECT dinamica
    String query =
      'SELECT ' +
      String.join(new List<String>(baseFields), ', ') +
      ' FROM Donor_Overview__c' +
      ' WHERE Programma__c IN :programIds' +
      ' AND (Account__c = :accountId OR Holding__c = :holdingId15)';

    List<Donor_Overview__c> sourceRecords = Database.query(query);

    // 4. Raggruppa i record per Programma
    Map<Id, List<Donor_Overview__c>> groupedByProgram = new Map<Id, List<Donor_Overview__c>>();
    for (Donor_Overview__c r : sourceRecords) {
      if (!groupedByProgram.containsKey(r.Programma__c)) {
        groupedByProgram.put(r.Programma__c, new List<Donor_Overview__c>());
      }
      groupedByProgram.get(r.Programma__c).add(r);
    }

    List<ProgramResult> results = new List<ProgramResult>();

    for (Id progId : groupedByProgram.keySet()) {
      // Recupera dati base del programma
      String progName = programNames.get(progId);
      String devName = progName.replace(' ', '_');

      // Recupera metadati dei campi dinamici
      Map<String, List<ProgramFieldConfigUtil.FieldConf>> configMap = ProgramFieldConfigUtil.getFieldConfig(
        devName,
        new Set<String>{ 'Donor_Overview__c' },
        null
      );
      List<ProgramFieldConfigUtil.FieldConf> dynamicFields = configMap.get(
        'Donor_Overview__c'
      );

      // Crea lista dei field API da includere
      Set<String> dynamicFieldSet = new Set<String>();
      if (dynamicFields != null) {
        for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
          dynamicFieldSet.add(f.fieldApi);
        }
      }

      // Record da usare per questo programma
      List<Donor_Overview__c> programRecords = groupedByProgram.get(progId);
      List<DonorProgrammaAggregate> allRows = new List<DonorProgrammaAggregate>();

      for (Donor_Overview__c rec : programRecords) {
        DonorProgrammaAggregate row = new DonorProgrammaAggregate();
        row.fakeId = progId + String.valueOf(Crypto.getRandomLong());
        row.programmaId = progId;
        row.programmaName = progName;
        row.name = progName;
        row.donorName = rec.Nome_Donatore__c;
        row.donorLink = '/' + rec.Id;

        row.totalOriginalDonation = rec.Total_Original_Donation_Amount__c !=
          null
          ? rec.Total_Original_Donation_Amount__c
          : 0;
        row.totalAllocable = rec.Total_Donation_Amount_formula__c != null
          ? rec.Total_Donation_Amount_formula__c
          : 0;
        row.totalDonations = rec.Total_Donation_Number__c != null
          ? Integer.valueOf(rec.Total_Donation_Number__c)
          : 0;
        row.totalInvoiced = rec.Total_Invoice_Amount__c != null
          ? rec.Total_Invoice_Amount__c
          : 0;
        row.notInvoiced = rec.Not_Invoiced_Amount__c != null
          ? rec.Not_Invoiced_Amount__c
          : 0;
        row.numInvoices = rec.Totale_Numero_Fatture__c != null
          ? Integer.valueOf(rec.Totale_Numero_Fatture__c)
          : 0;

        row.extraFields = new Map<String, Object>();
        for (String field : dynamicFieldSet) {
          try {
            row.extraFields.put(field, rec.get(field));
          } catch (Exception e) {
            row.extraFields.put(field, null);
          }
        }

        allRows.add(row);
      }

      ProgramResult result = new ProgramResult();
      result.programmaId = progId;
      result.programmaName = progName;
      result.dynamicFields = dynamicFields;

      if (isHolding) {
        List<DonorProgrammaAggregate> figli = new List<DonorProgrammaAggregate>();
        for (DonorProgrammaAggregate r : allRows) {
          if (String.valueOf(r.donorLink).substring(1, 16) != holdingId15) {
            figli.add(r);
          }
        }

        DonorProgrammaAggregate agg = new DonorProgrammaAggregate();
        agg.fakeId = progId + '_agg';
        agg.programmaId = progId;
        agg.programmaName = progName;
        agg.name = 'Totale Holding';
        agg.donorName = current.Nome_Donatore__c;
        agg.donorLink = '/' + current.Id;
        agg.extraFields = new Map<String, Object>();

        for (DonorProgrammaAggregate r : allRows) {
          agg.totalOriginalDonation += r.totalOriginalDonation;
          agg.totalAllocable += r.totalAllocable;
          agg.totalDonations += r.totalDonations;
          agg.totalInvoiced += r.totalInvoiced;
          agg.notInvoiced += r.notInvoiced;
          agg.numInvoices += r.numInvoices;

          for (String k : r.extraFields.keySet()) {
            Object val = r.extraFields.get(k);
            if (val instanceof Decimal || val instanceof Integer) {
              Object prev = agg.extraFields.get(k);
              Decimal sum =
                ((Decimal) (prev != null ? prev : 0)) +
                ((Decimal) (val != null ? val : 0));
              agg.extraFields.put(k, sum);
            }
          }
        }

        result.aggregate = agg;
        result.dettagli = figli;
      } else {
        result.rows = allRows;
      }

      results.add(result);
    }
    return results;
  }
}