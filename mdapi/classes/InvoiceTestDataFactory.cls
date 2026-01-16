public with sharing class InvoiceTestDataFactory {
  public class Setup {
    public Id programId;
    public Id budgetId;
    public Id obId;
    public Id accDefaultId;
    public Id accFreeId;
    public Id accNormalId;
    public Id ryNormalId;
    public Id ryFreeId;
    public Id ryDefaultId;
    public Id totBudId;
    public Id totDonId;
  }

  public static Setup createBase(String year) {
    Setup s = new Setup();

    Program prog = new Program(Name = 'Test Program');
    insert prog; s.programId = prog.Id;

    // Partner Account richiesto da GiftDesignation.Partner__c
    Account partnerAcc = new Account(Name = 'Partner Test');
    insert partnerAcc;

    GiftDesignation gd = new GiftDesignation(Name = 'Test Budget', Partner__c = partnerAcc.Id);
    try { gd.put('Program__c', s.programId); } catch (Exception ignore) {}
    insert gd; s.budgetId = gd.Id;

    // Donor Accounts (create Normal first to use it in Totali)
    Account accN = new Account(Name = 'Donor A');
    insert accN; s.accNormalId = accN.Id;
    Account accDef = new Account(Name = 'DEFAULT', DEFAULT__c = true);
    insert accDef; s.accDefaultId = accDef.Id;
    Account accFree = new Account(Name = 'GRATUITO', GRATUITO__c = true);
    insert accFree; s.accFreeId = accFree.Id;

    // Donor Overviews per Programma (richiesti da Reporting_Year__c)
    Donor_Overview__c ovNormal = new Donor_Overview__c(
      Account__c = s.accNormalId,
      Programma__c = s.programId,
      Name = 'Overview - Donor A - ' + [SELECT Name FROM Program WHERE Id = :s.programId].Name
    );
    insert ovNormal;
    Donor_Overview__c ovFree = new Donor_Overview__c(
      Account__c = s.accFreeId,
      Programma__c = s.programId,
      Name = 'Overview - GRATUITO - ' + [SELECT Name FROM Program WHERE Id = :s.programId].Name
    );
    insert ovFree;
    Donor_Overview__c ovDefault = new Donor_Overview__c(
      Account__c = s.accDefaultId,
      Programma__c = s.programId,
      Name = 'Overview - DEFAULT - ' + [SELECT Name FROM Program WHERE Id = :s.programId].Name
    );
    insert ovDefault;

    // Totali SObjects (populate required fields)
    SObject tb = (SObject) Schema.getGlobalDescribe().get('Totali_Budget_Anno__c').newSObject();
    tb.put('Name', 'TB');
    // Best guess: required link to Budget and Donor
    try { tb.put('Budget__c', s.budgetId); } catch (Exception ignore) {}
    try { tb.put('Donatore__c', s.accNormalId); } catch (Exception ignore) {}
    try { tb.put('Programma__c', s.programId); } catch (Exception ignore) {}
    try { tb.put('Anno__c', year); } catch (Exception ignore) {}
    insert tb; s.totBudId = (Id) tb.get('Id');

    SObject td = (SObject) Schema.getGlobalDescribe().get('Totali_Donatore_Anno__c').newSObject();
    td.put('Name', 'TD-Normal');
    try { td.put('Donatore__c', s.accNormalId); } catch (Exception ignore) {}
    try { td.put('Donatore_Programma__c', ovNormal.Id); } catch (Exception ignore) {}
    try { td.put('Year__c', year); } catch (Exception ignore) {}
    insert td; s.totDonId = (Id) td.get('Id');

    SObject tdDef = (SObject) Schema.getGlobalDescribe().get('Totali_Donatore_Anno__c').newSObject();
    tdDef.put('Name', 'TD-Default');
    try { tdDef.put('Donatore__c', s.accDefaultId); } catch (Exception ignore) {}
    try { tdDef.put('Donatore_Programma__c', ovDefault.Id); } catch (Exception ignore) {}
    try { tdDef.put('Year__c', year); } catch (Exception ignore) {}
    insert tdDef;

    SObject tdFree = (SObject) Schema.getGlobalDescribe().get('Totali_Donatore_Anno__c').newSObject();
    tdFree.put('Name', 'TD-Free');
    try { tdFree.put('Donatore__c', s.accFreeId); } catch (Exception ignore) {}
    try { tdFree.put('Donatore_Programma__c', ovFree.Id); } catch (Exception ignore) {}
    try { tdFree.put('Year__c', year); } catch (Exception ignore) {}
    insert tdFree;

    // Ensure Anno_Reportistica__c exists and link it
    Anno_Reportistica__c ar = new Anno_Reportistica__c(
      Name = year,
      Programma__c = s.programId
    );
    insert ar;

    Overview_Budget_per_Anno__c ob = new Overview_Budget_per_Anno__c(
      Name = 'OB '+year,
      Budget__c = s.budgetId,
      Anno__c = year,
      Programma__c = s.programId,
      Anno_Reportistica__c = ar.Id,
      Totali_Budget_Anno__c = s.totBudId
    );
    insert ob; s.obId = ob.Id;

    Reporting_Year__c ryN = new Reporting_Year__c(
      Name = 'RY '+year,
      Donor_Overview__c = ovNormal.Id,
      Anno__c = ar.Id,
      Account__c = s.accNormalId,
      Year__c = year,
      Programma__c = s.programId,
      Totali_Donatore_Anno__c = s.totDonId
    );
    insert ryN; s.ryNormalId = ryN.Id;

    Reporting_Year__c ryF = new Reporting_Year__c(
      Name = 'RY FREE '+year,
      Donor_Overview__c = ovFree.Id,
      Anno__c = ar.Id,
      Account__c = s.accFreeId,
      Year__c = year,
      Programma__c = s.programId,
      Totali_Donatore_Anno__c = (Id) tdFree.get('Id')
    );
    insert ryF; s.ryFreeId = ryF.Id;

    Reporting_Year__c ryD = new Reporting_Year__c(
      Name = 'RY DEFAULT '+year,
      Donor_Overview__c = ovDefault.Id,
      Anno__c = ar.Id,
      Account__c = s.accDefaultId,
      Year__c = year,
      Programma__c = s.programId,
      Totali_Donatore_Anno__c = (Id) tdDef.get('Id')
    );
    insert ryD; s.ryDefaultId = ryD.Id;

    return s;
  }
}