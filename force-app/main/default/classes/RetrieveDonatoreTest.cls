@IsTest(SeeAllData=true)
public class RetrieveDonatoreTest {
  @IsTest
  static void testGetRelatedRecords_WithData() {
    // Recupera un Donor_Overview__c esistente con Account__c valorizzato
    List<Donor_Overview__c> donors = [
      SELECT Account__c
      FROM Donor_Overview__c
      WHERE Account__c != NULL
      LIMIT 1
    ];

    if (donors.isEmpty()) {
      System.debug('⚠️ Nessun Donor_Overview__c trovato, test ignorato.');
      return; // skip del test se non ci sono dati
    }

    Id accountId = donors[0].Account__c;

    // Invoca il metodo aggiornato
    List<RetrieveDonatore.ProgramResult> results = RetrieveDonatore.getRelatedRecords(
      accountId
    );

    System.assertNotEquals(
      null,
      results,
      'La lista dei risultati non deve essere null'
    );

    // Se ci sono risultati, verifichiamo almeno un aggregato o un row
    for (RetrieveDonatore.ProgramResult result : results) {
      System.assertNotEquals(
        null,
        result.programmaId,
        'programmaId deve essere valorizzato'
      );
      System.assertNotEquals(
        null,
        result.programmaName,
        'programmaName deve essere valorizzato'
      );
      System.assertNotEquals(
        null,
        result.dynamicFields,
        'dynamicFields non deve essere null'
      );

      // Holding → ha aggregate + dettagli
      if (result.aggregate != null) {
        System.assertNotEquals(
          null,
          result.aggregate.donorName,
          'Aggregate: donorName deve essere valorizzato'
        );
        System.assert(
          result.dettagli != null,
          'Se esiste aggregate, deve esistere anche dettagli'
        );
      }
      // Non holding → ha solo rows
      else {
        System.assert(
          result.rows != null && !result.rows.isEmpty(),
          'Se non esiste aggregate, deve esistere rows'
        );
        RetrieveDonatore.DonorProgrammaAggregate first = result.rows[0];
        System.assertNotEquals(
          null,
          first.name,
          'name deve essere valorizzato'
        );
        System.assertNotEquals(
          null,
          first.donorLink,
          'donorLink deve essere valorizzato'
        );
      }
    }
  }
}