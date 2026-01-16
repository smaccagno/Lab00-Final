public with sharing class StaticFieldsCopy {

    public class InputWrapper {
        @InvocableVariable(required=false)
        public String recordId;

        @InvocableVariable(required=false)
        public String programId;
    }

    public class OutputWrapper {
        @InvocableVariable
        public String message;
    }

    @InvocableMethod(label='Copia Valori da Campi Formula' description='Copia i valori statici dai campi formula per Anno e Programma')
    public static List<OutputWrapper> copiaValori(List<InputWrapper> inputList) {
        InputWrapper input = inputList[0];
        copiaValoriInterna(input.recordId, input.programId);

        OutputWrapper out = new OutputWrapper();
        out.message = 'Copia completata';
        return new List<OutputWrapper>{ out };
    }

    public static void copiaValoriInterna(String recordId, String programId) {
        // ------------------------
        // Query per BUDGET
        // ------------------------
        String budgetQuery = 
            'SELECT Id, Programma__c, Ammontare_Pagamenti_Da_Pagare_formula__c, Ammontare_Pagamenti_Fatti_formula__c, ' +
            'Numero_di_Fatture_formula__c, Numero_Distribuzioni_Formula__c, Totale_Ammontare_Fatture_formula__c, ' +
            'Totale_Distribuito_NON_Pagato_Formula__c, Totale_Distribuito_Pagato_Formula__c, Totale_Minuti_di_Visita_formula__c, ' +
            'Totale_Numero_di_Visite_formula__c, Ammontare_Pagamenti_Da_Pagare__c, Ammontare_Pagamenti_Fatti__c, ' +
            'Numero_di_Fatture__c, Numero_Distribuzioni__c, Totale_Ammontare_Fatture__c, Totale_Distribuito_NON_Pagato__c, ' +
            'Totale_Distribuito_Pagato__c, Totale_Minuti_di_Visita__c, Totale_Numero_di_Visite__c ' +
            'FROM Overview_Budget_per_Anno__c';

    List<String> budgetConditions = new List<String>();
    if (String.isNotBlank(recordId)) {
        budgetConditions.add('Anno_Reportistica__c = :recordId');
    }
    if (String.isNotBlank(programId)) {
        budgetConditions.add('Programma__c = :programId');
    }
    String budgetWhere = budgetConditions.isEmpty() ? '' : ' WHERE ' + String.join(budgetConditions, ' AND ');
    List<Overview_Budget_per_Anno__c> budgets = Database.query(budgetQuery + budgetWhere);

    // ------------------------
    // Query per REPORTING YEAR
    // ------------------------
    String yearQuery = 
        'SELECT Id, Programma__c, Donato_Originale_formula__c, Totale_Numero_Donazioni_formula__c, Totale_Fattura_formula__c, ' +
        'Totale_Durata_Visite_formula__c, Totale_Numero_di_Visite_formula__c, Totale_Numero_Fatture_formula__c, ' +
        'Totale_Allocato_formula__c, Ammontare_Originale_Donato_Anno_Corrente__c, Current_Year_Donation_Number__c, ' +
        'Current_Year_Donation_Amount__c, Total_Minutes_of_Visits__c, Total_Visits_done__c, Totale_Numero_di_Fatture__c, ' +
        'Total_Invoice_Amount__c ' +
        'FROM Reporting_Year__c';

    List<String> yearConditions = new List<String>();
    if (String.isNotBlank(recordId)) {
        yearConditions.add('Anno__c = :recordId');
    }
    if (String.isNotBlank(programId)) {
        yearConditions.add('Programma__c = :programId');
    }
    String yearWhere = yearConditions.isEmpty() ? '' : ' WHERE ' + String.join(yearConditions, ' AND ');
    List<Reporting_Year__c> years = Database.query(yearQuery + yearWhere);

        List<Overview_Budget_per_Anno__c> budgetsToUpdate = new List<Overview_Budget_per_Anno__c>();
        for (Overview_Budget_per_Anno__c b : budgets) {
            Boolean changed = false;
            if (b.Ammontare_Pagamenti_Da_Pagare__c != b.Ammontare_Pagamenti_Da_Pagare_formula__c) {
                b.Ammontare_Pagamenti_Da_Pagare__c = b.Ammontare_Pagamenti_Da_Pagare_formula__c; changed = true;
            }
            if (b.Ammontare_Pagamenti_Fatti__c != b.Ammontare_Pagamenti_Fatti_formula__c) {
                b.Ammontare_Pagamenti_Fatti__c = b.Ammontare_Pagamenti_Fatti_formula__c; changed = true;
            }
            if (b.Numero_di_Fatture__c != b.Numero_di_Fatture_formula__c) {
                b.Numero_di_Fatture__c = b.Numero_di_Fatture_formula__c; changed = true;
            }
            if (b.Numero_Distribuzioni__c != b.Numero_Distribuzioni_Formula__c) {
                b.Numero_Distribuzioni__c = b.Numero_Distribuzioni_Formula__c; changed = true;
            }
            if (b.Totale_Ammontare_Fatture__c != b.Totale_Ammontare_Fatture_formula__c) {
                b.Totale_Ammontare_Fatture__c = b.Totale_Ammontare_Fatture_formula__c; changed = true;
            }
            if (b.Totale_Distribuito_NON_Pagato__c != b.Totale_Distribuito_NON_Pagato_Formula__c) {
                b.Totale_Distribuito_NON_Pagato__c = b.Totale_Distribuito_NON_Pagato_Formula__c; changed = true;
            }
            if (b.Totale_Distribuito_Pagato__c != b.Totale_Distribuito_Pagato_Formula__c) {
                b.Totale_Distribuito_Pagato__c = b.Totale_Distribuito_Pagato_Formula__c; changed = true;
            }
            if (b.Totale_Minuti_di_Visita__c != b.Totale_Minuti_di_Visita_formula__c) {
                b.Totale_Minuti_di_Visita__c = b.Totale_Minuti_di_Visita_formula__c; changed = true;
            }
            if (b.Totale_Numero_di_Visite__c != b.Totale_Numero_di_Visite_formula__c) {
                b.Totale_Numero_di_Visite__c = b.Totale_Numero_di_Visite_formula__c; changed = true;
            }

            if (changed) budgetsToUpdate.add(b);
        }

        List<Reporting_Year__c> yearsToUpdate = new List<Reporting_Year__c>();
        for (Reporting_Year__c y : years) {
            Boolean changed = false;
            if (y.Ammontare_Originale_Donato_Anno_Corrente__c != y.Donato_Originale_formula__c) {
                y.Ammontare_Originale_Donato_Anno_Corrente__c = y.Donato_Originale_formula__c; changed = true;
            }
            if (y.Current_Year_Donation_Number__c != y.Totale_Numero_Donazioni_formula__c) {
                y.Current_Year_Donation_Number__c = y.Totale_Numero_Donazioni_formula__c; changed = true;
            }
            if (y.Current_Year_Donation_Amount__c != y.Totale_Allocato_formula__c) {
                y.Current_Year_Donation_Amount__c = y.Totale_Allocato_formula__c; changed = true;
            }
            if (y.Total_Minutes_of_Visits__c != y.Totale_Durata_Visite_formula__c) {
                y.Total_Minutes_of_Visits__c = y.Totale_Durata_Visite_formula__c; changed = true;
            }
            if (y.Total_Visits_done__c != y.Totale_Numero_di_Visite_formula__c) {
                y.Total_Visits_done__c = y.Totale_Numero_di_Visite_formula__c; changed = true;
            }
            if (y.Totale_Numero_di_Fatture__c != y.Totale_Numero_Fatture_formula__c) {
                y.Totale_Numero_di_Fatture__c = y.Totale_Numero_Fatture_formula__c; changed = true;
            }
            if (y.Total_Invoice_Amount__c != y.Totale_Fattura_formula__c) {
                y.Total_Invoice_Amount__c = y.Totale_Fattura_formula__c; changed = true;
            }

            if (changed) yearsToUpdate.add(y);
        }

        if (!budgetsToUpdate.isEmpty()) update budgetsToUpdate;
        if (!yearsToUpdate.isEmpty()) update yearsToUpdate;
    }
}