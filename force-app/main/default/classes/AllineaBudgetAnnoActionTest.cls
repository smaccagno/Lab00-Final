@IsTest
private class AllineaBudgetAnnoActionTest {
  /*-----------------------------------------------------------
   *  DATI DI BASE – Eseguito una sola volta per l’intera classe
   *---------------------------------------------------------*/
  @TestSetup
  static void setup() {
    /* 1. Partner (Account) --------------------------------*/
    Account partner = new Account(
      Name = 'Partner Test'
      // Nome_Donatore__c è formula → non scrivibile
    );
    insert partner;

    /* 2. Program ------------------------------------------*/
    Program prog = new Program(Name = 'Programma Test');
    insert prog;

    /* 3. Budget / GiftDesignation -------------------------*/
    GiftDesignation gd = new GiftDesignation(
      Name = 'Budget Test',
      Program__c = prog.Id,
      Partner__c = partner.Id
    );
    insert gd;

    /* 4. ProgramEnrollment (serve per firstEnroll) --------*/
    ProgramEnrollment pe = new ProgramEnrollment(
      AccountId = partner.Id,
      ProgramId = prog.Id,
      IsActive = true,
      StartDate = Date.today().addYears(-2)
    );
    insert pe;

    /* 5. Anni di reportistica -----------------------------*/
    Anno_Reportistica__c ar2024 = new Anno_Reportistica__c(
      Name = '2024',
      Programma__c = prog.Id
    );
    Anno_Reportistica__c ar2025 = new Anno_Reportistica__c(
      Name = '2025',
      Programma__c = prog.Id
    );
    insert new List<Anno_Reportistica__c>{ ar2024, ar2025 };

    /* 6. OBA esistente per il 2024 ------------------------*/
    Overview_Budget_per_Anno__c oba2024 = new Overview_Budget_per_Anno__c(
      Name = 'Budget -  - Programma Test - 2024',
      Budget__c = gd.Id,
      Anno_Reportistica__c = ar2024.Id,
      Programma__c = prog.Id,
      Anno__c = '2024',
      Ammontare_Pagamenti_Da_Pagare__c = 999
    );
    insert oba2024;
  }

  /*============================================================
   * 1. Ramo principale – input con budgetId
   *==========================================================*/
  @IsTest
  static void testExecute_withBudgetId() {
    GiftDesignation gd = [SELECT Id FROM GiftDesignation LIMIT 1];

    AllineaBudgetAnnoAction.Input inputRec = new AllineaBudgetAnnoAction.Input();
    inputRec.budgetId = gd.Id;

    Test.startTest();
    List<AllineaBudgetAnnoAction.Output> res = AllineaBudgetAnnoAction.execute(
      new List<AllineaBudgetAnnoAction.Input>{ inputRec }
    );
    Test.stopTest();

    System.assertEquals(1, res.size(), 'Deve restituire un solo Output');
    System.assert(
      !String.isBlank(res[0].message),
      'Messaggio di output obbligatorio'
    );

    /* --- verifica inserimento OBA 2025 + collegamento Totali --- */
    Overview_Budget_per_Anno__c oba2025 = [
      SELECT Totali_Budget_Anno__c
      FROM Overview_Budget_per_Anno__c
      WHERE Anno__c = '2025' AND Budget__c = :gd.Id
      LIMIT 1
    ];
    System.assert(
      oba2025.Totali_Budget_Anno__c != null,
      'Il lookup Totali_Budget_Anno__c deve essere valorizzato'
    );
  }

  /*============================================================
   * 2. Ramo “risalita al Budget” – input con budgetAnnoId
   *==========================================================*/
  @IsTest
  static void testExecute_withBudgetAnnoId() {
    Overview_Budget_per_Anno__c oba2024 = [
      SELECT
        Id,
        Ammontare_Pagamenti_Da_Pagare__c,
        Ammontare_Pagamenti_Da_Pagare_formula__c
      FROM Overview_Budget_per_Anno__c
      WHERE Anno__c = '2024'
      LIMIT 1
    ];

    Decimal beforeStatic = oba2024.Ammontare_Pagamenti_Da_Pagare__c;
    Decimal beforeFormula = oba2024.Ammontare_Pagamenti_Da_Pagare_formula__c;

    AllineaBudgetAnnoAction.Input inputRec = new AllineaBudgetAnnoAction.Input();
    inputRec.budgetAnnoId = oba2024.Id;

    Test.startTest();
    List<AllineaBudgetAnnoAction.Output> res = AllineaBudgetAnnoAction.execute(
      new List<AllineaBudgetAnnoAction.Input>{ inputRec }
    );
    Test.stopTest();

    System.assertEquals(1, res.size(), 'Deve restituire un solo Output');
    System.assert(
      !String.isBlank(res[0].message),
      'Messaggio di output obbligatorio'
    );

    /* --- il campo statico deve essere riallineato alla formula --- */
    oba2024 = [
      SELECT
        Ammontare_Pagamenti_Da_Pagare__c,
        Ammontare_Pagamenti_Da_Pagare_formula__c
      FROM Overview_Budget_per_Anno__c
      WHERE Id = :oba2024.Id
    ];

    Decimal afterStatic = oba2024.Ammontare_Pagamenti_Da_Pagare__c;
    Decimal afterFormula = oba2024.Ammontare_Pagamenti_Da_Pagare_formula__c;

    // 1) condizione forte: devono coincidere dopo l’allineamento
    System.assertEquals(
      afterFormula,
      afterStatic,
      'Il campo statico deve combaciare con la formula dopo l’allineamento'
    );

    // 2) verifichiamo il “cambiamento” solo se prima erano diversi
    if (beforeStatic != beforeFormula) {
      System.assert(
        afterStatic != beforeStatic,
        'Il valore statico doveva cambiare perché prima era diverso dalla formula'
      );
    }
  }

  /*============================================================
   * 3. Early-exit – lista di input vuota
   *==========================================================*/
  @IsTest
  static void testExecute_withEmptyInput() {
    Test.startTest();
    List<AllineaBudgetAnnoAction.Output> res = AllineaBudgetAnnoAction.execute(
      new List<AllineaBudgetAnnoAction.Input>()
    );
    Test.stopTest();

    System.assertEquals(1, res.size(), 'È atteso un solo Output');
    System.assertEquals(
      'Nessun elemento in input',
      res[0].message,
      'Messaggio errato per lista di input vuota'
    );
  }
}