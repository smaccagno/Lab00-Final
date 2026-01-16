@IsTest(SeeAllData=true)
private class AccountDynamicTableCtrlTest {
  /**
   * Verifica che getAccountTables:
   *  • non restituisca mai null;
   *  • popoli correttamente header, colonne e – se presenti – righe.
   */
  static void testGetAccountTables() {
    /* --- eventuale pre-setup dati (inseriamo un Account se mancano righe) --- */
    ensureAtLeastOneAccountPerFirstValidRT();

    Test.startTest();
    List<AccountDynamicTableCtrl.TableDTO> tables = AccountDynamicTableCtrl.getAccountTables();
    Test.stopTest();

    /* --- la lista non deve mai essere null --- */
    System.assertNotEquals(
      null,
      tables,
      'Il metodo deve restituire sempre una lista (anche vuota).'
    );

    for (AccountDynamicTableCtrl.TableDTO table : tables) {
      /* ---------- header record-type ---------- */
      System.assertNotEquals(
        null,
        table.recordTypeId,
        'recordTypeId non deve essere null.'
      );
      System.assertNotEquals(
        null,
        table.recordTypeDeveloperName,
        'recordTypeDeveloperName non deve essere null.'
      );
      System.assertNotEquals(
        null,
        table.recordTypeLabel,
        'recordTypeLabel non deve essere null.'
      );

      /* ---------- colonne ---------- */
      System.assertNotEquals(
        null,
        table.columns,
        'columns non deve essere null.'
      );
      if (!table.columns.isEmpty()) {
        AccountDynamicTableCtrl.ColumnDTO col = table.columns[0];
        System.assertNotEquals(
          null,
          col.label,
          'label colonna non deve essere null.'
        );
        System.assertNotEquals(
          null,
          col.fieldName,
          'fieldName colonna non deve essere null.'
        );
        System.assertNotEquals(
          null,
          col.type,
          'type colonna non deve essere null.'
        );
      }

      /* ---------- righe ---------- */
      System.assertNotEquals(null, table.rows, 'rows non deve essere null.');
      if (!table.rows.isEmpty()) {
        Map<String, Object> firstRow = table.rows[0];
        System.assert(
          firstRow.containsKey('Id'),
          'Ogni riga deve contenere la chiave "Id".'
        );
      }
    }
    /* Se la lista è vuota è corretto: significa che nell’org
     non esistono Record-Type con Field-Set omonimo. */
  }

  /**
   * Inserisce (best-effort) un Account per il primo Record-Type che ha
   * un Field-Set omonimo, in modo da percorrere anche il ramo delle righe.
   * L’operazione è racchiusa in try/catch per evitare errori in org
   * con campi obbligatori ulteriori.
   */
  @TestVisible
  private static void ensureAtLeastOneAccountPerFirstValidRT() {
    Schema.DescribeSObjectResult accDescribe = Account.SObjectType.getDescribe();
    Map<String, Schema.FieldSet> fsByName = accDescribe.fieldSets.getMap();
    Map<String, Schema.RecordTypeInfo> rtByDev = accDescribe.getRecordTypeInfosByDeveloperName();

    for (Schema.RecordTypeInfo rtInfo : rtByDev.values()) {
      if (!rtInfo.isAvailable() || rtInfo.isMaster())
        continue;
      if (!fsByName.containsKey(rtInfo.getDeveloperName()))
        continue;

      /* se esistono già Account per questo RT, non facciamo nulla */
      if (
        ![
            SELECT Id
            FROM Account
            WHERE RecordTypeId = :rtInfo.getRecordTypeId()
            LIMIT 1
          ]
          .isEmpty()
      ) {
        return;
      }

      /* altrimenti proviamo ad inserirne uno minimale */
      try {
        Account a = new Account(
          Name = 'Test Account (Unit-Test)',
          RecordTypeId = rtInfo.getRecordTypeId()
        );
        insert a;
      } catch (Exception e) {
        /* in molte org potrebbero esserci campi obbligatori:
         se l’inserimento fallisce non blocchiamo il test */
      }
      return; // tentiamo solo sul primo RT valido
    }
  }
}