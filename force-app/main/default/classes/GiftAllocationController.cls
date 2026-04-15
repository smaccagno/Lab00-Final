public with sharing class GiftAllocationController {
  // DTO usato direttamente come option per il combobox in LWC
  public class IdLabel {
    @AuraEnabled
    public Id value; // ➜ value nell’option
    @AuraEnabled
    public String label; // ➜ label nell’option
    public IdLabel(Id v, String l) {
      value = v;
      label = l;
    }
  }

  /**
   * Restituisce i GiftDesignation collegati ai partner (Account)
   * iscritti al Programma in stato IsActive = true.
   */
  @AuraEnabled(cacheable=true)
  public static List<IdLabel> getBudgets(Id programId) {
    if (programId == null)
      return new List<IdLabel>();

    List<ProgramEnrollment> enrollments = [
      SELECT AccountId
      FROM ProgramEnrollment
      WHERE ProgramId = :programId AND IsActive = TRUE
    ];

    Set<Id> accountIds = new Set<Id>();
    for (ProgramEnrollment pe : enrollments)
      if (pe.AccountId != null)
        accountIds.add(pe.AccountId);

    if (accountIds.isEmpty())
      return new List<IdLabel>();

    List<GiftDesignation> gds = [
      SELECT Id, Name
      FROM GiftDesignation
      WHERE
        Partner__c IN :accountIds
        AND Program__c = :programId
        AND DEFAULT_PRG__c = FALSE
    ];

    List<IdLabel> result = new List<IdLabel>();
    for (GiftDesignation gd : gds)
      result.add(new IdLabel(gd.Id, gd.Name));

    return result;
  }

  /**
   * Ritorna il CurrentAmount della GiftTransaction passata.
   */
  @AuraEnabled(cacheable=true)
  public static Decimal getCurrentAmount(Id giftTransactionId) {
    if (giftTransactionId == null)
      return 0;
    GiftTransaction gt = [
      SELECT CurrentAmount
      FROM GiftTransaction
      WHERE Id = :giftTransactionId
      LIMIT 1
    ];
    return gt.CurrentAmount == null ? 0 : gt.CurrentAmount;
  }
}